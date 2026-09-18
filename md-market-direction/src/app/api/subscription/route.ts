import { requireUser } from "@/lib/auth/guard";
import { effectiveTier } from "@/lib/auth/session";
import { createCheckoutSession, stripeConfigured } from "@/lib/billing/stripe";
import { TIERS, TIER_ORDER, type Tier } from "@/lib/config/tiers";
import { log, store } from "@/lib/db/store";
import { fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return ok({
    tier: effectiveTier(auth.user),
    subscription: auth.user.subscription,
    tiers: TIER_ORDER.map((t) => TIERS[t]),
    stripeConfigured: stripeConfigured(),
  });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => null);
  const action = body?.action ?? "upgrade";

  if (action === "cancel") {
    store.write((db) => {
      const u = db.users.find((x) => x.id === auth.user.id);
      if (!u) return;
      u.subscription = { ...u.subscription, status: "canceled" };
      u.tier = "free";
    });
    return ok({ ok: true, message: "Subscription cancelled. You keep Free access." });
  }

  const tier = body?.tier as Tier;
  if (!TIER_ORDER.includes(tier) || tier === "free") return fail("Choose Pro or Elite.");

  const origin = new URL(req.url).origin;
  try {
    const result = await createCheckoutSession({ tier, userId: auth.user.id, email: auth.user.email, origin });
    if (result.mode === "stripe" && result.url) {
      // The real entitlement is granted by the Stripe webhook, never by the client.
      return ok({ mode: "stripe", url: result.url, message: result.message });
    }
    // Demo mode: grant locally and say so plainly.
    store.write((db) => {
      const u = db.users.find((x) => x.id === auth.user.id);
      if (!u) return;
      u.tier = tier;
      u.subscription = {
        tier, status: "active", provider: "demo", externalId: null,
        currentPeriodEnd: Date.now() + 30 * 86_400_000, startedAt: Date.now(),
      };
    });
    log("info", "billing", `Demo upgrade to ${tier} for ${auth.user.email}`);
    return ok({ mode: "demo", url: null, message: result.message, tier });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Checkout failed.", 502);
  }
}

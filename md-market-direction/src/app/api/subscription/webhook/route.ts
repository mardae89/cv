import crypto from "node:crypto";
import { log, store } from "@/lib/db/store";
import type { Tier } from "@/lib/config/tiers";
import { fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * STRIPE WEBHOOK.
 * Entitlements are written here, server-side, after verifying the signature.
 * Client-reported subscription state is never trusted.
 */
function verifySignature(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return fail("Webhook not configured.", 501);

  const payload = await req.text();
  if (!verifySignature(payload, req.headers.get("stripe-signature"), secret)) {
    return fail("Invalid signature.", 400);
  }

  const event = JSON.parse(payload) as {
    type: string;
    data: { object: Record<string, unknown> };
  };
  const object = event.data.object;
  const metadata = (object.metadata ?? {}) as Record<string, string>;
  const userId = metadata.userId ?? (object.client_reference_id as string | undefined);
  const tier = metadata.tier as Tier | undefined;

  if (!userId) return ok({ received: true, ignored: "no user reference" });

  store.write((db) => {
    const user = db.users.find((u) => u.id === userId);
    if (!user) return;
    if (event.type === "checkout.session.completed" && tier) {
      user.tier = tier;
      user.subscription = {
        tier,
        status: "active",
        provider: "stripe",
        externalId: (object.subscription as string) ?? (object.id as string),
        currentPeriodEnd: Date.now() + 31 * 86_400_000,
        startedAt: Date.now(),
      };
    }
    if (event.type === "customer.subscription.deleted") {
      user.tier = "free";
      user.subscription = { ...user.subscription, status: "canceled" };
    }
    if (event.type === "customer.subscription.updated") {
      const periodEnd = Number(object.current_period_end);
      user.subscription = {
        ...user.subscription,
        status: (object.status as string) === "active" ? "active" : "canceled",
        currentPeriodEnd: Number.isFinite(periodEnd) ? periodEnd * 1000 : user.subscription.currentPeriodEnd,
      };
    }
  });

  log("info", "billing", `Stripe webhook handled: ${event.type}`);
  return ok({ received: true });
}

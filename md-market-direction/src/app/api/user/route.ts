import { currentUser, effectiveTier } from "@/lib/auth/session";
import { store } from "@/lib/db/store";
import { fail, ok } from "@/lib/api";
import { TIERS } from "@/lib/config/tiers";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return ok({ user: null });
  const tier = effectiveTier(user);
  return ok({
    user: {
      id: user.id, email: user.email, name: user.name, role: user.role,
      onboarded: user.onboarded, preferences: user.preferences, subscription: user.subscription,
    },
    tier,
    limits: TIERS[tier].limits,
  });
}

export async function PATCH(req: Request) {
  const user = await currentUser();
  if (!user) return fail("Authentication required.", 401);
  const body = await req.json().catch(() => null);
  if (!body) return fail("Invalid body.");

  const updated = store.write((db) => {
    const u = db.users.find((x) => x.id === user.id);
    if (!u) return null;
    if (typeof body.name === "string" && body.name.trim()) u.name = body.name.trim();
    if (body.preferences) {
      u.preferences = {
        ...u.preferences,
        ...body.preferences,
        markets: Array.isArray(body.preferences.markets) ? body.preferences.markets : u.preferences.markets,
      };
    }
    if (body.onboarded === true) u.onboarded = true;
    if (body.acceptDisclaimer === true) u.preferences.disclaimerAcceptedAt = Date.now();
    return u;
  });

  if (!updated) return fail("User not found.", 404);
  return ok({ user: { id: updated.id, name: updated.name, preferences: updated.preferences, onboarded: updated.onboarded } });
}

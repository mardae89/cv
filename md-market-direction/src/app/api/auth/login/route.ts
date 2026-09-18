import { authenticate, createSession } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api";
import { AUTH_SETUP_MESSAGE, authConfigured } from "@/lib/auth/session";
import { rateLimit } from "@/lib/auth/guard";
import { accountsAvailable } from "@/lib/auth/public";

export async function POST(req: Request) {
  if (!accountsAvailable()) {
    return fail(
      "Accounts need a database, and this deployment has no persistent storage. " +
        "Everything else works without signing in — your watchlist and alerts are saved in this browser.",
      503,
    );
  }
  if (!authConfigured()) return fail(AUTH_SETUP_MESSAGE, 503);
  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password) return fail("Email and password are required.");
  const limit = rateLimit(`login:${String(body.email).toLowerCase()}`, 10, 5 * 60_000);
  if (!limit.ok) return fail("Too many attempts. Try again in a few minutes.", 429);
  const { user, error } = authenticate(body.email, body.password);
  if (error || !user) return fail(error ?? "Login failed.", 401);
  await createSession(user.id);
  return ok({ id: user.id, email: user.email, name: user.name, onboarded: user.onboarded, role: user.role });
}

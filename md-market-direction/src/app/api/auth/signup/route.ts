import { createSession, createUser } from "@/lib/auth/session";
import { log } from "@/lib/db/store";
import { fail, ok } from "@/lib/api";
import { AUTH_SETUP_MESSAGE, authConfigured } from "@/lib/auth/session";
import { rateLimit } from "@/lib/auth/guard";

export async function POST(req: Request) {
  if (!authConfigured()) return fail(AUTH_SETUP_MESSAGE, 503);
  const limit = rateLimit("signup", 20, 60_000);
  if (!limit.ok) return fail("Too many attempts. Try again shortly.", 429);
  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password) return fail("Email and password are required.");
  const { user, error } = createUser({ email: body.email, password: body.password, name: body.name ?? "" });
  if (error || !user) return fail(error ?? "Could not create account.");
  await createSession(user.id);
  log("info", "auth", `New account created: ${user.email}`);
  return ok({ id: user.id, email: user.email, name: user.name, onboarded: user.onboarded, role: user.role });
}

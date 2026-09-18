import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { store, newId } from "@/lib/db/store";
import type { User } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "./password";
import type { Tier, Feature } from "@/lib/config/tiers";
import { hasFeature, requiredTier, TIERS } from "@/lib/config/tiers";

const COOKIE = "md_session";
const DAY = 24 * 60 * 60;

function secret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production.");
  }
  return new TextEncoder().encode(raw || "md-market-direction-development-secret-change-me");
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * DAY,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const id = payload.sub;
    if (typeof id !== "string") return null;
    const user = store.read().users.find((u) => u.id === id) ?? null;
    if (user) {
      store.write((db) => {
        const u = db.users.find((x) => x.id === id);
        if (u) u.lastSeenAt = Date.now();
      });
    }
    return user;
  } catch {
    return null;
  }
}

/* ------------------------------- registration ------------------------------ */

export interface SignupInput {
  email: string;
  password: string;
  name: string;
}

export function createUser({ email, password, name }: SignupInput): { user?: User; error?: string } {
  const normalised = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalised)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  return store.write((db) => {
    if (db.users.some((u) => u.email === normalised)) return { error: "An account with that email already exists." };
    const isFirstUser = db.users.length === 0;
    const user: User = {
      id: newId("usr"),
      email: normalised,
      name: name.trim() || normalised.split("@")[0],
      passwordHash: hashPassword(password),
      // The first account created becomes the admin of the instance.
      role: isFirstUser ? "admin" : "user",
      tier: isFirstUser ? "elite" : "free",
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      onboarded: false,
      preferences: {
        mode: "swing",
        markets: ["Forex Majors", "Metals", "US Indices"],
        defaultTimeframe: "1D",
        theme: "dark",
        emailAlerts: false,
        browserAlerts: true,
        disclaimerAcceptedAt: null,
      },
      subscription: {
        tier: isFirstUser ? "elite" : "free",
        status: isFirstUser ? "active" : "none",
        provider: isFirstUser ? "demo" : "none",
        externalId: null,
        currentPeriodEnd: null,
        startedAt: isFirstUser ? Date.now() : null,
      },
    };
    db.users.push(user);
    return { user };
  });
}

export function authenticate(email: string, password: string): { user?: User; error?: string } {
  const user = store.read().users.find((u) => u.email === email.trim().toLowerCase());
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: "Email or password is incorrect." };
  }
  return { user };
}

/* ------------------------------ entitlements ------------------------------- */

/**
 * Subscription status is ALWAYS resolved from the server-side record. Client
 * state is never trusted for entitlement decisions.
 */
export function effectiveTier(user: User | null): Tier {
  if (!user) return "free";
  const sub = user.subscription;
  if (sub.status === "active" || sub.status === "trialing") return sub.tier;
  return "free";
}

export function can(user: User | null, feature: Feature): boolean {
  return hasFeature(effectiveTier(user), feature);
}

export interface Gate {
  allowed: boolean;
  tier: Tier;
  needed: Tier;
  neededName: string;
}

export function gate(user: User | null, feature: Feature): Gate {
  const tier = effectiveTier(user);
  const needed = requiredTier(feature);
  return { allowed: hasFeature(tier, feature), tier, needed, neededName: TIERS[needed].name };
}

export function limitsFor(user: User | null) {
  return TIERS[effectiveTier(user)].limits;
}

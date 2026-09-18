import type { User } from "@/lib/db/schema";
import type { Feature, Tier } from "@/lib/config/tiers";
import { currentUser } from "./session";

/**
 * PUBLIC MODE.
 *
 * A deployed instance is usually meant to be opened, not signed up for. With
 * MD_PUBLIC_MODE=true the market-intelligence surface — dashboard, markets,
 * detail, scanner, news, calendar, momentum, cross-market — is readable without
 * an account.
 *
 * Anything that WRITES to a user's own record (watchlists, alerts, journal) or
 * that costs money per call (the AI analyst) still requires a real account, so
 * public mode can never run up someone's LLM bill or let one visitor see
 * another's data.
 */
export function publicMode(): boolean {
  return process.env.MD_PUBLIC_MODE === "true";
}

/** Tier granted to anonymous viewers in public mode. */
export function publicTier(): Tier {
  const t = process.env.MD_PUBLIC_TIER;
  return t === "free" || t === "pro" || t === "elite" ? t : "elite";
}

/** Read-only features an anonymous viewer may use. Deliberately excludes ai.analyst. */
const PUBLIC_FEATURES: Feature[] = [
  "scanner.basic",
  "scanner.advanced",
  "news.intelligence",
  "calendar",
  "market.detail.full",
  "momentum.mode",
  "crossmarket",
];

export function isPublicFeature(feature: Feature): boolean {
  return PUBLIC_FEATURES.includes(feature);
}

/**
 * A non-persisted stand-in viewer. It is never written to the store and owns no
 * watchlists, alerts or journal entries — those paths require a real account.
 */
export function anonymousViewer(): User {
  const tier = publicTier();
  return {
    id: "public",
    email: "public@local",
    name: "Guest",
    passwordHash: "",
    role: "user",
    tier,
    createdAt: 0,
    lastSeenAt: Date.now(),
    onboarded: true,
    preferences: {
      mode: "swing",
      markets: [],
      defaultTimeframe: "1D",
      theme: "dark",
      emailAlerts: false,
      browserAlerts: false,
      disclaimerAcceptedAt: null,
    },
    subscription: {
      tier,
      status: "active",
      provider: "none",
      externalId: null,
      currentPeriodEnd: null,
      startedAt: null,
    },
  };
}

/**
 * The viewer for a read-only route: the signed-in user, or the anonymous public
 * viewer when the instance is deployed in public mode. Routes that WRITE user
 * data must keep using requireUser() instead.
 */
export async function viewer(): Promise<User | null> {
  const user = await currentUser();
  if (user) return user;
  return publicMode() ? anonymousViewer() : null;
}

import type { User } from "@/lib/db/schema";
import type { Tier } from "@/lib/config/tiers";

/**
 * THE VIEWER.
 *
 * There is no sign-in. Whoever opens the app gets full access to everything.
 * Personal data (watchlists, alerts, journal) lives in the viewer's own browser,
 * so it needs no account and no database.
 */
export function publicMode(): boolean {
  return true;
}

export function accountsAvailable(): boolean {
  return false;
}

const TIER: Tier = "elite";

export function anonymousViewer(): User {
  return {
    id: "local",
    email: "",
    name: "Trader",
    passwordHash: "",
    role: "admin",
    tier: TIER,
    createdAt: 0,
    lastSeenAt: Date.now(),
    onboarded: true,
    preferences: {
      mode: "swing",
      trendScope: "htf",
      markets: [],
      defaultTimeframe: "1D",
      theme: "dark",
      emailAlerts: false,
      browserAlerts: false,
      disclaimerAcceptedAt: null,
    },
    subscription: {
      tier: TIER,
      status: "active",
      provider: "none",
      externalId: null,
      currentPeriodEnd: null,
      startedAt: null,
    },
  };
}

export async function viewer(): Promise<User> {
  return anonymousViewer();
}

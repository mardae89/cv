/**
 * Subscription architecture. Prices live here so they can be changed without
 * touching feature-gating logic. Entitlements are always validated server-side.
 */
export type Tier = "free" | "pro" | "elite";

export type Feature =
  | "scanner.basic"
  | "scanner.advanced"
  | "news.intelligence"
  | "calendar"
  | "alerts.basic"
  | "alerts.advanced"
  | "watchlists"
  | "ai.analyst"
  | "market.detail.full"
  | "momentum.mode"
  | "crossmarket"
  | "backtest"
  | "journal"
  | "journal.analytics";

export interface TierDefinition {
  id: Tier;
  name: string;
  priceMonthly: number;
  currency: string;
  tagline: string;
  /** Stripe price id, injected from env in production. */
  stripePriceEnv?: string;
  features: Feature[];
  limits: {
    watchlists: number;
    alerts: number;
    scansPerDay: number;
    markets: number | "all";
    aiMessagesPerDay: number;
  };
  bullets: string[];
}

export const TIERS: Record<Tier, TierDefinition> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    currency: "USD",
    tagline: "See the direction across core markets.",
    features: ["scanner.basic", "watchlists", "alerts.basic", "calendar"],
    limits: { watchlists: 1, alerts: 3, scansPerDay: 10, markets: 12, aiMessagesPerDay: 3 },
    bullets: [
      "Core markets (12 assets)",
      "MD Direction Score + evidence breakdown",
      "Basic scanner",
      "1 watchlist, 3 alerts",
      "Economic calendar",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 19.99,
    currency: "USD",
    tagline: "The full market intelligence engine.",
    stripePriceEnv: "STRIPE_PRICE_PRO",
    features: [
      "scanner.basic",
      "scanner.advanced",
      "news.intelligence",
      "calendar",
      "alerts.basic",
      "watchlists",
      "ai.analyst",
      "market.detail.full",
      "journal",
    ],
    limits: { watchlists: 10, alerts: 50, scansPerDay: 1000, markets: "all", aiMessagesPerDay: 100 },
    bullets: [
      "All markets — forex, stocks, indices, crypto, metals, commodities, bonds",
      "Full scanner with every filter",
      "AI News Intelligence + news→market mapping",
      "Full market detail & multi-timeframe analysis",
      "AI Analyst",
      "10 watchlists, 50 alerts",
      "Trading journal",
    ],
  },
  elite: {
    id: "elite",
    name: "Elite",
    priceMonthly: 49.99,
    currency: "USD",
    tagline: "Everything, plus MD Momentum and historical testing.",
    stripePriceEnv: "STRIPE_PRICE_ELITE",
    features: [
      "scanner.basic",
      "scanner.advanced",
      "news.intelligence",
      "calendar",
      "alerts.basic",
      "alerts.advanced",
      "watchlists",
      "ai.analyst",
      "market.detail.full",
      "momentum.mode",
      "crossmarket",
      "backtest",
      "journal",
      "journal.analytics",
    ],
    limits: { watchlists: 50, alerts: 500, scansPerDay: 10000, markets: "all", aiMessagesPerDay: 1000 },
    bullets: [
      "Everything in Pro",
      "MD Momentum Mode",
      "Cross-Market Intelligence map",
      "Advanced multi-condition alerts",
      "Backtesting engine",
      "Advanced journal analytics",
      "Priority access to new features",
    ],
  },
};

export const TIER_ORDER: Tier[] = ["free", "pro", "elite"];

export function hasFeature(tier: Tier, feature: Feature): boolean {
  return TIERS[tier].features.includes(feature);
}

export function tierRank(tier: Tier): number {
  return TIER_ORDER.indexOf(tier);
}

/** The lowest tier that unlocks a feature — used to render the right upgrade screen. */
export function requiredTier(feature: Feature): Tier {
  for (const t of TIER_ORDER) {
    if (hasFeature(t, feature)) return t;
  }
  return "elite";
}

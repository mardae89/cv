import type { CategoryKey, Timeframe, TradingMode } from "@/lib/types";

/**
 * DEFAULT CATEGORY WEIGHTS — the heart of the MD DIRECTION SCORE.
 *
 * Weights are expressed in percentage points and MUST sum to 100. They are
 * intentionally kept in one place so that the scoring model can be retuned,
 * A/B tested or personalised per user without touching the engine.
 */
export const DEFAULT_WEIGHTS: Record<CategoryKey, number> = {
  technical: 20,
  structure: 20,
  momentum: 15,
  news: 15,
  macro: 15,
  crossMarket: 10,
  eventRisk: 5,
};

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  technical: "Technical Trend",
  structure: "Market Structure",
  momentum: "Momentum",
  news: "News",
  macro: "Macro",
  crossMarket: "Cross-Market",
  eventRisk: "Event Risk",
};

export const CATEGORY_ORDER: CategoryKey[] = [
  "technical",
  "structure",
  "momentum",
  "news",
  "macro",
  "crossMarket",
  "eventRisk",
];

/**
 * CATEGORY CALIBRATION.
 *
 * The seven categories do not naturally produce readings on the same scale. Trend
 * and structure swing close to ±1 when a market is clearly trending, but the news,
 * macro and cross-market readings are weighted AVERAGES of several signed inputs,
 * so even a decisive macro backdrop rarely reads above ~0.4 in raw form. Feeding
 * those raw numbers straight into the weighted sum would silently under-weight
 * three of the seven categories and make the top score bands unreachable.
 *
 * Each category's strength is therefore passed through a signed power curve,
 *
 *     calibrated = sign(s) * |s| ^ exponent
 *
 * which is strictly monotonic, fixes 0 → 0 and ±1 → ±1 (so it can never change a
 * category's direction or invent conviction at the extremes) and expands the
 * mid-range of the categories that need it. Lower exponent = more expansion.
 */
export const CATEGORY_CALIBRATION: Record<CategoryKey, number> = {
  technical: 0.85,
  structure: 0.85,
  momentum: 0.7,
  news: 0.6,
  macro: 0.65,
  crossMarket: 0.7,
  eventRisk: 1, // event risk is already expressed as a 0..1 dampening factor
};

export function calibrate(key: CategoryKey, strength: number): number {
  const exponent = CATEGORY_CALIBRATION[key] ?? 1;
  const magnitude = Math.min(1, Math.abs(strength));
  return Math.sign(strength) * Math.pow(magnitude, exponent);
}

/**
 * Score bands. The MD Direction Score is a measure of how strongly the available
 * evidence lines up in one direction — it is NOT a probability and must never be
 * presented as one.
 */
export const SCORE_BANDS = [
  { min: 90, max: 100, label: "Extremely Strong Bullish Alignment", direction: "bullish" },
  { min: 75, max: 89, label: "Strong Bullish Alignment", direction: "bullish" },
  { min: 60, max: 74, label: "Moderate Bullish Alignment", direction: "bullish" },
  { min: 45, max: 59, label: "Mixed / Neutral", direction: "neutral" },
  { min: 30, max: 44, label: "Moderate Bearish Alignment", direction: "bearish" },
  { min: 15, max: 29, label: "Strong Bearish Alignment", direction: "bearish" },
  { min: 0, max: 14, label: "Extremely Strong Bearish Alignment", direction: "bearish" },
] as const;

export function bandFor(score: number) {
  return SCORE_BANDS.find((b) => score >= b.min && score <= b.max) ?? SCORE_BANDS[3];
}

export const ALL_TIMEFRAMES: Timeframe[] = ["5M", "15M", "1H", "4H", "1D", "1W"];

/**
 * Trading modes decide which timeframes matter and how much. The weights are
 * relative — the engine normalises them before use.
 */
export const MODE_TIMEFRAMES: Record<
  TradingMode,
  { label: string; blurb: string; weights: Partial<Record<Timeframe, number>> }
> = {
  scalper: {
    label: "Scalper",
    blurb: "Fast intraday execution. Weighted to 5M / 15M / 1H.",
    weights: { "5M": 3, "15M": 3, "1H": 2, "4H": 1, "1D": 0.5, "1W": 0.25 },
  },
  day: {
    label: "Day Trader",
    blurb: "Intraday swings. Weighted to 15M / 1H / 4H.",
    weights: { "5M": 1, "15M": 2.5, "1H": 3, "4H": 2.5, "1D": 1, "1W": 0.5 },
  },
  swing: {
    label: "Swing Trader",
    blurb: "Multi-day positions. Weighted to 4H / Daily / Weekly.",
    weights: { "5M": 0.25, "15M": 0.5, "1H": 1, "4H": 2.5, "1D": 3, "1W": 3 },
  },
  "md-momentum": {
    label: "MD Momentum",
    blurb: "Higher-timeframe momentum continuation. Weekly leads, 1H confirms.",
    weights: { "5M": 0, "15M": 0.25, "1H": 1.5, "4H": 2.5, "1D": 3, "1W": 4 },
  },
};

/**
 * MD MOMENTUM MODE — a configurable model of the strategy, not a hard rule set.
 * Each check produces a -1..1 reading; the weights below combine them.
 */
export const MD_MOMENTUM_RULES = {
  weeklyDirection: 20,
  previousWeeklyCandle: 12,
  priceVsMa50Weekly: 16,
  weeklyStructure: 14,
  dailyStructure: 12,
  fourHourStructure: 10,
  oneHourConfirmation: 8,
  momentum: 8,
  news: 4,
} as const;

/**
 * CONFLICT DETECTION.
 *
 * `CONFLICT_DAMPENING` is the haircut applied to a market whose timeframes are
 * split down the middle. It is scaled by how much of the mode's timeframe weight
 * actually sits on the minority side, because a 4H pullback inside a rising
 * weekly is a retracement, not a disagreement about direction — and charging it
 * the same 45% as a genuine weekly-versus-daily split is what made clean trends
 * read "mixed".
 *
 * `CONFLICT_MIXED_AT` is the dissent level at which the market stops being called
 * by its band and starts being called MIXED.
 */
export const CONFLICT_DAMPENING = 0.45;
/**
 * Dissent runs 0 (unanimous) to 1 (evenly split). MIXED is reserved for a market
 * that is genuinely balanced — the minority holding at least 40% of the
 * conviction. Below that the trend still has a majority and is named as one, with
 * the haircut standing in for the disagreement.
 */
export const CONFLICT_MIXED_AT = 0.8;

/** A timeframe reading inside this band is not taking a side. */
export const NEUTRAL_BAND = 0.18;

/**
 * EVIDENCE PARTICIPATION.
 *
 * A category with nothing to say should not get a vote. Counting its weight in
 * the denominator makes silence argue for "neutral", which is how a market with
 * textbook price action and a quiet news cycle ended up near 50: trend, structure
 * and momentum are 55 of the 100 available points, so even perfect alignment
 * could not clear 77 while the other 45 points sat mute.
 *
 * Each category therefore earns its place in the denominator in proportion to how
 * much of an opinion it actually has, ramping from none at `floor` to a full vote
 * at `full`. The score then measures alignment among the evidence that exists.
 *
 * `MAX_EVIDENCE_AMPLIFICATION` caps the effect, so a single loud category on an
 * otherwise silent board cannot manufacture an extreme reading.
 */
export const CATEGORY_VOTE = { floor: 0.1, full: 0.3 };
export const MAX_EVIDENCE_AMPLIFICATION = 1.35;

/** 0..1 — how much of a vote a category's reading earns in the denominator. */
export function voteShare(strength: number): number {
  const magnitude = Math.abs(strength);
  const { floor, full } = CATEGORY_VOTE;
  if (magnitude <= floor) return 0;
  if (magnitude >= full) return 1;
  return (magnitude - floor) / (full - floor);
}

/** Event-risk model tuning. */
export const EVENT_RISK = {
  /** Events further out than this many hours create no dampening. */
  horizonHours: 72,
  /** Maximum dampening applied by a single high-impact event, 0..1. */
  maxDampening: 0.85,
  impactWeight: { low: 0.15, medium: 0.45, high: 1 } as const,
};

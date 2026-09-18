import type {
  CategoryKey,
  CategoryResult,
  ConflictReport,
  Direction,
  EvidenceItem,
  EvidenceQuality,
  MdScore,
  Timeframe,
  TradingMode,
} from "@/lib/types";
import {
  bandFor,
  calibrate,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  CONFLICT_DAMPENING,
  DEFAULT_WEIGHTS,
  MODE_TIMEFRAMES,
} from "@/lib/config/scoring";
import { clamp } from "./indicators";

/**
 * THE MD DIRECTION SCORE.
 *
 * Each category produces a signed strength in -1..+1. Multiplying by the
 * category weight gives signed POINTS in ±weight. The sum of points is a raw
 * value in ±100, which maps onto the 0–100 score as:
 *
 *     score = 50 + rawPoints / 2
 *
 * so that a market with no directional evidence at all sits at 50 ("Mixed /
 * Neutral") and perfect alignment reaches 0 or 100. The score is a measure of
 * EVIDENCE ALIGNMENT, not a probability, and is never presented as one.
 */

export interface CategoryInput {
  key: CategoryKey;
  strength: number;
  available: boolean;
  evidence: EvidenceItem[];
  summary: string;
}

/** Combines per-timeframe readings using the weights of the selected trading mode. */
export function weightByMode<T extends { timeframe: Timeframe; strength: number }>(
  items: T[],
  mode: TradingMode,
): number {
  const weights = MODE_TIMEFRAMES[mode].weights;
  let sum = 0;
  let total = 0;
  for (const item of items) {
    const w = weights[item.timeframe] ?? 0;
    if (!w) continue;
    sum += item.strength * w;
    total += w;
  }
  return total ? clamp(sum / total, -1, 1) : 0;
}

const HTF: Timeframe[] = ["1W", "1D", "4H"];
const LTF: Timeframe[] = ["1H", "15M", "5M"];
const HTF_WEIGHTS: Record<string, number> = { "1W": 3, "1D": 2.5, "4H": 1.5 };
const LTF_WEIGHTS: Record<string, number> = { "1H": 2, "15M": 1.5, "5M": 1 };

function groupStrength(
  items: { timeframe: Timeframe; strength: number }[],
  group: Timeframe[],
  weights: Record<string, number>,
): number | null {
  let sum = 0;
  let total = 0;
  for (const item of items) {
    if (!group.includes(item.timeframe)) continue;
    const w = weights[item.timeframe] ?? 1;
    sum += item.strength * w;
    total += w;
  }
  return total ? clamp(sum / total, -1, 1) : null;
}

function toDirection(v: number): Direction {
  return v > 0.18 ? "bullish" : v < -0.18 ? "bearish" : "neutral";
}

/**
 * CONFLICT DETECTION.
 *
 * Two kinds of disagreement matter, and both are caught here:
 *
 *  1. Higher timeframes versus lower timeframes — the classic "weekly says up,
 *     the hourly says down" case.
 *  2. Disagreement WITHIN the higher timeframes — a bullish weekly with a bearish
 *     daily is not a clean trend, and calling it "strong alignment" would be wrong
 *     even though the group average looks positive.
 *
 * In either case the market is reported as MIXED, the score is pulled toward
 * neutral, and the user is told in plain English which side is which.
 */
export function detectConflict(
  combined: { timeframe: Timeframe; strength: number }[],
): ConflictReport {
  const htf = groupStrength(combined, HTF, HTF_WEIGHTS);
  const ltf = groupStrength(combined, LTF, LTF_WEIGHTS);
  if (htf === null || ltf === null) {
    return { conflicted: false, higherTimeframe: "neutral", lowerTimeframe: "neutral", message: null };
  }
  const hDir = toDirection(htf);
  const lDir = toDirection(ltf);

  // 1. Higher versus lower timeframes.
  if (hDir !== "neutral" && lDir !== "neutral" && hDir !== lDir) {
    return {
      conflicted: true,
      higherTimeframe: hDir,
      lowerTimeframe: lDir,
      message: `Higher timeframes remain ${hDir}, but short-term structure has turned ${lDir}.`,
    };
  }

  // 2. Disagreement inside the higher timeframes themselves.
  const CONVICTION = 0.35;
  const strongHtf = combined.filter((c) => HTF.includes(c.timeframe) && Math.abs(c.strength) > CONVICTION);
  const bulls = strongHtf.filter((c) => c.strength > 0);
  const bears = strongHtf.filter((c) => c.strength < 0);
  if (bulls.length && bears.length) {
    return {
      conflicted: true,
      higherTimeframe: hDir,
      lowerTimeframe: lDir,
      message: `Higher timeframes disagree with each other — ${bulls.map((c) => c.timeframe).join(" and ")} bullish against ${bears.map((c) => c.timeframe).join(" and ")} bearish.`,
    };
  }

  return { conflicted: false, higherTimeframe: hDir, lowerTimeframe: lDir, message: null };
}

export interface BuildScoreParams {
  categories: CategoryInput[];
  conflict: ConflictReport;
  /** 0..1 — how much conviction the upcoming event calendar should remove. */
  eventDampening: number;
  weights?: Partial<Record<CategoryKey, number>>;
  /** Freshness + coverage notes used for the evidence-quality read. */
  qualityNotes?: string[];
}

export function buildScore({
  categories,
  conflict,
  eventDampening,
  weights,
  qualityNotes = [],
}: BuildScoreParams): MdScore {
  const W = { ...DEFAULT_WEIGHTS, ...weights };
  const byKey = new Map(categories.map((c) => [c.key, c]));

  // 1. Directional categories first (everything except event risk).
  const directional = CATEGORY_ORDER.filter((k) => k !== "eventRisk");
  let raw = 0;
  let availableWeight = 0;
  let totalWeight = 0;

  const results: CategoryResult[] = [];

  for (const key of directional) {
    const input = byKey.get(key);
    const weight = W[key];
    totalWeight += weight;
    // Raw strength is calibrated onto the common score scale (see CATEGORY_CALIBRATION).
    const raw_strength = input?.available ? clamp(input.strength, -1, 1) : 0;
    const strength = calibrate(key, raw_strength);
    if (input?.available) availableWeight += weight;
    const points = strength * weight;
    raw += points;
    results.push({
      key,
      label: CATEGORY_LABELS[key],
      strength,
      weight,
      points,
      fill: (strength + 1) / 2,
      available: input?.available ?? false,
      evidence: input?.evidence ?? [],
      summary: input?.summary ?? "Data unavailable.",
    });
  }

  // 2. Event risk pulls conviction TOWARD NEUTRAL in whichever direction the rest
  //    of the evidence points. It never flips a market bearish on its own.
  const eventWeight = W.eventRisk;
  totalWeight += eventWeight;
  const sign = raw === 0 ? 0 : Math.sign(raw);
  const eventPoints = -Math.abs(eventDampening) * eventWeight * sign;
  const eventInput = byKey.get("eventRisk");
  if (eventDampening > 0) availableWeight += eventWeight;
  raw += eventPoints;
  results.push({
    key: "eventRisk",
    label: CATEGORY_LABELS.eventRisk,
    strength: -eventDampening,
    weight: eventWeight,
    points: eventPoints,
    fill: 1 - eventDampening,
    available: (eventInput?.available ?? false) || eventDampening > 0,
    evidence: eventInput?.evidence ?? [],
    summary: eventInput?.summary ?? "No scheduled event risk detected for this market.",
  });

  // 3. Conflicting timeframes reduce conviction.
  if (conflict.conflicted) raw *= 1 - CONFLICT_DAMPENING;

  const score = clamp(Math.round(50 + raw / 2), 0, 100);
  const band = bandFor(score);
  const direction: Direction = conflict.conflicted ? "mixed" : (band.direction as Direction);

  // 4. Evidence quality — a separate concept from the score itself.
  const coverage = totalWeight ? availableWeight / totalWeight : 0;
  const availableCount = results.filter((r) => r.available).length;
  const reasons = [
    `${availableCount}/${results.length} evidence categories available`,
    ...qualityNotes,
  ];
  if (conflict.conflicted) reasons.push("Timeframes disagree — conviction reduced");
  const evidenceQuality: EvidenceQuality =
    coverage >= 0.85 && !conflict.conflicted ? "high" : coverage >= 0.6 ? "medium" : "low";

  return {
    score,
    direction,
    label: conflict.conflicted ? "Mixed — timeframes disagree" : band.label,
    categories: results,
    rawPoints: raw,
    evidenceQuality,
    evidenceQualityReasons: reasons,
    conflict,
  };
}

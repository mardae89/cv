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
  CONFLICT_MIXED_AT,
  DEFAULT_WEIGHTS,
  MAX_EVIDENCE_AMPLIFICATION,
  MODE_TIMEFRAMES,
  NEUTRAL_BAND,
  voteShare,
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
  return v > NEUTRAL_BAND ? "bullish" : v < -NEUTRAL_BAND ? "bearish" : "neutral";
}

/**
 * CONFLICT DETECTION.
 *
 * The question is not "does any timeframe disagree" — on a real chart one always
 * does. It is HOW MUCH of the trader's attention is on the dissenting side.
 *
 * So the timeframes that have taken a side are tallied using the weights of the
 * mode the user is actually trading, and the minority share of that weight is the
 * measure of disagreement. Doubled so that an even split reads 1:
 *
 *     dissent = 2 * min(bullWeight, bearWeight) / (bullWeight + bearWeight)
 *
 * A 4H pullback under a rising weekly and daily is a retracement — a small share,
 * a small haircut, and the trend is still called a trend. A bullish weekly against
 * a bearish daily splits the weight nearly evenly, takes the full haircut and is
 * called MIXED. A swing trader's 5M chart barely registers; a scalper's dominates.
 * That is the same arithmetic reading both, which is the point.
 */
export function detectConflict(
  combined: { timeframe: Timeframe; strength: number }[],
  mode: TradingMode,
): ConflictReport {
  const htf = groupStrength(combined, HTF, HTF_WEIGHTS);
  const ltf = groupStrength(combined, LTF, LTF_WEIGHTS);
  const none: ConflictReport = {
    conflicted: false,
    dissent: 0,
    dampening: 0,
    higherTimeframe: htf === null ? "neutral" : toDirection(htf),
    lowerTimeframe: ltf === null ? "neutral" : toDirection(ltf),
    message: null,
  };
  if (htf === null || ltf === null) return none;

  const modeWeights = MODE_TIMEFRAMES[mode].weights;
  let bullWeight = 0;
  let bearWeight = 0;
  const bulls: Timeframe[] = [];
  const bears: Timeframe[] = [];
  for (const c of combined) {
    const w = modeWeights[c.timeframe] ?? 0;
    if (!w) continue;
    // Weighted by conviction as well as by attention: a 4H easing to -0.3 is not
    // the equal and opposite of a weekly pinned at +0.9, and counting them as one
    // box each is what turned ordinary retracements into "the timeframes disagree".
    const conviction = w * Math.abs(c.strength);
    if (c.strength > NEUTRAL_BAND) {
      bullWeight += conviction;
      bulls.push(c.timeframe);
    } else if (c.strength < -NEUTRAL_BAND) {
      bearWeight += conviction;
      bears.push(c.timeframe);
    }
  }
  const decided = bullWeight + bearWeight;
  if (!decided || !bulls.length || !bears.length) return none;

  const dissent = (2 * Math.min(bullWeight, bearWeight)) / decided;
  const dampening = CONFLICT_DAMPENING * dissent;
  const minority = bullWeight < bearWeight ? bulls : bears;
  const majority = bullWeight < bearWeight ? bears : bulls;
  const minoritySide = bullWeight < bearWeight ? "bullish" : "bearish";
  const majoritySide = bullWeight < bearWeight ? "bearish" : "bullish";

  return {
    conflicted: dissent >= CONFLICT_MIXED_AT,
    dissent,
    dampening,
    higherTimeframe: toDirection(htf),
    lowerTimeframe: toDirection(ltf),
    message:
      `${majority.join(", ")} ${majority.length > 1 ? "are" : "is"} ${majoritySide}, ` +
      `while ${minority.join(", ")} ${minority.length > 1 ? "are" : "is"} ${minoritySide}.`,
  };
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
  let votingWeight = 0;
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
    // A category only claims its share of the denominator to the extent that it
    // has an opinion; see CATEGORY_VOTE. Its points are unaffected either way.
    votingWeight += weight * (input?.available ? voteShare(strength) : 0);
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
  if (eventDampening > 0) {
    availableWeight += eventWeight;
    votingWeight += eventWeight * voteShare(eventDampening);
  }
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

  // 3. The score measures alignment among the evidence that EXISTS. Categories
  //    with nothing to say are not counted as votes for "neutral", which would
  //    otherwise cap a textbook trend in a quiet news cycle around 77.
  const amplification = votingWeight > 0
    ? Math.min(totalWeight / votingWeight, MAX_EVIDENCE_AMPLIFICATION)
    : 0;
  raw *= amplification;

  // 4. Disagreement between timeframes reduces conviction, in proportion to how
  //    much of the trader's attention sits on the dissenting side.
  raw *= 1 - conflict.dampening;

  const score = clamp(Math.round(50 + raw / 2), 0, 100);
  const band = bandFor(score);
  const direction: Direction = conflict.conflicted ? "mixed" : (band.direction as Direction);

  // 5. Evidence quality — a separate concept from the score itself.
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

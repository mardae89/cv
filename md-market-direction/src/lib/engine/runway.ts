import type { Candle, Direction, MomentumRunway, Timeframe, TrendScope } from "@/lib/types";
import { TF_MS } from "@/lib/data/synth";
import { findSwings } from "./structure";
import { atr, clamp, ema, macd, rsi } from "./indicators";

/**
 * MOMENTUM RUNWAY — how much longer this move might have in it.
 *
 * This is NOT a forecast and must never be shown as one. It answers a narrower,
 * answerable question: moves in THIS market on THIS timeframe have historically
 * run for about so long, this one has been running for X, and the indicators say
 * it has this much left in the tank. That is a persistence estimate from the
 * market's own history, and it is presented as a range because a single number
 * would claim a precision the method does not have.
 *
 * Three inputs, all of them things a trader can check by eye:
 *
 *  1. TYPICAL LEG — the median distance, in bars, between consecutive opposing
 *     swing points. Up-legs and down-legs are pooled: it is the same market's
 *     rhythm either way, and pooling doubles a sample that is small to begin with.
 *
 *  2. ELAPSED — bars since the swing that started the current leg. A leg already
 *     longer than this market's typical one has less left, not more.
 *
 *  3. FUEL — how much room the indicators leave: distance from RSI exhaustion,
 *     how stretched price is from the 50 EMA in ATR terms, and whether the MACD
 *     histogram is still expanding or already contracting.
 *
 * The same indicators the direction score is built from, asked a different
 * question.
 */

/** Which chart the runway is measured on. Matches the scope the user is reading. */
export function runwayTimeframe(scope: TrendScope): Timeframe {
  return scope === "htf" ? "1D" : "1H";
}

/** Median of a numeric list. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The unit a trader would actually say a span in. */
function unitFor(hours: number): "min" | "hours" | "days" {
  return hours < 1 ? "min" : hours < 48 ? "hours" : "days";
}

function inUnit(hours: number, unit: "min" | "hours" | "days"): number {
  if (unit === "min") return Math.max(5, Math.round((hours * 60) / 5) * 5);
  if (unit === "days") return Math.round((hours / 24) * 2) / 2;
  return hours < 10 ? Math.round(hours * 2) / 2 : Math.round(hours);
}

function name(unit: "min" | "hours" | "days", value: number): string {
  if (unit === "min") return "min";
  if (unit === "days") return value === 1 ? "day" : "days";
  return value === 1 ? "hour" : "hours";
}

/** "45 min", "6 hours", "3 days". */
export function formatSpan(hours: number): string {
  const unit = unitFor(hours);
  const value = inUnit(hours, unit);
  return `${value} ${name(unit, value)}`;
}

/**
 * A range in ONE unit, chosen from the wider end: "2–5 hours", not
 * "24 hours – 2.5 days". Mixed units make a reader do arithmetic to compare the
 * two numbers they were given to compare.
 */
export function formatRange(low: number, high: number): string {
  const unit = unitFor(high);
  const lo = inUnit(low, unit);
  const hi = inUnit(high, unit);
  if (lo === hi) return `${hi} ${name(unit, hi)}`;
  return `${lo}–${hi} ${name(unit, hi)}`;
}

const NONE = (timeframe: Timeframe, reason: string): MomentumRunway => ({
  hoursLow: null,
  hoursHigh: null,
  label: "No clear run to time",
  detail: reason,
  state: "none",
  timeframe,
  elapsedHours: 0,
  typicalHours: 0,
  fuel: 0,
  reasons: [reason],
});

export function estimateRunway(
  candles: Candle[],
  direction: Direction,
  scope: TrendScope,
  symbol: string,
): MomentumRunway {
  const timeframe = runwayTimeframe(scope);
  const barMs = TF_MS[timeframe];
  const toHours = (bars: number) => (bars * barMs) / 3_600_000;

  if (direction !== "bullish" && direction !== "bearish") {
    return NONE(timeframe, "The evidence is mixed, so there is no single move to put a clock on.");
  }
  if (candles.length < 60) {
    return NONE(timeframe, "Not enough history on this timeframe to measure a typical move.");
  }

  const swings = findSwings(candles, 3);
  if (swings.length < 6) {
    return NONE(timeframe, "Too few swing points here to measure a typical move.");
  }

  /* 1. Typical leg: median bars between consecutive opposing swings. */
  const legs: number[] = [];
  for (let i = 1; i < swings.length; i++) {
    if (swings[i].kind === swings[i - 1].kind) continue;
    legs.push(swings[i].index - swings[i - 1].index);
  }
  if (legs.length < 4) {
    return NONE(timeframe, "Too few completed swings here to measure a typical move.");
  }
  const typicalBars = median(legs);

  /* 2. Elapsed: bars since the swing that started the current leg. */
  const startKind = direction === "bullish" ? "low" : "high";
  const legStart = [...swings].reverse().find((s) => s.kind === startKind);
  if (!legStart) {
    return NONE(timeframe, `No recent swing ${startKind} to date the current move from.`);
  }
  const elapsedBars = candles.length - 1 - legStart.index;

  /* 3. Fuel: how much room the indicators leave. */
  const closes = candles.map((c) => c.c);
  const rsiNow = rsi(closes, 14).at(-1) ?? 50;
  const ema50 = ema(closes, 50).at(-1);
  const atrNow = atr(candles, 14).at(-1);
  const hist = macd(closes).hist;
  const price = closes[closes.length - 1];

  // RSI room, measured against 80/20 rather than 70/30: strong trends live above
  // 70 for a long time, and calling those exhausted would be wrong.
  const rsiRoom =
    direction === "bullish" ? clamp((80 - rsiNow) / 30, 0, 1) : clamp((rsiNow - 20) / 30, 0, 1);

  // How stretched price is from the 50 EMA, in ATR. Past ~5 ATR a move is
  // usually closer to its end than its start.
  const extensionAtr = ema50 != null && atrNow ? Math.abs(price - ema50) / atrNow : 0;
  const extensionRoom = clamp(1 - extensionAtr / 5, 0, 1);

  // An expanding MACD histogram is momentum still building; a contracting one is
  // the move already handing back its thrust.
  const h0 = hist.at(-1) ?? 0;
  const h1 = hist.at(-4) ?? h0;
  const expanding = Math.abs(h0) - Math.abs(h1);
  const macdRoom = clamp(0.5 + expanding / (Math.abs(h1) || 1), 0, 1);

  const fuel = clamp(0.4 * rsiRoom + 0.35 * extensionRoom + 0.25 * macdRoom, 0, 1);

  /* 4. Remaining, discounted by how far through a typical leg this one already is. */
  const ratio = typicalBars ? elapsedBars / typicalBars : 0;
  const decay = clamp(1.2 - 0.6 * ratio, 0.15, 1.2);
  const remainingBars = typicalBars * fuel * decay;

  const elapsedHours = toHours(elapsedBars);
  const typicalHours = toHours(typicalBars);
  const centre = toHours(remainingBars);
  const hoursLow = centre * 0.6;
  const hoursHigh = centre * 1.4;

  const state: MomentumRunway["state"] =
    fuel < 0.25 || centre < toHours(0.5) ? "stalling" : ratio > 1.3 ? "late" : "running";

  const label =
    state === "stalling"
      ? "Running out of room"
      : `About ${formatRange(hoursLow, hoursHigh)} left`;

  const detail =
    state === "stalling"
      ? `${symbol} has been ${direction} for ${formatSpan(elapsedHours)} and the indicators are no longer backing it. Typical move here is ${formatSpan(typicalHours)}.`
      : `${symbol} has been ${direction} for ${formatSpan(elapsedHours)}. A typical ${timeframe} move here runs ${formatSpan(typicalHours)}${state === "late" ? ", so this one is already extended" : ""}.`;

  const reasons = [
    `RSI ${rsiNow.toFixed(0)} — ${rsiRoom > 0.6 ? "room to run" : rsiRoom > 0.3 ? "getting warm" : "near exhaustion"}`,
    `${extensionAtr.toFixed(1)} ATR from the 50 EMA — ${extensionRoom > 0.6 ? "not stretched" : extensionRoom > 0.3 ? "moderately stretched" : "heavily stretched"}`,
    `MACD histogram ${expanding > 0 ? "still expanding" : "contracting"}`,
    `${legs.length} past moves measured on the ${timeframe}`,
  ];

  return {
    hoursLow,
    hoursHigh,
    label,
    detail,
    state,
    timeframe,
    elapsedHours,
    typicalHours,
    fuel,
    reasons,
  };
}

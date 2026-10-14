import type { Candle, Timeframe } from "@/lib/types";
import {
  lowerRungs,
  rungsFor,
  TF_SPOKEN,
  WICK_LADDER,
  type WickDirection,
  type WickSettings,
} from "@/lib/config/wick";
import { adx, atr, ema } from "./indicators";

/**
 * WICK CATCHING — setup detection.
 *
 * Finds candles matching the Wick Catching method and draws the pullback zone a
 * trader would wait in. It describes a setup; it is never a buy or sell signal
 * and must never be worded as one.
 *
 * The rules are exactly as specified, no additions:
 *
 *   1. the previous candle closed in the trade direction
 *   2. its body is at least `bodyAtrMultiple` x ATR(14) — weak and doji candles out
 *   3. price is on the correct side of the 50 EMA
 *   4. the market is trending: 50 EMA slope in the trade direction over
 *      `emaSlopeLookback` candles AND ADX(14) above `adxMin`
 *   5. at least `momentumMin` of the last `momentumWindow` closed candles closed
 *      in the trade direction
 *
 * Every rule reports its own pass/fail and the numbers behind it, so a setup can
 * be checked by hand against the chart rather than taken on trust.
 */

export interface WickRule {
  id: "candle" | "body" | "ema" | "trend" | "momentum";
  label: string;
  passed: boolean;
  detail: string;
}

/**
 * `overrun` means price ran too far past the 0 level before ever pulling back
 * into the zone — the entry never came, so the setup is void rather than
 * invalidated. A different outcome from price breaking the other way.
 */
export type ZoneState = "waiting" | "in-zone" | "overrun" | "invalidated" | "expired";

export interface WickZone {
  /** Retracement anchors taken from the previous candle. */
  anchorHigh: number;
  anchorLow: number;
  /** Price at the shallow and deep edges of the zone. */
  zoneNear: number;
  zoneFar: number;
  /** The 1.0 retracement — a close beyond this invalidates the setup. */
  invalidation: number;
  /** The 0 level: the previous candle's extreme, where the move ended. */
  origin: number;
  /** Past this the pullback counts as missed. */
  overrunLevel: number;
  /** The period the zone is live for: the current candle. */
  fromT: number;
  toT: number;
  state: ZoneState;
}

export interface WickSetup {
  symbol: string;
  timeframe: Timeframe;
  direction: WickDirection;
  /** Open time of the candle the zone belongs to. */
  candleT: number;
  zone: WickZone;
  rules: WickRule[];
  /** Null until the alignment check runs — it needs other timeframes. */
  alignment: {
    required: Timeframe[];
    aligned: Timeframe[];
    missed: Timeframe[];
    passed: boolean;
  } | null;
  /** "Weekly wick. This is a Daily pullback. ..." */
  pullbackLabel: string;
  /** How far price has actually travelled into the zone, 0..1. */
  zoneProgress: number;
}

/** Index of the candle still forming, and the last closed one. */
function cursor(candles: Candle[]) {
  return { current: candles.length - 1, previous: candles.length - 2 };
}

export function pullbackLabel(tf: Timeframe): string {
  const lower = WICK_LADDER[tf];
  if (!lower) return `${TF_SPOKEN[tf]} wick.`;
  return `${TF_SPOKEN[tf]} wick. This is a ${TF_SPOKEN[lower]} pullback. Drop to the ${TF_SPOKEN[lower]} when price reaches the zone.`;
}

/**
 * ALIGNMENT — swappable by design.
 *
 * For now "aligned" means price is on the correct side of the 50 EMA on that
 * timeframe. This is the ONLY place that definition lives; replacing it with a
 * shift-of-structure test means changing this function and nothing else.
 */
export type AlignmentCheck = (
  candles: Candle[],
  direction: WickDirection,
) => { aligned: boolean; detail: string };

export const alignedByEma50: AlignmentCheck = (candles, direction) => {
  const closes = candles.map((c) => c.c);
  const e = ema(closes, 50).at(-1);
  const price = closes.at(-1);
  if (e == null || price == null) {
    return { aligned: false, detail: "not enough candles for a 50 EMA" };
  }
  const aligned = direction === "buy" ? price > e : price < e;
  return {
    aligned,
    detail: `price ${price > e ? "above" : "below"} the 50 EMA`,
  };
};

/**
 * Evaluate the five rules at a given index. `index` is the candle still forming;
 * every rule reads the candle before it, which is the last closed one.
 */
export function evaluateRules(
  candles: Candle[],
  index: number,
  settings: WickSettings,
): { direction: WickDirection; rules: WickRule[]; passed: boolean } | null {
  const prev = index - 1;
  if (prev < 1) return null;

  const previous = candles[prev];
  const direction: WickDirection = previous.c > previous.o ? "buy" : "sell";
  const up = direction === "buy";

  const closes = candles.slice(0, index + 1).map((c) => c.c);
  const emaSeries = ema(closes, 50);
  const atrSeries = atr(candles.slice(0, index + 1), 14);
  const adxSeries = adx(candles.slice(0, index + 1), 14).adx;

  const emaNow = emaSeries[prev];
  const emaThen = emaSeries[prev - settings.emaSlopeLookback];
  const atrNow = atrSeries[prev];
  const adxNow = adxSeries[prev];
  const price = candles[index].c;

  /* 1. Previous candle closed in the trade direction. */
  const body = Math.abs(previous.c - previous.o);
  const candleOk = previous.c !== previous.o;

  /* 2. Strong candle: body at least N x ATR. */
  const bodyAtr = atrNow ? body / atrNow : 0;
  const bodyOk = atrNow != null && bodyAtr >= settings.bodyAtrMultiple;

  /* 3. Price on the correct side of the 50 EMA. */
  const emaOk = emaNow != null && (up ? price > emaNow : price < emaNow);

  /* 4. Trending, not ranging: EMA slope AND ADX. */
  const slopeOk =
    emaNow != null && emaThen != null && (up ? emaNow > emaThen : emaNow < emaThen);
  const adxOk = adxNow != null && adxNow > settings.adxMin;
  const trendOk = slopeOk && adxOk;

  /* 5. Momentum over the recent closed candles. */
  const window = candles.slice(Math.max(0, prev - settings.momentumWindow + 1), prev + 1);
  const withDirection = window.filter((c) => (up ? c.c > c.o : c.c < c.o)).length;
  const momentumOk = withDirection >= settings.momentumMin;

  const rules: WickRule[] = [
    {
      id: "candle",
      label: `Previous candle closed ${up ? "bullish" : "bearish"}`,
      passed: candleOk,
      detail: candleOk
        ? `closed ${up ? "above" : "below"} its open`
        : "open and close are equal — no direction",
    },
    {
      id: "body",
      label: "Strong candle",
      passed: bodyOk,
      detail:
        atrNow == null
          ? "not enough candles for ATR(14)"
          : `body is ${bodyAtr.toFixed(2)} x ATR, needs ${settings.bodyAtrMultiple}`,
    },
    {
      id: "ema",
      label: `Price ${up ? "above" : "below"} the 50 EMA`,
      passed: emaOk,
      detail: emaNow == null ? "not enough candles for a 50 EMA" : `price ${price > emaNow ? "above" : "below"} the 50 EMA`,
    },
    {
      id: "trend",
      label: "Trending, not ranging",
      passed: trendOk,
      detail:
        emaThen == null || adxNow == null
          ? "not enough history for the slope and ADX"
          : `50 EMA ${slopeOk ? (up ? "rising" : "falling") : "flat or against"} over ${settings.emaSlopeLookback}, ADX ${adxNow.toFixed(0)} vs ${settings.adxMin}`,
    },
    {
      id: "momentum",
      label: "Momentum",
      passed: momentumOk,
      detail: `${withDirection} of the last ${settings.momentumWindow} closed ${up ? "bullish" : "bearish"}, needs ${settings.momentumMin}`,
    },
  ];

  return { direction, rules, passed: rules.every((r) => r.passed) };
}

/**
 * The pullback zone, drawn on the previous candle.
 *
 * A buy anchors low to high, so 0 sits at the high (where the move ended) and
 * 1.0 at the low (where it began). The zone is the band between the two
 * retracement levels, and a close beyond 1.0 — past the candle's own extreme —
 * invalidates it. A sell is the mirror.
 */
export function buildZone(
  previous: Candle,
  current: Candle,
  direction: WickDirection,
  settings: WickSettings,
  periodMs: number,
): WickZone {
  const high = previous.h;
  const low = previous.l;
  const range = high - low;
  const up = direction === "buy";

  // Retracement measured back from the end of the move toward its start.
  const level = (r: number) => (up ? high - range * r : low + range * r);

  return {
    anchorHigh: high,
    anchorLow: low,
    zoneNear: level(settings.zoneStart),
    zoneFar: level(settings.zoneEnd),
    invalidation: level(1),
    origin: level(0),
    // A negative retracement: past the end of the move rather than back into it.
    overrunLevel: level(-settings.overrunLimit),
    fromT: current.t,
    toT: current.t + periodMs,
    state: "waiting",
  };
}

/**
 * Where the zone stands given how the current candle has traded so far.
 *
 * Invalidation is a CLOSE beyond the 1.0 level, as specified — a wick through it
 * is not enough. Reaching the zone only needs price to trade into it.
 */
export function zoneState(zone: WickZone, current: Candle, direction: WickDirection): {
  state: ZoneState;
  progress: number;
} {
  const up = direction === "buy";
  const invalidated = up ? current.c < zone.invalidation : current.c > zone.invalidation;
  if (invalidated) return { state: "invalidated", progress: 1 };

  const reached = up ? current.l <= zone.zoneNear : current.h >= zone.zoneNear;

  // Ran past the end of the move without ever pulling back: the entry never
  // came. Only checked when the zone was NOT reached — once price has traded
  // into the zone the setup has already done what it was waiting for, and a
  // later push beyond 0 is the move working, not a miss.
  //
  // A candle gives highs and lows but not their order, so "before the pullback"
  // is read as "and the pullback never happened at all" — the strongest claim
  // OHLC data can actually support.
  if (!reached) {
    const overran = up ? current.h > zone.overrunLevel : current.l < zone.overrunLevel;
    if (overran) return { state: "overrun", progress: 0 };
  }

  const span = Math.abs(zone.zoneFar - zone.zoneNear) || 1;
  const travelled = up
    ? (zone.zoneNear - Math.min(current.l, zone.zoneNear)) / span
    : (Math.max(current.h, zone.zoneNear) - zone.zoneNear) / span;

  return {
    state: reached ? "in-zone" : "waiting",
    progress: Math.max(0, Math.min(1, travelled)),
  };
}

/** The live setup on a timeframe: evaluated at the candle forming right now. */
export function detectWickSetup(
  symbol: string,
  candles: Candle[],
  timeframe: Timeframe,
  settings: WickSettings,
  periodMs: number,
): { setup: WickSetup | null; rules: WickRule[]; direction: WickDirection | null } {
  const { current, previous } = cursor(candles);
  if (previous < 1) return { setup: null, rules: [], direction: null };

  const verdict = evaluateRules(candles, current, settings);
  if (!verdict) return { setup: null, rules: [], direction: null };
  if (!verdict.passed) {
    return { setup: null, rules: verdict.rules, direction: verdict.direction };
  }

  const zone = buildZone(candles[previous], candles[current], verdict.direction, settings, periodMs);
  const { state, progress } = zoneState(zone, candles[current], verdict.direction);
  zone.state = state;

  return {
    direction: verdict.direction,
    rules: verdict.rules,
    setup: {
      symbol,
      timeframe,
      direction: verdict.direction,
      candleT: candles[current].t,
      zone,
      rules: verdict.rules,
      alignment: null,
      pullbackLabel: pullbackLabel(timeframe),
      zoneProgress: progress,
    },
  };
}

export interface HistoricalSetup extends WickSetup {
  /** How the zone resolved over the candle it was live for. */
  outcome: "reached" | "missed" | "overrun" | "invalidated";
  /** Bars into the candle's own period — always 1; kept for a future replay. */
  resolvedT: number;
}

/**
 * Every setup in the series, resolved against what price actually did next.
 *
 * This is the phase-1 verification tool: it replays history candle by candle,
 * using only the candles that existed at the time, so a setup listed here is one
 * the live detector would have produced on that bar — not one found with
 * hindsight.
 */
export function scanHistory(
  symbol: string,
  candles: Candle[],
  timeframe: Timeframe,
  settings: WickSettings,
  periodMs: number,
  limit = 60,
): HistoricalSetup[] {
  const out: HistoricalSetup[] = [];
  // Start late enough that ATR, the 50 EMA and ADX all have their windows.
  const start = Math.max(60, settings.emaSlopeLookback + 2);

  for (let i = start; i < candles.length; i++) {
    const verdict = evaluateRules(candles, i, settings);
    if (!verdict?.passed) continue;

    const zone = buildZone(candles[i - 1], candles[i], verdict.direction, settings, periodMs);
    const { state, progress } = zoneState(zone, candles[i], verdict.direction);
    zone.state = state;

    out.push({
      symbol,
      timeframe,
      direction: verdict.direction,
      candleT: candles[i].t,
      zone,
      rules: verdict.rules,
      alignment: null,
      pullbackLabel: pullbackLabel(timeframe),
      zoneProgress: progress,
      outcome:
        state === "invalidated" ? "invalidated"
          : state === "in-zone" ? "reached"
            : state === "overrun" ? "overrun"
              : "missed",
      resolvedT: candles[i].t + periodMs,
    });
  }

  return out.slice(-limit).reverse();
}

/**
 * Does the trade direction hold on the lower rungs?
 *
 * Loose checks one rung down, strict checks two. The per-timeframe test is
 * injected so the definition of "aligned" can be replaced without touching this.
 */
export function checkAlignment(
  timeframe: Timeframe,
  direction: WickDirection,
  series: Partial<Record<Timeframe, Candle[]>>,
  settings: WickSettings,
  check: AlignmentCheck = alignedByEma50,
): NonNullable<WickSetup["alignment"]> {
  const required = lowerRungs(timeframe, rungsFor(settings.alignment));
  const aligned: Timeframe[] = [];
  const missed: Timeframe[] = [];

  for (const tf of required) {
    const candles = series[tf];
    if (!candles?.length) {
      missed.push(tf);
      continue;
    }
    if (check(candles, direction).aligned) aligned.push(tf);
    else missed.push(tf);
  }

  return { required, aligned, missed, passed: missed.length === 0 };
}

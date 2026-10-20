import type { Candle, Direction, SwingPoint, Timeframe, TimeframeStructure } from "@/lib/types";
import { atr, clamp } from "./indicators";

/**
 * MARKET STRUCTURE ENGINE.
 *
 * Swing points are detected with a symmetric fractal rule: a bar is a swing high
 * if its high is the highest of the `k` bars either side of it. From the swing
 * sequence we derive Higher High / Higher Low / Lower High / Lower Low, then
 * Break of Structure (price closing beyond the most recent opposing swing) and
 * Change of Character (a break against the previously established bias).
 *
 * This is deliberately the same logic traders draw by hand — the point of the
 * product is that a user can verify what the engine claims.
 */

export function findSwings(candles: Candle[], k = 3): SwingPoint[] {
  const points: SwingPoint[] = [];
  for (let i = k; i < candles.length - k; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (candles[j].h >= candles[i].h) isHigh = false;
      if (candles[j].l <= candles[i].l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) points.push({ index: i, t: candles[i].t, price: candles[i].h, kind: "high" });
    else if (isLow) points.push({ index: i, t: candles[i].t, price: candles[i].l, kind: "low" });
  }
  return points;
}

function lastN(points: SwingPoint[], kind: "high" | "low", n: number): SwingPoint[] {
  return points.filter((p) => p.kind === kind).slice(-n);
}

export function analyseStructure(
  candles: Candle[],
  timeframe: Timeframe,
  swingLookback = 3,
): TimeframeStructure {
  const empty: TimeframeStructure = {
    timeframe,
    bias: "neutral",
    higherHigh: false,
    higherLow: false,
    lowerHigh: false,
    lowerLow: false,
    breakOfStructure: null,
    changeOfCharacter: null,
    state: "undefined",
    lastSwingHigh: null,
    lastSwingLow: null,
    strength: 0,
  };
  if (candles.length < swingLookback * 4 + 10) return empty;

  const swings = findSwings(candles, swingLookback);
  const highs = lastN(swings, "high", 3);
  const lows = lastN(swings, "low", 3);
  if (highs.length < 2 || lows.length < 2) return { ...empty, state: "undefined" };

  const [prevHigh, lastHigh] = highs.slice(-2);
  const [prevLow, lastLow] = lows.slice(-2);

  const higherHigh = lastHigh.price > prevHigh.price;
  const lowerHigh = lastHigh.price < prevHigh.price;
  const higherLow = lastLow.price > prevLow.price;
  const lowerLow = lastLow.price < prevLow.price;

  const close = candles[candles.length - 1].c;
  const atrSeries = atr(candles, 14);
  const atrNow = atrSeries[atrSeries.length - 1] ?? close * 0.005;

  // Break of structure: the most recent close takes out the last confirmed swing.
  let breakOfStructure: "bullish" | "bearish" | null = null;
  if (close > lastHigh.price) breakOfStructure = "bullish";
  else if (close < lastLow.price) breakOfStructure = "bearish";

  // Prior bias, measured from the swing sequence BEFORE the latest break.
  const priorBias: Direction =
    higherHigh && higherLow ? "bullish" : lowerHigh && lowerLow ? "bearish" : "neutral";

  let changeOfCharacter: "bullish" | "bearish" | null = null;
  if (breakOfStructure === "bullish" && priorBias === "bearish") changeOfCharacter = "bullish";
  if (breakOfStructure === "bearish" && priorBias === "bullish") changeOfCharacter = "bearish";

  // Consolidation: recent range is small relative to volatility.
  const window = candles.slice(-20);
  const rangeHigh = Math.max(...window.map((c) => c.h));
  const rangeLow = Math.min(...window.map((c) => c.l));
  const rangeInAtr = (rangeHigh - rangeLow) / (atrNow || 1);
  const consolidating = rangeInAtr < 3.2;

  let bias: Direction = priorBias;
  if (changeOfCharacter) bias = changeOfCharacter;
  else if (bias === "neutral" && breakOfStructure) bias = breakOfStructure;

  let state: TimeframeStructure["state"] = "undefined";
  if (consolidating) state = "consolidation";
  else if (changeOfCharacter) state = "potential-reversal";
  else if (bias !== "neutral") state = "trend-continuation";

  // Strength: the swing sequence itself (±0.6), confirmed by a break (±0.3) and by
  // how far price is extended from the opposing swing (±0.15).
  //
  // A change of character is the one case where the swing sequence is actively
  // misleading: the sequence that produced the prior bias is exactly what has
  // just been invalidated. So when a CHoCH is detected, the historic sequence is
  // heavily discounted and the new direction leads — otherwise `bias` and
  // `strength` end up telling the user two different stories.
  const sequenceWeight = changeOfCharacter ? 0.3 : 1;
  let strength = 0;
  if (higherHigh) strength += 0.3 * sequenceWeight;
  if (higherLow) strength += 0.3 * sequenceWeight;
  if (lowerHigh) strength -= 0.3 * sequenceWeight;
  if (lowerLow) strength -= 0.3 * sequenceWeight;
  if (breakOfStructure === "bullish") strength += 0.3;
  if (breakOfStructure === "bearish") strength -= 0.3;
  if (changeOfCharacter === "bullish") strength += 0.35;
  if (changeOfCharacter === "bearish") strength -= 0.35;
  const mid = (lastHigh.price + lastLow.price) / 2;
  strength += clamp((close - mid) / (atrNow * 4 || 1), -0.15, 0.15);
  if (consolidating) strength *= 0.55;

  return {
    timeframe,
    bias,
    higherHigh,
    higherLow,
    lowerHigh,
    lowerLow,
    breakOfStructure,
    changeOfCharacter,
    state,
    lastSwingHigh: lastHigh.price,
    lastSwingLow: lastLow.price,
    strength: clamp(strength, -1, 1),
  };
}

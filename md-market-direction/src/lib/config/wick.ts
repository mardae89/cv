import type { Timeframe } from "@/lib/types";

/**
 * WICK CATCHING — settings and the ladder.
 *
 * Every number the method depends on lives here with the default it was
 * specified with, so a threshold can be retuned from one place and reset from
 * the UI. Nothing in the engine hardcodes a level.
 *
 * Nothing in this file decides what a valid setup is. It only says what the
 * dials are set to.
 */

/** A setup matching the Wick Catching method. Never a buy or sell signal. */
export type WickDirection = "buy" | "sell";

export type WickAlignment = "loose" | "strict";

export interface WickSettings {
  /** Previous candle's body must be at least this multiple of ATR(14). */
  bodyAtrMultiple: number;
  /** Candles the 50 EMA slope is measured over. */
  emaSlopeLookback: number;
  /** ADX(14) must be above this for the market to count as trending. */
  adxMin: number;
  /** Of the last `momentumWindow` closed candles, this many must close in the direction. */
  momentumMin: number;
  momentumWindow: number;
  /** Retracement band drawn as the pullback zone. */
  zoneStart: number;
  zoneEnd: number;
  /** Loose checks the next 1 lower timeframe; strict checks the next 2. */
  alignment: WickAlignment;
}

export const WICK_DEFAULTS: WickSettings = {
  bodyAtrMultiple: 0.8,
  emaSlopeLookback: 10,
  adxMin: 20,
  momentumMin: 3,
  momentumWindow: 5,
  zoneStart: 0.382,
  zoneEnd: 0.75,
  alignment: "loose",
};

/** What each dial means in plain words, for the settings screen. */
export const WICK_SETTING_LABELS: Record<
  keyof Omit<WickSettings, "alignment">,
  { label: string; help: string; min: number; max: number; step: number }
> = {
  bodyAtrMultiple: {
    label: "Minimum body size",
    help: "Previous candle's body as a multiple of ATR(14). Below this it is treated as weak or a doji and rejected.",
    min: 0.1, max: 3, step: 0.05,
  },
  emaSlopeLookback: {
    label: "EMA slope lookback",
    help: "How many candles back the 50 EMA is compared against to call the slope rising or falling.",
    min: 2, max: 50, step: 1,
  },
  adxMin: {
    label: "Minimum ADX(14)",
    help: "Above this the market counts as trending rather than ranging.",
    min: 0, max: 60, step: 1,
  },
  momentumMin: {
    label: "Momentum candles required",
    help: "How many of the recent closed candles must close in the trade direction.",
    min: 1, max: 20, step: 1,
  },
  momentumWindow: {
    label: "Momentum window",
    help: "How many recent closed candles the momentum check looks at.",
    min: 2, max: 20, step: 1,
  },
  zoneStart: {
    label: "Zone start (retracement)",
    help: "Shallow edge of the pullback zone, as a retracement of the previous candle.",
    min: 0.1, max: 0.9, step: 0.001,
  },
  zoneEnd: {
    label: "Zone end (retracement)",
    help: "Deep edge of the pullback zone. Beyond 1.0 the setup is invalidated.",
    min: 0.2, max: 0.99, step: 0.001,
  },
};

/**
 * THE PULLBACK LADDER.
 *
 * A wick on one timeframe sends the trader to the next rung down to time the
 * entry. Deliberately NOT the app's full timeframe list: the 30M is a chart and
 * scan timeframe but not a rung, as specified.
 *
 * Monthly is not in the app yet. When it is added, "1M": "1W" goes on the front
 * of this list and nothing else has to change — every consumer reads the ladder
 * rather than assuming where it starts.
 */
export const WICK_LADDER: Partial<Record<Timeframe, Timeframe>> = {
  "1W": "1D",
  "1D": "4H",
  "4H": "1H",
  "1H": "15M",
  "15M": "5M",
};

/** Timeframes a wick setup can be scanned on: the rungs that have a rung below. */
export const WICK_TIMEFRAMES: Timeframe[] = Object.keys(WICK_LADDER) as Timeframe[];

/** Human names for the ladder, so labels read the way a trader says them. */
export const TF_SPOKEN: Record<Timeframe, string> = {
  "5M": "M5",
  "15M": "M15",
  "30M": "M30",
  "1H": "1H",
  "4H": "4H",
  "1D": "Daily",
  "1W": "Weekly",
};

/** The next N rungs below a timeframe. Loose checks 1, strict checks 2. */
export function lowerRungs(tf: Timeframe, count: number): Timeframe[] {
  const out: Timeframe[] = [];
  let cur: Timeframe | undefined = tf;
  for (let i = 0; i < count; i++) {
    cur = cur ? WICK_LADDER[cur] : undefined;
    if (!cur) break;
    out.push(cur);
  }
  return out;
}

export function rungsFor(alignment: WickAlignment): number {
  return alignment === "strict" ? 2 : 1;
}

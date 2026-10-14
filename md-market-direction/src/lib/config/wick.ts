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
  /**
   * How far price may run PAST the 0 level before the pullback is considered
   * missed, in retracement units of the previous candle's range. 0.25 means a
   * quarter of that range beyond the previous candle's extreme.
   */
  overrunLimit: number;
  /** Loose checks the next 1 lower timeframe; strict checks the next 2. */
  alignment: WickAlignment;
}

export const WICK_DEFAULTS: WickSettings = {
  // 0.45 and 15 replace the original 0.8 and 20, set from reading real setups:
  // a 0.49 x ATR body and an ADX of 17 were both being rejected on charts that
  // read as clean strong moves by eye.
  bodyAtrMultiple: 0.45,
  emaSlopeLookback: 10,
  adxMin: 15,
  momentumMin: 3,
  momentumWindow: 5,
  zoneStart: 0.382,
  zoneEnd: 0.75,
  overrunLimit: 0.25,
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
  overrunLimit: {
    label: "Overrun allowance",
    help: "How far price may run past the 0 level before the pullback counts as missed, as a share of the previous candle's range. 0 voids the setup the moment price trades beyond that candle's extreme.",
    min: 0, max: 1.5, step: 0.05,
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

/**
 * Wick setups are caught on the WEEKLY only.
 *
 * Everything below the weekly is for reading structure, not for catching wicks,
 * so the zone has one source and one meaning. The ladder below still maps the
 * weekly to its pullback timeframe, and the entry timeframes below that.
 */
export const WICK_TIMEFRAME: Timeframe = "1W";
export const WICK_TIMEFRAMES: Timeframe[] = [WICK_TIMEFRAME];

/** Timeframes the structure view can be read on — everything the app carries. */
export const SOS_TIMEFRAMES: Timeframe[] = ["5M", "15M", "30M", "1H", "4H", "1D", "1W"];

/** Human names for the ladder, so labels read the way a trader says them. */
export const TF_SPOKEN: Record<Timeframe, string> = {
  "5M": "5M",
  "15M": "15M",
  "30M": "30M",
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

/**
 * ENTRY TIMEFRAMES.
 *
 * The ladder says where the PULLBACK is read. Timing the entry happens lower
 * still: a weekly zone is hundreds of pips tall, and nobody enters off it.
 *
 * Three and four rungs below the signal timeframe, down the app's full
 * timeframe list rather than the pullback ladder — which is what gives the
 * weekly its 1H and 30M.
 */
const DESCENDING: Timeframe[] = ["1W", "1D", "4H", "1H", "30M", "15M", "5M"];

export function entryTimeframes(tf: Timeframe): Timeframe[] {
  const i = DESCENDING.indexOf(tf);
  if (i < 0) return [];
  return [DESCENDING[i + 3], DESCENDING[i + 4]].filter(Boolean) as Timeframe[];
}

/* -------------------------------------------------------------------------- */
/*  SHIFT OF STRUCTURE                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What counts as the pullback between the shift and the confirmation candle.
 *
 *   candle — at least one candle closing against the trade direction
 *   retest — price trades back to within `retestAtr` of the shift line
 */
export type SosPullback = "candle" | "retest";

export interface SosSettings {
  /**
   * Bars either side of an elbow. Lower finds more structure points; 3 was
   * missing turns that matter on the lower timeframes.
   */
  swingK: number;
  /** Confirmation candle body, as a multiple of ATR(14). */
  confirmBodyAtr: number;
  /** How the pullback between shift and confirmation is recognised. */
  pullback: SosPullback;
  /** For the retest reading: how close to the shift line price must return. */
  retestAtr: number;
  /** Candles the confirmation may arrive within after the pullback. */
  confirmWithin: number;
}

export const SOS_DEFAULTS: SosSettings = {
  swingK: 2,
  confirmBodyAtr: 0.3,
  pullback: "candle",
  retestAtr: 0.5,
  confirmWithin: 10,
};

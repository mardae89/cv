import type { Candle, Timeframe } from "@/lib/types";
import { TF_MS } from "./synth";

/**
 * TIMEFRAME AGGREGATION.
 *
 * A live provider is billed per request, so fetching six timeframes per asset is
 * both expensive and unnecessary: higher timeframes are derivable from lower
 * ones. We fetch TWO series per asset — one intraday base and one daily — and
 * build the rest locally:
 *
 *     5M  → 15M, 30M, 1H, 4H (from the 5-minute series)
 *     1D  → 1W               (from the daily series)
 *
 * That takes a full six-timeframe analysis from 6 requests per asset to 2, and
 * it also guarantees the timeframes are mutually consistent, which matters a
 * great deal here: the conflict detector compares timeframes against each other,
 * so mixing a live daily with a synthetic 4H would make it fire on noise.
 */

/** Bucket boundary for a bar, aligned to the epoch. */
function bucketStart(t: number, tf: Timeframe): number {
  const ms = TF_MS[tf];
  if (tf === "1W") {
    // Align weeks to Monday 00:00 UTC rather than the epoch (a Thursday).
    const d = new Date(t);
    const day = (d.getUTCDay() + 6) % 7; // Monday = 0
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * 86_400_000;
  }
  return Math.floor(t / ms) * ms;
}

/**
 * Roll a series up to a higher timeframe. Input must be ascending by time and of
 * a timeframe that divides the target (or, for 1W, be daily).
 */
export function aggregate(candles: Candle[], target: Timeframe): Candle[] {
  if (!candles.length) return [];
  const out: Candle[] = [];
  let cur: Candle | null = null;
  let curStart = -1;

  for (const c of candles) {
    const start = bucketStart(c.t, target);
    if (!cur || start !== curStart) {
      if (cur) out.push(cur);
      cur = { t: start, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v };
      curStart = start;
    } else {
      cur.h = Math.max(cur.h, c.h);
      cur.l = Math.min(cur.l, c.l);
      cur.c = c.c;
      cur.v += c.v;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** The two series a live provider actually has to fetch. */
export const BASE_INTRADAY: Timeframe = "5M";
export const BASE_DAILY: Timeframe = "1D";

/** Which base each timeframe is derived from. */
export const DERIVED_FROM: Record<Timeframe, Timeframe> = {
  "5M": "5M", "15M": "5M", "30M": "5M", "1H": "5M", "4H": "5M", "1D": "1D", "1W": "1D",
};

/**
 * Build every timeframe from the two base series. Any timeframe whose base is
 * missing or too short is returned empty, and the engine then reports that
 * timeframe's readings as unavailable rather than inventing them.
 */
export function buildTimeframes(
  intraday: Candle[],
  daily: Candle[],
): Record<Timeframe, Candle[]> {
  return {
    "5M": intraday,
    "15M": intraday.length ? aggregate(intraday, "15M") : [],
    "30M": intraday.length ? aggregate(intraday, "30M") : [],
    "1H": intraday.length ? aggregate(intraday, "1H") : [],
    "4H": intraday.length ? aggregate(intraday, "4H") : [],
    "1D": daily,
    "1W": daily.length ? aggregate(daily, "1W") : [],
  };
}

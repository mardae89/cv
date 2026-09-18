import type { Asset, Candle, Timeframe } from "@/lib/types";
import { gaussian, hashString, rng } from "@/lib/utils/random";

/**
 * DETERMINISTIC DEMO PRICE SERIES.
 *
 * This module produces *clearly labelled synthetic* market data so the whole
 * application is usable without provider credentials. It is never presented as
 * live data — every quote and candle it produces carries `demo: true`.
 *
 * Design goals:
 *  1. Deterministic  — the same symbol + day always produces the same history.
 *  2. Coherent across timeframes — all timeframes are driven by the SAME
 *     wall-clock trend cycles, so weekly / daily / 4H structure genuinely lines
 *     up (and shorter cycles genuinely create higher/lower timeframe conflict,
 *     which is what the conflict detector is there to catch).
 *  3. Readable — trends, pullbacks and consolidations are visible on a chart.
 */

export const TF_MS: Record<Timeframe, number> = {
  "5M": 5 * 60_000,
  "15M": 15 * 60_000,
  "1H": 60 * 60_000,
  "4H": 4 * 60 * 60_000,
  "1D": 24 * 60 * 60_000,
  "1W": 7 * 24 * 60 * 60_000,
};

export const TF_BARS: Record<Timeframe, number> = {
  "5M": 720,
  "15M": 720,
  "1H": 800,
  "4H": 900,
  "1D": 1300,
  "1W": 420,
};

const DAY = 24 * 60 * 60_000;
const YEAR = 365 * DAY;

/** Wall-clock trend cycles shared by every timeframe of a given asset. */
const CYCLES: { days: number; amp: number }[] = [
  { days: 210, amp: 1.0 },
  { days: 47, amp: 0.6 },
  { days: 11, amp: 0.22 },
  { days: 2.3, amp: 0.12 },
];

const TREND_SCALE = 4.2;
const NOISE_SCALE = 0.78;

/** The instantaneous annualised drift of an asset at time `t`. */
function driftAt(asset: Asset, phases: number[], t: number): number {
  let cyc = 0;
  for (let i = 0; i < CYCLES.length; i++) {
    const { days, amp } = CYCLES[i];
    cyc += amp * Math.sin((2 * Math.PI * t) / (days * DAY) + phases[i]);
  }
  return (asset.demoBias * 0.9 + cyc) * asset.demoVol * TREND_SCALE;
}

function phasesFor(asset: Asset, dayBucket: number): number[] {
  const next = rng(`${asset.symbol}:phase:${dayBucket}`);
  return CYCLES.map(() => next() * Math.PI * 2);
}

/** Aligns `now` down to the start of the current bar for the timeframe. */
export function alignTime(now: number, tf: Timeframe): number {
  const ms = TF_MS[tf];
  return Math.floor(now / ms) * ms;
}

export interface SeriesOptions {
  /** Treat this epoch-ms as "now". Defaults to Date.now(). */
  now?: number;
  /** Number of bars. Defaults to TF_BARS. */
  bars?: number;
}

const memo = new Map<string, { candles: Candle[]; expires: number }>();

/**
 * Generate a demo candle series. Results are memoised per (symbol, timeframe,
 * 5-minute bucket) so a dashboard scan does not regenerate the same history
 * dozens of times.
 */
export function generateSeries(asset: Asset, tf: Timeframe, opts: SeriesOptions = {}): Candle[] {
  const now = opts.now ?? Date.now();
  const bars = opts.bars ?? TF_BARS[tf];
  const bucket = Math.floor(now / (5 * 60_000));
  const key = `${asset.symbol}|${tf}|${bars}|${bucket}`;
  const hit = memo.get(key);
  if (hit && hit.expires > now) return hit.candles;

  const interval = TF_MS[tf];
  const end = alignTime(now, tf);
  const start = end - (bars - 1) * interval;
  const dayBucket = Math.floor(now / DAY);
  const phases = phasesFor(asset, dayBucket);

  // Noise stream is timeframe-specific; the drift is not (see module doc).
  const next = rng(`${asset.symbol}|${tf}|${dayBucket}`);
  const dt = interval / YEAR;
  const sigma = asset.demoVol * Math.sqrt(dt) * NOISE_SCALE;

  const logPath: number[] = new Array(bars);
  let x = 0;
  for (let i = 0; i < bars; i++) {
    const t = start + i * interval;
    const mu = driftAt(asset, phases, t) * dt;
    x += mu + sigma * gaussian(next);
    logPath[i] = x;
  }

  // Anchor the last close to the asset's reference price, with a slow day-to-day
  // wander so the universe is not frozen at the same prices forever.
  const wander = 1 + (rng(`${asset.symbol}|anchor|${dayBucket}`)() - 0.5) * 0.05;
  const anchor = asset.demoPrice * wander;
  const scale = anchor / Math.exp(logPath[bars - 1]);

  const candles: Candle[] = new Array(bars);
  const volSeed = rng(`${asset.symbol}|vol|${tf}|${dayBucket}`);
  for (let i = 0; i < bars; i++) {
    const close = Math.exp(logPath[i]) * scale;
    const open = i === 0 ? close * (1 - sigma * 0.4) : candles[i - 1].c;
    const range = Math.abs(close - open) + close * sigma * (0.55 + volSeed() * 0.9);
    const up = Math.max(open, close);
    const down = Math.min(open, close);
    const h = up + range * volSeed() * 0.55;
    const l = down - range * volSeed() * 0.55;
    const move = Math.abs(close - open) / (close * sigma || 1);
    const baseVol = 1_000_000 * (1 + asset.demoVol);
    const v = Math.round(baseVol * (0.6 + volSeed() * 0.8) * (1 + move * 0.45));
    candles[i] = { t: start + i * interval, o: open, h, l, c: close, v };
  }

  // A small, smooth "live" tick so the most recent bar moves between refreshes
  // without changing history. Deterministic per 5-minute bucket.
  const tickSeed = hashString(`${asset.symbol}|tick|${bucket}`) / 4294967296;
  const tail = candles[bars - 1];
  const tickMove = (tickSeed - 0.5) * 2 * tail.c * sigma * 0.8;
  tail.c = tail.c + tickMove;
  tail.h = Math.max(tail.h, tail.c);
  tail.l = Math.min(tail.l, tail.c);

  memo.set(key, { candles, expires: now + 5 * 60_000 });
  if (memo.size > 800) {
    for (const [k, val] of memo) {
      if (val.expires <= now) memo.delete(k);
    }
  }
  return candles;
}

/** Build the day's open/high/low/close summary from the daily series. */
export function dailySummary(candles: Candle[]) {
  const today = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  return {
    price: today.c,
    dayHigh: today.h,
    dayLow: today.l,
    prevClose: prev ? prev.c : today.o,
    volume: today.v,
  };
}

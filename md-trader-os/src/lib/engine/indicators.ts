import type { Candle } from "@/lib/types";

/** Simple moving average series. Returns null for indexes before the window fills. */
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      sum += values[i];
      continue;
    }
    if (prev === null) {
      sum += values[i];
      prev = sum / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export interface MacdSeries {
  macd: (number | null)[];
  signal: (number | null)[];
  hist: (number | null)[];
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdSeries {
  const fastE = ema(values, fast);
  const slowE = ema(values, slow);
  const macdLine = values.map((_, i) =>
    fastE[i] !== null && slowE[i] !== null ? (fastE[i] as number) - (slowE[i] as number) : null,
  );
  const compact = macdLine.filter((v): v is number => v !== null);
  const sigCompact = ema(compact, signalPeriod);
  const signal: (number | null)[] = new Array(values.length).fill(null);
  let j = 0;
  for (let i = 0; i < values.length; i++) {
    if (macdLine[i] !== null) {
      signal[i] = sigCompact[j];
      j++;
    }
  }
  const hist = values.map((_, i) =>
    macdLine[i] !== null && signal[i] !== null ? (macdLine[i] as number) - (signal[i] as number) : null,
  );
  return { macd: macdLine, signal, hist };
}

/** Average True Range (Wilder). */
export function atr(candles: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length <= period) return out;
  const tr: number[] = candles.map((c, i) => {
    if (i === 0) return c.h - c.l;
    const p = candles[i - 1].c;
    return Math.max(c.h - c.l, Math.abs(c.h - p), Math.abs(c.l - p));
  });
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** Rate of change in percent over `period` bars. */
export function roc(values: number[], period = 10): (number | null)[] {
  return values.map((v, i) => (i >= period && values[i - period] !== 0 ? ((v - values[i - period]) / values[i - period]) * 100 : null));
}

export function stdev(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const m = slice.reduce((a, b) => a + b, 0) / period;
    out[i] = Math.sqrt(slice.reduce((a, b) => a + (b - m) ** 2, 0) / period);
  }
  return out;
}

/** Slope of a series over `lookback` bars, normalised by price for comparability. */
export function slope(series: (number | null)[], index: number, lookback: number, reference: number): number | null {
  const a = series[index];
  const b = series[index - lookback];
  if (a === null || a === undefined || b === null || b === undefined || reference === 0) return null;
  return ((a - b) / reference) * 100;
}

export function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Squash an unbounded value into -1..1 with a soft knee at `scale`. */
export function squash(value: number, scale: number): number {
  if (!Number.isFinite(value) || scale === 0) return 0;
  return Math.tanh(value / scale);
}

import type { Candle, Direction, Timeframe } from "@/lib/types";
import { atr, clamp, ema, macd, roc, rsi, sma, squash } from "./indicators";
import { findSwings } from "./structure";

/**
 * BACKTESTING ENGINE.
 *
 * Historical testing can only use the evidence that actually existed bar by bar.
 * News, macro and event-risk history are not stored in this build, so the
 * historical score uses the three market-derived categories (technical trend,
 * market structure, momentum) re-weighted to 100. That is stated plainly in the
 * UI: this tests the price-based part of the MD Direction Score, not the whole
 * score, and past behaviour is never evidence of future performance.
 */

export interface HistoricalScorePoint {
  index: number;
  t: number;
  score: number;
}

const WEIGHTS = { technical: 40, structure: 35, momentum: 25 };

export function historicalScores(candles: Candle[]): HistoricalScorePoint[] {
  const closes = candles.map((c) => c.c);
  const ma50 = ema(closes, 50);
  const ma200 = sma(closes, 200);
  const rsiS = rsi(closes, 14);
  const macdS = macd(closes);
  const rocS = roc(closes, 10);
  const atrS = atr(candles, 14);
  const swings = findSwings(candles, 3);

  // Pointer walk over confirmed swings so each bar only sees the past.
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  let swingPtr = 0;

  const out: HistoricalScorePoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    while (swingPtr < swings.length && swings[swingPtr].index + 3 <= i) {
      const s = swings[swingPtr];
      if (s.kind === "high") swingHighs.push(s.price);
      else swingLows.push(s.price);
      swingPtr++;
    }
    if (i < 210) continue;

    const price = closes[i];
    const a = atrS[i] ?? price * 0.01;

    /* technical */
    let tech = 0;
    if (ma50[i] != null) tech += price > (ma50[i] as number) ? 0.3 : -0.3;
    if (ma200[i] != null) tech += price > (ma200[i] as number) ? 0.25 : -0.25;
    if (ma50[i] != null && ma200[i] != null) tech += (ma50[i] as number) > (ma200[i] as number) ? 0.15 : -0.15;
    if (ma50[i] != null && ma50[i - 10] != null) {
      tech += clamp((((ma50[i] as number) - (ma50[i - 10] as number)) / price) * 40, -0.3, 0.3);
    }
    tech = clamp(tech, -1, 1);

    /* structure */
    let struct = 0;
    const h = swingHighs.slice(-2);
    const l = swingLows.slice(-2);
    if (h.length === 2) struct += h[1] > h[0] ? 0.3 : -0.3;
    if (l.length === 2) struct += l[1] > l[0] ? 0.3 : -0.3;
    if (h.length && price > h[h.length - 1]) struct += 0.25;
    if (l.length && price < l[l.length - 1]) struct -= 0.25;
    if (h.length && l.length) {
      const mid = (h[h.length - 1] + l[l.length - 1]) / 2;
      struct += clamp((price - mid) / (a * 4), -0.15, 0.15);
    }
    struct = clamp(struct, -1, 1);

    /* momentum */
    let momo = 0;
    if (rsiS[i] != null) momo += clamp(((rsiS[i] as number) - 50) / 30, -1, 1) * 0.4;
    if (macdS.hist[i] != null) momo += squash((macdS.hist[i] as number) / (price * 0.0015 || 1), 2) * 0.35;
    if (rocS[i] != null) momo += squash(rocS[i] as number, 4) * 0.25;
    momo = clamp(momo, -1, 1);

    const raw = tech * WEIGHTS.technical + struct * WEIGHTS.structure + momo * WEIGHTS.momentum;
    out.push({ index: i, t: candles[i].t, score: clamp(Math.round(50 + raw / 2), 0, 100) });
  }
  return out;
}

export interface BacktestParams {
  symbol: string;
  timeframe: Timeframe;
  direction: Exclude<Direction, "mixed" | "neutral">;
  minScore: number;
  holdingBars: number;
  /** Minimum bars between signals, so one trend does not generate 300 overlapping signals. */
  cooldownBars?: number;
}

export interface BacktestTrade {
  t: number;
  entry: number;
  exit: number;
  score: number;
  returnPct: number;
  mfePct: number;
  maePct: number;
}

export interface BacktestResult {
  params: BacktestParams;
  signals: number;
  trades: BacktestTrade[];
  avgReturnPct: number;
  medianReturnPct: number;
  winRate: number;
  bestPct: number;
  worstPct: number;
  avgMfePct: number;
  avgMaePct: number;
  maxDrawdownPct: number;
  profitFactor: number | null;
  barsTested: number;
  scoreSeries: HistoricalScorePoint[];
  note: string;
}

export function runBacktest(candles: Candle[], params: BacktestParams): BacktestResult {
  const series = historicalScores(candles);
  const cooldown = params.cooldownBars ?? Math.max(3, Math.round(params.holdingBars / 2));
  const trades: BacktestTrade[] = [];
  let lastSignal = -Infinity;

  for (const point of series) {
    const qualifies =
      params.direction === "bullish" ? point.score >= params.minScore : point.score <= 100 - params.minScore;
    if (!qualifies) continue;
    if (point.index - lastSignal < cooldown) continue;
    const exitIndex = point.index + params.holdingBars;
    if (exitIndex >= candles.length) break;
    lastSignal = point.index;

    const entry = candles[point.index].c;
    const exit = candles[exitIndex].c;
    const window = candles.slice(point.index + 1, exitIndex + 1);
    const high = Math.max(...window.map((c) => c.h));
    const low = Math.min(...window.map((c) => c.l));
    const sign = params.direction === "bullish" ? 1 : -1;

    trades.push({
      t: candles[point.index].t,
      entry,
      exit,
      score: point.score,
      returnPct: ((exit - entry) / entry) * 100 * sign,
      mfePct: (((sign === 1 ? high : low) - entry) / entry) * 100 * sign,
      maePct: (((sign === 1 ? low : high) - entry) / entry) * 100 * sign,
    });
  }

  const returns = trades.map((t) => t.returnPct);
  const sorted = returns.slice().sort((a, b) => a - b);
  const wins = returns.filter((r) => r > 0);
  const losses = returns.filter((r) => r <= 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));

  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  for (const r of returns) {
    equity += r;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
  }

  const avg = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;

  return {
    params,
    signals: trades.length,
    trades: trades.slice(-200),
    avgReturnPct: avg,
    medianReturnPct: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
    winRate: returns.length ? (wins.length / returns.length) * 100 : 0,
    bestPct: sorted.length ? sorted[sorted.length - 1] : 0,
    worstPct: sorted.length ? sorted[0] : 0,
    avgMfePct: trades.length ? trades.reduce((a, b) => a + b.mfePct, 0) / trades.length : 0,
    avgMaePct: trades.length ? trades.reduce((a, b) => a + b.maePct, 0) / trades.length : 0,
    maxDrawdownPct: maxDd,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    barsTested: series.length,
    scoreSeries: series.filter((_, i) => i % Math.max(1, Math.floor(series.length / 300)) === 0),
    note:
      "Historical scores use the price-derived categories only (technical trend, market structure, momentum) re-weighted to 100. News, macro and event-risk history are not replayed. Past behaviour is not evidence of future performance.",
  };
}

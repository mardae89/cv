import type { Candle, Direction, Timeframe, TimeframeMomentum, TimeframeTechnical } from "@/lib/types";
import { atr, clamp, macd, roc, rsi, sma, squash } from "./indicators";

/**
 * TECHNICAL TREND + MOMENTUM per timeframe.
 *
 * Trend is built from the two moving averages traders actually watch (50 & 200),
 * their slopes, and how extended price is from the 50 MA in ATR terms. Momentum
 * combines RSI, MACD histogram, rate of change and relative volume.
 */

function slopeDirection(series: (number | null)[], lookback: number, reference: number) {
  const n = series.length;
  const a = series[n - 1];
  const b = series[n - 1 - lookback];
  if (a == null || b == null || !reference) return { dir: null as "rising" | "falling" | "flat" | null, pct: 0 };
  const pct = ((a - b) / reference) * 100;
  const dir: "rising" | "falling" | "flat" = pct > 0.08 ? "rising" : pct < -0.08 ? "falling" : "flat";
  return { dir, pct };
}

export function analyseTechnical(candles: Candle[], timeframe: Timeframe): TimeframeTechnical {
  const closes = candles.map((c) => c.c);
  const price = closes[closes.length - 1];
  const ma50s = sma(closes, 50);
  const ma200s = sma(closes, 200);
  const ma50 = ma50s[ma50s.length - 1];
  const ma200 = ma200s[ma200s.length - 1];
  const atrSeries = atr(candles, 14);
  const atrNow = atrSeries[atrSeries.length - 1];
  const atrPct = atrNow != null && price ? (atrNow / price) * 100 : null;

  const s50 = slopeDirection(ma50s, Math.min(10, candles.length - 1), price);
  const s200 = slopeDirection(ma200s, Math.min(20, candles.length - 1), price);

  // Longer-run ATR baseline tells us whether current volatility is unusual.
  const atrHistory = atrSeries.filter((v): v is number => v != null).slice(-120);
  const atrAvg = atrHistory.length ? atrHistory.reduce((a, b) => a + b, 0) / atrHistory.length : null;
  const volRatio = atrNow != null && atrAvg ? atrNow / atrAvg : 1;
  const volatility: TimeframeTechnical["volatility"] =
    volRatio > 1.6 ? "high" : volRatio > 1.2 ? "elevated" : volRatio < 0.75 ? "low" : "normal";

  let strength = 0;
  if (ma50 != null) strength += price > ma50 ? 0.28 : -0.28;
  if (ma200 != null) strength += price > ma200 ? 0.22 : -0.22;
  if (ma50 != null && ma200 != null) strength += ma50 > ma200 ? 0.12 : -0.12;
  strength += clamp(s50.pct * 0.35, -0.22, 0.22);
  strength += clamp(s200.pct * 0.25, -0.16, 0.16);
  // Being extremely extended from the 50 MA is a mild caution, not a reversal call.
  if (ma50 != null && atrNow) {
    const extension = (price - ma50) / atrNow;
    if (Math.abs(extension) > 4) strength -= Math.sign(extension) * 0.08;
  }
  strength = clamp(strength, -1, 1);

  const trend: Direction = strength > 0.2 ? "bullish" : strength < -0.2 ? "bearish" : "neutral";

  return {
    timeframe,
    price,
    ma50: ma50 ?? null,
    ma200: ma200 ?? null,
    priceVsMa50: ma50 != null ? (price > ma50 ? "above" : "below") : null,
    priceVsMa200: ma200 != null ? (price > ma200 ? "above" : "below") : null,
    ma50Slope: s50.dir,
    ma200Slope: s200.dir,
    trend,
    strength,
    atr: atrNow ?? null,
    atrPct,
    volatility,
  };
}

export function analyseMomentum(candles: Candle[], timeframe: Timeframe): TimeframeMomentum {
  const closes = candles.map((c) => c.c);
  const rsiSeries = rsi(closes, 14);
  const rsiNow = rsiSeries[rsiSeries.length - 1];
  const m = macd(closes);
  const hist = m.hist[m.hist.length - 1];
  const macdLine = m.macd[m.macd.length - 1];
  const signalLine = m.signal[m.signal.length - 1];
  const rocSeries = roc(closes, 10);
  const rocNow = rocSeries[rocSeries.length - 1];

  const vols = candles.slice(-40).map((c) => c.v);
  const volAvg = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : 0;
  const volumeVsAvg = volAvg ? candles[candles.length - 1].v / volAvg : null;

  const macdState: TimeframeMomentum["macdState"] =
    macdLine == null || signalLine == null
      ? null
      : macdLine > signalLine && (hist ?? 0) > 0
        ? "bullish"
        : macdLine < signalLine && (hist ?? 0) < 0
          ? "bearish"
          : "flat";

  let strength = 0;
  if (rsiNow != null) strength += clamp((rsiNow - 50) / 30, -1, 1) * 0.4;
  if (hist != null) strength += squash(hist / (closes[closes.length - 1] * 0.0015 || 1), 2) * 0.35;
  if (rocNow != null) strength += squash(rocNow, 4) * 0.25;
  // Volume confirms the move it accompanies; it never sets direction on its own.
  if (volumeVsAvg != null && volumeVsAvg > 1.25) strength *= 1.12;
  if (volumeVsAvg != null && volumeVsAvg < 0.7) strength *= 0.88;

  return {
    timeframe,
    rsi: rsiNow ?? null,
    macdHist: hist ?? null,
    macdState,
    roc: rocNow ?? null,
    volumeVsAvg,
    strength: clamp(strength, -1, 1),
  };
}

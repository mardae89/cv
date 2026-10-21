import type { AssetAnalysis, Candle, Direction } from "@/lib/types";
import { aggregate } from "@/lib/data/aggregate";
import { pipSize, pipUnit } from "@/lib/data/universe";
import { MOMENTUM_METER as M } from "@/lib/config/scoring";
import { fmtPrice, untilLabel } from "@/lib/utils/format";
import { atr, clamp, ema, macd, rsi } from "./indicators";

/**
 * THE MOMENTUM METER.
 *
 * Built on the MD strategy rather than on a generic oscillator. The question it
 * answers is the one the strategy asks every week: is there enough momentum
 * behind last week's candle for this week's pullback wick to be caught and
 * pushed on?
 *
 *   weekly side       price vs the weekly 50 EMA — buys above, sells below
 *   previous week     a nice-size candle in that direction, closing strong
 *   daily pullback    a clear pullback into that candle this week
 *   the turn          lower timeframes turning back in the weekly direction
 *
 * The needle is a weighted sum of where the push comes from, so every point on
 * it can be traced to a timeframe or a rule. Each timeframe also has its own
 * needle on its own scale: higher timeframes move slowly, the 5M moves with
 * every tick of the feed.
 *
 * Weeks are built from the daily candles here, Monday to Friday, so "last
 * week's candle" and "this week's pullback" are always measured on the same
 * data.
 */

export type MeterTimeframe = "1W" | "1D" | "4H" | "1H" | "15M" | "5M";
export const METER_TIMEFRAMES: MeterTimeframe[] = ["1W", "1D", "4H", "1H", "15M", "5M"];

export interface TimeframePush {
  timeframe: MeterTimeframe;
  /** −100 (full bearish push) … +100 (full bullish push). */
  push: number;
  /** The same reading one bar earlier — tells building from fading. */
  previous: number;
  pace: "building" | "fading" | "steady";
  rsi: number | null;
  macd: "rising" | "falling" | "flat" | null;
  /** Recent readings, oldest first, for the trail behind the needle. */
  trail: number[];
  /** Open time of the latest bar the reading includes. */
  barTime: number | null;
}

export interface PushSource {
  key: keyof typeof M.weights;
  label: string;
  /** Signed points this source puts on the needle; its weight is the cap. */
  points: number;
  weight: number;
  detail: string;
}

export interface Gate {
  key: "side" | "prevWeek" | "pullback" | "turn";
  label: string;
  /** null when the data to judge it is missing. */
  pass: boolean | null;
  value: string;
  detail: string;
}

export type Verdict = "in-play" | "pullback" | "waiting" | "not-this-week" | "no-data";

export interface MomentumMeter {
  symbol: string;
  name: string;
  precision: number;
  pipUnit: "pips" | "points";
  price: number;
  side: Direction;
  push: number;
  pushLabel: string;
  verdict: Verdict;
  verdictTitle: string;
  verdictDetail: string;
  gates: Gate[];
  sources: PushSource[];
  timeframes: TimeframePush[];
  aligned: number;
  prevWeek: {
    o: number; h: number; l: number; c: number;
    direction: Direction;
    bodyAtr: number;
    closeLocation: number;
    size: "Small" | "Modest" | "Nice size" | "Large" | "Very large";
  } | null;
  pullback: {
    status: "none" | "wick" | "clean" | "golden" | "deep" | "invalidated";
    depth: number;
    nowDepth: number;
    counterDays: number;
  } | null;
  volatility: { weeklyAtr: number | null; weekUsed: number | null; dailyAtr: number | null; dayUsed: number | null };
  /** For the drawings: the last weeks with their 50 EMA, the last days with last week's levels. */
  weekly: { bars: Candle[]; ema: (number | null)[] };
  daily: { bars: Candle[]; levels: { label: string; price: number; kind: "range" | "fib" }[]; weekStart: number | null };
  why: string[];
  risks: string[];
  generatedAt: number;
  demo: boolean;
}

export interface MeterInputs {
  analysis: AssetAnalysis;
  daily: Candle[];
  fourHour: Candle[];
  oneHour: Candle[];
  fifteen: Candle[];
  five: Candle[];
  /** Draw trails behind the needles. Off for the ranked board, which only needs the reading. */
  trail?: boolean;
}

function lastNumber(series: (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) if (series[i] != null) return series[i];
  return null;
}

/**
 * One timeframe's push, on its own scale. RSI is already scale-free; the MACD
 * histogram and the 10-bar move are divided by that timeframe's ATR, so a
 * 5-minute push and a weekly push read alike even though one is a few pips and
 * the other a few hundred.
 */
export function pushOf(candles: Candle[]): { push: number; rsi: number | null; hist: number | null; histPrev: number | null } {
  if (candles.length < 35) return { push: 0, rsi: null, hist: null, histPrev: null };
  const closes = candles.map((c) => c.c);
  const r = lastNumber(rsi(closes, 14));
  const m = macd(closes);
  const hist = m.hist[m.hist.length - 1] ?? null;
  const histPrev = m.hist[m.hist.length - 2] ?? null;
  const a = lastNumber(atr(candles, 14)) ?? closes[closes.length - 1] * 0.001;
  const move = closes[closes.length - 1] - closes[closes.length - 11];

  let s = 0;
  if (r != null) s += clamp((r - 50) / 22, -1, 1) * 0.4;
  if (hist != null && a) s += Math.tanh(hist / (a * 0.18)) * 0.35;
  if (a) s += Math.tanh(move / (a * 2.2)) * 0.25;
  return { push: clamp(s, -1, 1) * 100, rsi: r, hist, histPrev };
}

/** Indicators only need a few hundred bars of warm-up; reading more is waste. */
const WINDOW = 320;

function timeframeReading(tf: MeterTimeframe, candles: Candle[], withTrail: boolean): TimeframePush {
  const base = candles.slice(-(WINDOW + M.trail + 1));
  const now = pushOf(base);
  const prev = pushOf(base.slice(0, -1));
  const trail: number[] = [];
  if (withTrail && base.length > 60) {
    for (let k = Math.min(M.trail, base.length - 40); k >= 1; k--) trail.push(Math.round(pushOf(base.slice(0, base.length - k)).push));
    trail.push(Math.round(now.push));
  }
  const delta = now.push - prev.push;
  return {
    timeframe: tf,
    push: Math.round(now.push),
    previous: Math.round(prev.push),
    pace: Math.abs(delta) < 2 ? "steady" : Math.sign(delta) === Math.sign(now.push || delta) ? "building" : "fading",
    rsi: now.rsi,
    macd: now.hist == null || now.histPrev == null ? null : now.hist > now.histPrev ? "rising" : now.hist < now.histPrev ? "falling" : "flat",
    trail,
    barTime: candles.length ? candles[candles.length - 1].t : null,
  };
}

function dirSign(d: Direction): number {
  return d === "bullish" ? 1 : d === "bearish" ? -1 : 0;
}

function pushLabel(push: number): string {
  if (push >= 55) return "Pushing up strongly";
  if (push >= 20) return "Pushing up";
  if (push > -20) return "Stalling";
  if (push > -55) return "Pushing down";
  return "Pushing down strongly";
}

function sizeLabel(bodyAtr: number): NonNullable<MomentumMeter["prevWeek"]>["size"] {
  const s = M.prevWeek;
  if (bodyAtr >= s.veryLarge) return "Very large";
  if (bodyAtr >= s.large) return "Large";
  if (bodyAtr >= s.niceSize) return "Nice size";
  if (bodyAtr >= s.small) return "Modest";
  return "Small";
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function buildMomentumMeter(inputs: MeterInputs): MomentumMeter {
  const { analysis, daily } = inputs;
  const asset = analysis.asset;
  const p = asset.precision;
  const pip = pipSize(asset.symbol);
  const unit = pipUnit(asset.symbol);
  const withTrail = inputs.trail !== false;
  const latest = inputs.five[inputs.five.length - 1] ?? daily[daily.length - 1];
  const price = latest?.c ?? analysis.quote.price;

  const weekly = aggregate(daily, "1W");
  const tfs: TimeframePush[] = [
    timeframeReading("1W", weekly, withTrail),
    timeframeReading("1D", daily, withTrail),
    timeframeReading("4H", inputs.fourHour, withTrail),
    timeframeReading("1H", inputs.oneHour, withTrail),
    timeframeReading("15M", inputs.fifteen, withTrail),
    timeframeReading("5M", inputs.five, withTrail),
  ];
  const tf = (k: MeterTimeframe) => tfs.find((x) => x.timeframe === k)!;

  const base = {
    symbol: asset.symbol, name: asset.name, precision: p, pipUnit: unit, price,
    timeframes: tfs, generatedAt: Date.now(), demo: analysis.demo,
  };

  if (weekly.length < 56 || daily.length < 30) {
    return {
      ...base, side: "neutral", push: 0, pushLabel: "Data unavailable", verdict: "no-data",
      verdictTitle: "Not enough history", verdictDetail: "The weekly 50 EMA needs at least a year of daily candles.",
      gates: [], sources: [], aligned: 0, prevWeek: null, pullback: null,
      volatility: { weeklyAtr: null, weekUsed: null, dailyAtr: null, dayUsed: null },
      weekly: { bars: weekly.slice(-12), ema: [] }, daily: { bars: daily.slice(-12), levels: [], weekStart: null },
      why: [], risks: [],
    };
  }

  /* ------------------------------ 1. weekly side ------------------------------ */
  const current = weekly[weekly.length - 1];
  const prev = weekly[weekly.length - 2];
  const emaSeries = ema(weekly.map((w) => w.c), 50);
  const emaW = emaSeries[emaSeries.length - 1] ?? price;
  // ATR of COMPLETED weeks: the forming week would understate it early on.
  const atrW = lastNumber(atr(weekly.slice(0, -1), 14)) ?? (prev.h - prev.l);
  const atrD = lastNumber(atr(daily.slice(0, -1), 14));
  const dist = (price - emaW) / (atrW || 1);
  const side: Direction = dist > 0 ? "bullish" : dist < 0 ? "bearish" : "neutral";
  const sign = dirSign(side);
  const sideClear = Math.abs(dist) >= M.sideClearAtr;
  const sideWord = side === "bullish" ? "above" : "below";
  const lookFor = side === "bullish" ? "buys" : "sells";

  /* ---------------------------- 2. previous week ----------------------------- */
  const range = prev.h - prev.l || pip;
  const body = prev.c - prev.o;
  const prevDir: Direction = body > 0 ? "bullish" : body < 0 ? "bearish" : "neutral";
  const bodyAtr = Math.abs(body) / (atrW || 1);
  const closeLoc = prevDir === "bullish" ? (prev.c - prev.l) / range : prevDir === "bearish" ? (prev.h - prev.c) / range : 0.5;
  const size = sizeLabel(bodyAtr);
  const prevMatches = prevDir === side && side !== "neutral";
  const prevPass = prevMatches && bodyAtr >= M.prevWeek.niceSize && closeLoc >= M.prevWeekCloseLocation;
  const prevStrength =
    dirSign(prevDir) * (0.7 * clamp((bodyAtr - 0.2) / 0.6, 0, 1) + 0.3 * clamp((closeLoc - 0.4) / 0.5, 0, 1));

  /* ---------------------------- 3. daily pullback ---------------------------- */
  const dir = sign || dirSign(prevDir) || 1;
  const thisWeek = daily.filter((d) => d.t >= current.t);
  const depth = dir < 0 ? (current.h - prev.l) / range : (prev.h - current.l) / range;
  const nowDepth = dir < 0 ? (price - prev.l) / range : (prev.h - price) / range;
  const counterDays = thisWeek.filter((d) => (dir < 0 ? d.c > d.o : d.c < d.o)).length;
  const P = M.pullback;
  const pullbackStatus: NonNullable<MomentumMeter["pullback"]>["status"] =
    depth > 1 ? "invalidated"
      : depth < P.min ? "none"
        : depth > P.deep ? "deep"
          : counterDays === 0 ? "wick"
            : depth >= P.goldenLow && depth <= P.goldenHigh ? "golden" : "clean";
  const pullbackPass = pullbackStatus === "clean" || pullbackStatus === "golden";

  /* -------------------------------- 4. the turn ------------------------------- */
  const oneH = tf("1H").push * dir;
  const fifteen = tf("15M").push * dir;
  const turnPass = oneH > M.turnThreshold && fifteen > 0;

  /* ------------------------------ the needle ---------------------------------- */
  const W = M.weights;
  const wStruct = analysis.structure.find((s) => s.timeframe === "1W")?.strength ?? 0;
  const readings: [keyof typeof W, string, number, string][] = [
    ["weeklyEma", "Weekly 50 EMA", clamp(dist / 2, -1, 1), `${Math.abs(dist).toFixed(2)}× weekly ATR ${sideWord} the 50 EMA at ${fmtPrice(emaW, p)}`],
    ["prevWeek", "Last week's candle", prevStrength, `${prevDir === "neutral" ? "Flat" : prevDir === "bullish" ? "Bullish" : "Bearish"} body ${bodyAtr.toFixed(2)}× weekly ATR, closed ${pct(closeLoc)} toward its ${prevDir === "bearish" ? "low" : "high"}`],
    ["weeklyStructure", "Weekly structure", wStruct, wStruct > 0.18 ? "Higher highs and higher lows" : wStruct < -0.18 ? "Lower highs and lower lows" : "No clear weekly structure"],
    ["daily", "Daily momentum", tf("1D").push / 100, describeTf(tf("1D"))],
    ["fourHour", "4H momentum", tf("4H").push / 100, describeTf(tf("4H"))],
    ["oneHour", "1H momentum", tf("1H").push / 100, describeTf(tf("1H"))],
    ["fifteen", "15M momentum", tf("15M").push / 100, describeTf(tf("15M"))],
  ];
  const sources: PushSource[] = readings.map(([key, label, r, detail]) => ({
    key, label, weight: W[key], points: Math.round(r * W[key] * 10) / 10, detail,
  }));
  const push = Math.round(clamp(sources.reduce((s, x) => s + x.points, 0), -100, 100));
  const aligned = tfs.filter((t) => Math.sign(t.push) === dir && Math.abs(t.push) >= 10).length;

  /* -------------------------------- gates ------------------------------------ */
  // With no side, or a last-week candle pointing the other way, there is no
  // pullback to judge: those two checks are shown as not applicable, not failed.
  const applicable = sideClear && prevMatches;
  const gates: Gate[] = [
    {
      key: "side",
      label: "Weekly 50 EMA side",
      pass: sideClear,
      value: sideClear ? `${side === "bullish" ? "Above" : "Below"} — looking for ${lookFor}` : "Hugging the 50 EMA",
      detail: `Price is ${Math.abs(dist).toFixed(2)}× the weekly ATR ${sideWord} the weekly 50 EMA (${fmtPrice(emaW, p)}).${sideClear ? "" : " Too close to call a side."}`,
    },
    {
      key: "prevWeek",
      label: "Last week's momentum candle",
      pass: prevPass,
      value: prevMatches ? `${size} ${prevDir} candle` : prevDir === "neutral" ? "No body" : `${prevDir === "bullish" ? "Bullish" : "Bearish"} — against the side`,
      detail: `Body ${bodyAtr.toFixed(2)}× weekly ATR (needs ${M.prevWeek.niceSize}×), closed ${pct(closeLoc)} of the way toward its ${prevDir === "bearish" ? "low" : "high"} (needs ${pct(M.prevWeekCloseLocation)}).`,
    },
    {
      key: "pullback",
      label: "Daily pullback this week",
      pass: applicable ? pullbackPass : null,
      value: applicable ? PULLBACK_LABEL[pullbackStatus] : "Needs a qualifying weekly candle first",
      detail: `This week has retraced ${pct(Math.max(0, depth))} into last week's range at its furthest${counterDays ? `, on ${counterDays} ${dir < 0 ? "up" : "down"} day${counterDays > 1 ? "s" : ""}` : ", with no daily candle against the trend yet"}. The clean zone is ${pct(P.min)}–${pct(P.deep)}, ideally ${pct(P.goldenLow)}–${pct(P.goldenHigh)}.`,
    },
    {
      key: "turn",
      label: `Momentum turning back ${dir < 0 ? "down" : "up"}`,
      pass: applicable ? turnPass : null,
      value: !applicable ? "Needs a qualifying weekly candle first" : turnPass ? `1H ${fmtSigned(tf("1H").push)} · 15M ${fmtSigned(tf("15M").push)}` : `Not yet — 1H ${fmtSigned(tf("1H").push)}`,
      detail: `The trigger: the 1H push beyond ${M.turnThreshold} and the 15M on the same side, ${dir < 0 ? "down" : "up"} with the weekly.`,
    },
  ];

  let verdict: Verdict;
  let verdictTitle: string;
  let verdictDetail: string;
  const dWord = dir < 0 ? "down" : "up";
  if (!sideClear || !prevPass) {
    verdict = "not-this-week";
    verdictTitle = "Not this week";
    verdictDetail = !sideClear
      ? "Price is too close to the weekly 50 EMA to have a side."
      : !prevMatches
        ? `Last week's candle closed ${prevDir} — it does not back a move ${dWord}.`
        : `Last week's candle is ${size.toLowerCase()} (${bodyAtr.toFixed(2)}× ATR, closed ${pct(closeLoc)} strong) — not enough momentum to continue from.`;
  } else if (pullbackStatus === "invalidated") {
    verdict = "not-this-week";
    verdictTitle = "Not this week";
    verdictDetail = `The pullback has gone beyond last week's ${dir < 0 ? "high" : "low"} — that candle's momentum is spent.`;
  } else if (pullbackStatus === "none") {
    verdict = "waiting";
    verdictTitle = "Waiting for the pullback";
    verdictDetail = `Last week qualifies. The daily has not pulled back into it yet — the wick zone starts ${pct(P.min)} into last week's range.`;
  } else if (pullbackPass && turnPass) {
    verdict = "in-play";
    verdictTitle = `Setup in play — momentum pushing ${dWord}`;
    verdictDetail = `Weekly side, last week's candle and a clean daily pullback all line up, and the lower timeframes are turning back ${dWord}.`;
  } else {
    verdict = "pullback";
    verdictTitle = pullbackStatus === "wick" || pullbackStatus === "deep" ? "Pullback forming — not clean yet" : "Pullback in progress";
    verdictDetail = pullbackPass
      ? `The daily pullback is there. Wait for the 1H and 15M to turn back ${dWord} before catching the wick.`
      : pullbackStatus === "deep"
        ? `The pullback is deep (${pct(depth)}). It can still hold, but last week's momentum is being tested.`
        : "Price has wicked into the zone without a daily candle against the trend — not a clear pullback yet.";
  }

  /* --------------------------- volatility / room ------------------------------ */
  const today = daily[daily.length - 1];
  const weekUsed = atrW ? (current.h - current.l) / atrW : null;
  const dayUsed = atrD ? (today.h - today.l) / atrD : null;

  /* ------------------------------ the story ---------------------------------- */
  const why: string[] = [];
  why.push(
    `Price is ${sideWord} the weekly 50 EMA by ${Math.abs(dist).toFixed(2)}× the weekly ATR, so the weekly side is ${lookFor}.`,
  );
  why.push(
    prevMatches
      ? `Last week closed as a ${size.toLowerCase()} ${prevDir} candle — body ${bodyAtr.toFixed(2)}× the weekly ATR, finishing ${pct(closeLoc)} of the way to its ${prevDir === "bearish" ? "low" : "high"}.${prevPass ? " That is the momentum this week can continue from." : " That is not strong enough to lean on."}`
      : `Last week closed ${prevDir}, against the weekly side — there is no momentum candle to continue from.`,
  );
  if (pullbackStatus !== "none") {
    why.push(
      `This week the daily pulled back ${pct(Math.max(0, depth))} into last week's range${counterDays ? ` over ${counterDays} ${dir < 0 ? "up" : "down"} day${counterDays > 1 ? "s" : ""}` : ""}${pullbackStatus === "golden" ? " — right in the 38–62% zone" : ""}${nowDepth <= 0 ? `, and price has since pushed back through last week's ${dir < 0 ? "low" : "high"}.` : `, and price is ${pct(nowDepth)} in now.`}`,
    );
  } else {
    why.push("This week has not pulled back into last week's candle yet.");
  }
  why.push(
    `Lower timeframes: 4H ${fmtSigned(tf("4H").push)}, 1H ${fmtSigned(tf("1H").push)}, 15M ${fmtSigned(tf("15M").push)}${turnPass ? ` — turning back ${dWord} with the weekly.` : " — not turned back with the weekly yet."}`,
  );
  if (weekUsed != null) {
    why.push(
      weekUsed < 0.7
        ? `The week has used ${pct(weekUsed)} of its average range, so there is room left for the move.`
        : `The week has already used ${pct(weekUsed)} of its average range — less room left to run.`,
    );
  }

  const risks: string[] = [];
  risks.push(`A trade beyond last week's ${dir < 0 ? "high" : "low"} at ${fmtPrice(dir < 0 ? prev.h : prev.l, p)} ends the setup for this week.`);
  risks.push(`A weekly close back ${side === "bullish" ? "below" : "above"} the 50 EMA at ${fmtPrice(emaW, p)} removes the weekly side.`);
  if (!turnPass) risks.push(`Until the 1H turns ${dWord}, the pullback can keep going.`);
  const ev = analysis.eventRisk;
  if (ev.nextEvent && ev.risk !== "none") risks.push(`${ev.nextEvent.name} ${untilLabel(ev.nextEvent.time)} can spike price either way.`);

  /* ------------------------------- drawings ---------------------------------- */
  const level = (f: number) => (dir < 0 ? prev.l + f * range : prev.h - f * range);
  const levels: MomentumMeter["daily"]["levels"] = [
    { label: "Last week high", price: prev.h, kind: "range" },
    { label: "Last week low", price: prev.l, kind: "range" },
    { label: "38.2%", price: level(0.382), kind: "fib" },
    { label: "50%", price: level(0.5), kind: "fib" },
    { label: "61.8%", price: level(0.618), kind: "fib" },
  ];

  return {
    ...base,
    side,
    push,
    pushLabel: pushLabel(push),
    verdict, verdictTitle, verdictDetail,
    gates,
    sources,
    aligned,
    prevWeek: { o: prev.o, h: prev.h, l: prev.l, c: prev.c, direction: prevDir, bodyAtr, closeLocation: closeLoc, size },
    pullback: { status: pullbackStatus, depth, nowDepth, counterDays },
    volatility: { weeklyAtr: atrW, weekUsed, dailyAtr: atrD, dayUsed },
    weekly: { bars: weekly.slice(-12), ema: emaSeries.slice(-12) },
    daily: { bars: daily.slice(-12), levels, weekStart: current.t },
    why,
    risks,
  };
}

const PULLBACK_LABEL: Record<NonNullable<MomentumMeter["pullback"]>["status"], string> = {
  none: "No pullback yet",
  wick: "Wick only — no daily pullback candle",
  clean: "Clean pullback",
  golden: "Clean pullback — 38–62% zone",
  deep: "Deep pullback",
  invalidated: "Beyond last week's candle",
};

function fmtSigned(v: number) {
  return `${v > 0 ? "+" : ""}${Math.round(v)}`;
}

function describeTf(t: TimeframePush): string {
  const r = t.rsi != null ? `RSI ${t.rsi.toFixed(0)}` : "RSI —";
  const m = t.macd ? `MACD ${t.macd}` : "MACD —";
  return `${r}, ${m}, push ${fmtSigned(t.push)} and ${t.pace}`;
}

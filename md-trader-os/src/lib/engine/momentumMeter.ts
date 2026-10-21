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
  /** How long the current push has usually lasted on this market; null on the board. */
  duration: { headline: Runway | null; next: Runway | null; weekly: Runway | null } | null;
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
  const s = pushSeries(candles);
  const n = s.push.length;
  return { push: n ? s.push[n - 1] : 0, rsi: s.rsi[n - 1] ?? null, hist: s.hist[n - 1] ?? null, histPrev: s.hist[n - 2] ?? null };
}

/**
 * The push at every bar, from indicator series computed once — the same
 * formula as above, in one pass. The trail behind the needle and the runway
 * estimate both read it, so they agree with the needle exactly.
 */
export function pushSeries(candles: Candle[]): { push: number[]; rsi: (number | null)[]; hist: (number | null)[] } {
  if (candles.length < 35) return { push: candles.map(() => 0), rsi: candles.map(() => null), hist: candles.map(() => null) };
  const closes = candles.map((c) => c.c);
  const r = rsi(closes, 14);
  const m = macd(closes);
  const a = atr(candles, 14);
  const push = closes.map((c, i) => {
    const ai = a[i];
    if (i < 34 || ai == null || !ai) return 0;
    let v = 0;
    const ri = r[i];
    if (ri != null) v += clamp((ri - 50) / 22, -1, 1) * 0.4;
    const hi = m.hist[i];
    if (hi != null) v += Math.tanh(hi / (ai * 0.18)) * 0.35;
    v += Math.tanh((c - closes[i - 10]) / (ai * 2.2)) * 0.25;
    return clamp(v, -1, 1) * 100;
  });
  return { push, rsi: r, hist: m.hist };
}

/** History read per timeframe — enough past pushes to time the current one. */
const HISTORY = 2000;

function timeframeReading(tf: MeterTimeframe, candles: Candle[], withTrail: boolean): { reading: TimeframePush; series: number[] } {
  const base = candles.slice(-HISTORY);
  const s = pushSeries(base);
  const n = s.push.length;
  const now = n ? s.push[n - 1] : 0;
  const prev = n > 1 ? s.push[n - 2] : now;
  const trail = withTrail && n > 60 ? s.push.slice(-(M.trail + 1)).map((v) => Math.round(v)) : [];
  const hist = s.hist[n - 1];
  const histPrev = s.hist[n - 2];
  const delta = now - prev;
  return {
    series: s.push,
    reading: {
      timeframe: tf,
      push: Math.round(now),
      previous: Math.round(prev),
      pace: Math.abs(delta) < 2 ? "steady" : Math.sign(delta) === Math.sign(now || delta) ? "building" : "fading",
      rsi: s.rsi[n - 1] ?? null,
      macd: hist == null || histPrev == null ? null : hist > histPrev ? "rising" : hist < histPrev ? "falling" : "flat",
      trail,
      barTime: candles.length ? candles[candles.length - 1].t : null,
    },
  };
}

/* --------------------------------- runway --------------------------------- */

/**
 * HOW LONG THE PUSH MIGHT LAST.
 *
 * Read from this market's own history, not from a rule of thumb. On each
 * timeframe a push starts when the reading passes ±start and lasts while it
 * stays beyond ±hold on the same side. Every past push that has already lasted
 * as long as the current one is a precedent; how much longer those kept going
 * — the middle half of them — is the estimate. It is a measure of what has
 * usually happened, not a promise of what will.
 */
export interface Runway {
  timeframe: MeterTimeframe;
  direction: "up" | "down";
  /** Bars the current push has run so far. */
  ageBars: number;
  /** Remaining bars: median and the middle-half range of the precedents. */
  medianBars: number;
  lowBars: number;
  highBars: number;
  /** How many past pushes lasted at least as long as this one. */
  samples: number;
  /** Readable forms: "~3 days", "2–5 days", "day 3". */
  label: string;
  range: string;
  age: string;
}

const TF_HOURS: Record<MeterTimeframe, number> = { "1W": 24 * 7, "1D": 24, "4H": 4, "1H": 1, "15M": 0.25, "5M": 1 / 12 };

/** A span on a timeframe, said the way a trader would say it. */
export function spanLabel(bars: number, tf: MeterTimeframe, approx = true): string {
  const t = approx ? "~" : "";
  if (tf === "1W") {
    if (bars < 1) return `${t}a few days`;
    const w = Math.round(bars);
    return `${t}${w} week${w === 1 ? "" : "s"}`;
  }
  if (tf === "1D") {
    const d = Math.max(1, Math.round(bars));
    if (d >= 10) return `${t}${Math.round(d / 5)} weeks`;
    return d >= 5 ? `${t}1 week` : `${t}${d} day${d === 1 ? "" : "s"}`;
  }
  const hours = bars * TF_HOURS[tf];
  if (hours >= 20) {
    const d = Math.max(1, Math.round((hours / 24) * 2) / 2);
    return `${t}${d} day${d === 1 ? "" : "s"}`;
  }
  if (hours >= 1) {
    const h = Math.max(1, Math.round(hours));
    return `${t}${h} hour${h === 1 ? "" : "s"}`;
  }
  return `${t}${Math.max(5, Math.round((hours * 60) / 5) * 5)} minutes`;
}

function rangeLabel(lo: number, hi: number, tf: MeterTimeframe): string {
  const a = spanLabel(lo, tf, false);
  const b = spanLabel(hi, tf, false);
  if (a === b) return a;
  // "2 days–5 days" reads better as "2–5 days" when the unit is shared.
  const [na, ...ua] = a.split(" ");
  const [nb, ...ub] = b.split(" ");
  const unitA = ua.join(" ").replace(/s$/, "");
  const unitB = ub.join(" ").replace(/s$/, "");
  return unitA === unitB && /^\d+(\.\d+)?$/.test(na) && /^\d+(\.\d+)?$/.test(nb) ? `${na}–${nb} ${ub.join(" ")}` : `${a} – ${b}`;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function runwayFor(tf: MeterTimeframe, series: number[]): Runway | null {
  const { start, hold, minSamples } = M.runway;
  const n = series.length;
  if (n < 60) return null;

  // The current push: walk back while the reading holds on one side, and only
  // count it if it reached the start level somewhere along the way.
  const last = series[n - 1];
  const dir = last >= hold ? 1 : last <= -hold ? -1 : 0;
  if (!dir) return null;
  let i = n - 1;
  let peak = 0;
  while (i >= 0 && series[i] * dir > hold) {
    peak = Math.max(peak, series[i] * dir);
    i--;
  }
  if (peak < start) return null;
  const age = n - 1 - i;

  // Completed past pushes, either direction: momentum persistence is a
  // property of the market, and both sides double the precedents.
  const lengths: number[] = [];
  let runDir = 0;
  let runLen = 0;
  let runPeak = 0;
  const stopAt = i + 1; // exclude the current, unfinished push
  for (let k = 34; k < stopAt; k++) {
    const v = series[k];
    if (runDir && v * runDir > hold) {
      runLen++;
      runPeak = Math.max(runPeak, v * runDir);
      continue;
    }
    if (runDir && runPeak >= start) lengths.push(runLen);
    runDir = v >= hold ? 1 : v <= -hold ? -1 : 0;
    runLen = runDir ? 1 : 0;
    runPeak = runDir ? Math.abs(v) : 0;
  }

  const precedents = lengths.filter((L) => L > age).map((L) => L - age).sort((a, b) => a - b);
  if (precedents.length < minSamples) return null;
  const median = quantile(precedents, 0.5);
  const low = quantile(precedents, 0.25);
  const high = quantile(precedents, 0.75);
  return {
    timeframe: tf,
    direction: dir > 0 ? "up" : "down",
    ageBars: age,
    medianBars: median,
    lowBars: low,
    highBars: high,
    samples: precedents.length,
    label: spanLabel(median, tf),
    range: rangeLabel(low, high, tf),
    age: spanLabel(age, tf, false),
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
  const tfReadings = {
    "1W": timeframeReading("1W", weekly, withTrail),
    "1D": timeframeReading("1D", daily, withTrail),
    "4H": timeframeReading("4H", inputs.fourHour, withTrail),
    "1H": timeframeReading("1H", inputs.oneHour, withTrail),
    "15M": timeframeReading("15M", inputs.fifteen, withTrail),
    "5M": timeframeReading("5M", inputs.five, withTrail),
  } satisfies Record<MeterTimeframe, { reading: TimeframePush; series: number[] }>;
  const tfs: TimeframePush[] = METER_TIMEFRAMES.map((k) => tfReadings[k].reading);
  const tf = (k: MeterTimeframe) => tfs.find((x) => x.timeframe === k)!;

  const base = {
    symbol: asset.symbol, name: asset.name, precision: p, pipUnit: unit, price,
    timeframes: tfs, generatedAt: Date.now(), demo: analysis.demo,
  };
  // Timing the push is the detail view's job; the ranked board skips it.
  const timePush = (needle: number) => (withTrail ? estimateDuration(tfReadings, needle) : null);

  if (weekly.length < 56 || daily.length < 30) {
    return {
      ...base, side: "neutral", push: 0, pushLabel: "Data unavailable", verdict: "no-data",
      verdictTitle: "Not enough history", verdictDetail: "The weekly 50 EMA needs at least a year of daily candles.",
      gates: [], sources: [], aligned: 0, prevWeek: null, pullback: null,
      volatility: { weeklyAtr: null, weekUsed: null, dailyAtr: null, dayUsed: null },
      weekly: { bars: weekly.slice(-12), ema: [] }, daily: { bars: daily.slice(-12), levels: [], weekStart: null },
      why: [], risks: [], duration: timePush(0),
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
    duration: timePush(push),
  };
}

/**
 * The headline times the push a trader is actually riding this week: the
 * highest of the daily, 4H and 1H whose push agrees with the needle. The next
 * timeframe down is given beside it for managing the entry, and the weekly
 * push — the trend behind it all — as context. With the needle stalling there
 * is no push to time.
 */
function estimateDuration(
  readings: Record<MeterTimeframe, { reading: TimeframePush; series: number[] }>,
  needle: number,
): MomentumMeter["duration"] {
  const dir = needle >= 20 ? "up" : needle <= -20 ? "down" : null;
  const weeklyRun = runwayFor("1W", readings["1W"].series);
  if (!dir) return { headline: null, next: null, weekly: weeklyRun };
  const runs = (["1D", "4H", "1H"] as MeterTimeframe[])
    .map((tf) => runwayFor(tf, readings[tf].series))
    .filter((r): r is Runway => r !== null && r.direction === dir);
  return {
    headline: runs[0] ?? null,
    next: runs[1] ?? null,
    weekly: weeklyRun && weeklyRun.direction === dir ? weeklyRun : null,
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

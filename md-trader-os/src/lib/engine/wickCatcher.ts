import type { AssetAnalysis, Candle, Direction, Timeframe } from "@/lib/types";
import { pipSize, pipUnit } from "@/lib/data/universe";
import { WICK_CATCHER } from "@/lib/config/scoring";
import { atr, clamp } from "./indicators";
import { findSwings } from "./structure";

/**
 * WICK CATCHER.
 *
 * MD Momentum says which way. This says WHERE: the prices a pullback is most
 * likely to wick into before the trend resumes, so an entry can wait there as a
 * limit order instead of chasing a candle that has already gone.
 *
 * A zone is built from the levels traders actually watch, clustered so that
 * several independent reasons at one price count as one stronger zone:
 *
 *   wick fill   the 50% of a long rejection wick that price has not come back
 *               to yet — the classic "wicks get filled" magnet
 *   prev day    yesterday's low (for buys) or high (for sells): the liquidity a
 *               pullback sweeps before continuing
 *   prev week   the same on the weekly
 *   swing       untaken 4H and 1H swing lows/highs, where stops rest
 *   50 EMA      the daily, 4H and 1H 50 EMA — the MD strategy's own line
 *   round no.   big and half figures, counted only as confluence
 *
 * Buy zones sit below price, sell zones above. A zone on the side of the
 * weekly + daily bias is "with the trend" and scores higher; the other side is
 * shown, labelled counter-trend, rather than hidden.
 *
 * Nothing here is a signal or a prediction. Every zone lists exactly which
 * levels produced it, so it can be checked against the chart.
 */

export type WickLevelKind = "wick-fill" | "prev-day" | "prev-week" | "swing" | "ema50" | "round";

export interface WickLevel {
  kind: WickLevelKind;
  timeframe: Timeframe | null;
  price: number;
  /** Where the level is invalidated: the wick's extreme, or a sweep allowance. */
  extreme: number;
  weight: number;
  label: string;
}

export interface WickZone {
  id: string;
  side: "buy" | "sell";
  /** The limit price — the weighted centre of the levels in the zone. */
  entry: number;
  low: number;
  high: number;
  stop: number;
  /** Fixed 2R objective. */
  target: number;
  /** The nearest opposing liquidity, when there is one beyond 1R. */
  liquidityTarget: number | null;
  liquidityRR: number | null;
  stopPips: number;
  distancePips: number;
  /** Distance from price in daily ATRs. */
  distanceAtr: number;
  confluence: number;
  score: number;
  aligned: boolean;
  status: "waiting" | "in-zone" | "tapped";
  levels: WickLevel[];
}

export interface WickReport {
  symbol: string;
  name: string;
  group: string;
  precision: number;
  price: number;
  pipSize: number;
  pipUnit: "pips" | "points";
  bias: Direction;
  biasStrength: number;
  biasText: string;
  atrDaily: number | null;
  atr4h: number | null;
  zones: WickZone[];
  best: WickZone | null;
  generatedAt: number;
  demo: boolean;
}

export interface WickInputs {
  analysis: AssetAnalysis;
  series: Partial<Record<Timeframe, Candle[]>>;
}

const TF_LABEL: Record<string, string> = { "1W": "weekly", "1D": "daily", "4H": "4H", "1H": "1H" };

function lastValue(series: (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i];
    if (v != null) return v;
  }
  return null;
}

/** Big/half-figure spacing for the round-number check. */
function roundStep(symbol: string, price: number, pip: number): number {
  if (symbol.includes("/") && !symbol.startsWith("X")) return pip * 50;
  switch (symbol) {
    case "XAU/USD": return 10;
    case "XAG/USD": return 0.5;
    case "WTI":
    case "BRENT": return 1;
    case "NATGAS": return 0.1;
    case "COPPER": return 0.05;
    default:
      return price > 10_000 ? 100 : price > 1_000 ? 25 : 10;
  }
}

/** Weekly and daily decide the bias, the same way MD Momentum leads with them. */
function htfBias(analysis: AssetAnalysis): { bias: Direction; strength: number; text: string } {
  const read = (tf: Timeframe) => {
    const t = analysis.technical.find((x) => x.timeframe === tf);
    const s = analysis.structure.find((x) => x.timeframe === tf);
    if (!t && !s) return null;
    return clamp((t?.strength ?? 0) * 0.5 + (s?.strength ?? 0) * 0.5, -1, 1);
  };
  const w = read("1W");
  const d = read("1D");
  const parts = [w, d].filter((v): v is number => v != null);
  if (!parts.length) return { bias: "neutral", strength: 0, text: "Weekly and daily data unavailable." };
  const strength = w != null && d != null ? w * 0.55 + d * 0.45 : parts[0];
  const word = (v: number | null) => (v == null ? "unavailable" : v > 0.18 ? "bullish" : v < -0.18 ? "bearish" : "neutral");
  const bias: Direction = strength > WICK_CATCHER.biasThreshold ? "bullish" : strength < -WICK_CATCHER.biasThreshold ? "bearish" : "neutral";
  const text =
    bias === "neutral"
      ? `Weekly ${word(w)}, daily ${word(d)} — no clear higher-timeframe side, so both sides are shown and neither is called with the trend.`
      : `Weekly ${word(w)}, daily ${word(d)}. ${bias === "bullish" ? "Buy zones below price" : "Sell zones above price"} are with the trend.`;
  return { bias, strength, text };
}

/** Long rejection wicks whose 50% price has not been revisited. */
function unfilledWicks(candles: Candle[], tf: Timeframe, price: number, lookback: number): WickLevel[] {
  if (candles.length < 20) return [];
  const atrs = atr(candles, 14);
  const out: WickLevel[] = [];
  // The last bar is still forming, so it cannot be a finished rejection yet.
  const end = candles.length - 1;
  const start = Math.max(1, end - lookback);
  const weight = WICK_CATCHER.weights.wickFill[tf as "1D" | "4H" | "1H"] ?? 1;

  for (let i = start; i < end; i++) {
    const c = candles[i];
    const a = atrs[i] ?? atrs[end];
    if (!a) continue;
    const body = Math.abs(c.c - c.o);
    const lowerWick = Math.min(c.o, c.c) - c.l;
    const upperWick = c.h - Math.max(c.o, c.c);
    const minWick = Math.max(body * WICK_CATCHER.wickToBody, a * WICK_CATCHER.wickToAtr);

    if (lowerWick >= minWick) {
      const mid = c.l + lowerWick / 2;
      let filled = false;
      for (let j = i + 1; j < candles.length; j++) if (candles[j].l <= mid) { filled = true; break; }
      if (!filled && mid < price) {
        out.push({ kind: "wick-fill", timeframe: tf, price: mid, extreme: c.l, weight, label: `${TF_LABEL[tf]} rejection wick — 50% unfilled` });
      }
    }
    if (upperWick >= minWick) {
      const mid = c.h - upperWick / 2;
      let filled = false;
      for (let j = i + 1; j < candles.length; j++) if (candles[j].h >= mid) { filled = true; break; }
      if (!filled && mid > price) {
        out.push({ kind: "wick-fill", timeframe: tf, price: mid, extreme: c.h, weight, label: `${TF_LABEL[tf]} rejection wick — 50% unfilled` });
      }
    }
  }
  // The most recent few are what a pullback reaches first; older ones crowd the list.
  return out.slice(-6);
}

/** Swing lows/highs no later bar has traded through: stops are still resting there. */
function untakenSwings(candles: Candle[], tf: Timeframe, price: number, sweep: number): WickLevel[] {
  if (candles.length < 20) return [];
  const swings = findSwings(candles.slice(-160), 3);
  const offset = Math.max(0, candles.length - 160);
  const weight = WICK_CATCHER.weights.swing[tf as "4H" | "1H"] ?? 1;
  const out: WickLevel[] = [];
  for (const s of swings.slice(-12)) {
    const idx = s.index + offset;
    const later = candles.slice(idx + 1);
    if (s.kind === "low" && s.price < price && !later.some((c) => c.l < s.price)) {
      out.push({ kind: "swing", timeframe: tf, price: s.price, extreme: s.price - sweep, weight, label: `${TF_LABEL[tf]} swing low — sell-side liquidity` });
    }
    if (s.kind === "high" && s.price > price && !later.some((c) => c.h > s.price)) {
      out.push({ kind: "swing", timeframe: tf, price: s.price, extreme: s.price + sweep, weight, label: `${TF_LABEL[tf]} swing high — buy-side liquidity` });
    }
  }
  return out;
}

function previousBar(candles: Candle[] | undefined): Candle | null {
  return candles && candles.length >= 2 ? candles[candles.length - 2] : null;
}

/** Groups levels that sit within `tolerance` of each other into one zone. */
function cluster(levels: WickLevel[], tolerance: number): WickLevel[][] {
  const sorted = levels.slice().sort((a, b) => a.price - b.price);
  const groups: WickLevel[][] = [];
  for (const level of sorted) {
    const g = groups[groups.length - 1];
    if (g && level.price - g[g.length - 1].price <= tolerance) g.push(level);
    else groups.push([level]);
  }
  return groups;
}

export function buildWickReport({ analysis, series }: WickInputs): WickReport {
  const asset = analysis.asset;
  const pip = pipSize(asset.symbol);
  const unit = pipUnit(asset.symbol);
  const daily = series["1D"] ?? [];
  const four = series["4H"] ?? [];
  const one = series["1H"] ?? [];
  const weekly = series["1W"] ?? [];
  const price = one.length ? one[one.length - 1].c : analysis.quote.price;

  const atrD = daily.length > 15 ? lastValue(atr(daily, 14)) : null;
  const atr4 = four.length > 15 ? lastValue(atr(four, 14)) : null;
  const atr1 = one.length > 15 ? lastValue(atr(one, 14)) : null;
  const unitAtr = atr4 ?? (atrD ? atrD / 3 : price * 0.002);
  const dayAtr = atrD ?? unitAtr * 3;

  const { bias, strength, text } = htfBias(analysis);

  /* ------------------------------ candidate levels ----------------------------- */
  const levels: WickLevel[] = [
    ...unfilledWicks(daily, "1D", price, WICK_CATCHER.lookback["1D"]),
    ...unfilledWicks(four, "4H", price, WICK_CATCHER.lookback["4H"]),
    ...unfilledWicks(one, "1H", price, WICK_CATCHER.lookback["1H"]),
    ...untakenSwings(four, "4H", price, unitAtr * WICK_CATCHER.sweepAtr),
    ...untakenSwings(one, "1H", price, (atr1 ?? unitAtr / 2) * WICK_CATCHER.sweepAtr * 2),
  ];

  const sweep = unitAtr * WICK_CATCHER.sweepAtr;
  const pd = previousBar(daily);
  if (pd) {
    if (pd.l < price) levels.push({ kind: "prev-day", timeframe: "1D", price: pd.l, extreme: pd.l - sweep, weight: WICK_CATCHER.weights.prevDay, label: "Previous day low — swept liquidity" });
    if (pd.h > price) levels.push({ kind: "prev-day", timeframe: "1D", price: pd.h, extreme: pd.h + sweep, weight: WICK_CATCHER.weights.prevDay, label: "Previous day high — swept liquidity" });
  }
  const pw = previousBar(weekly);
  if (pw) {
    if (pw.l < price) levels.push({ kind: "prev-week", timeframe: "1W", price: pw.l, extreme: pw.l - sweep * 1.5, weight: WICK_CATCHER.weights.prevWeek, label: "Previous week low" });
    if (pw.h > price) levels.push({ kind: "prev-week", timeframe: "1W", price: pw.h, extreme: pw.h + sweep * 1.5, weight: WICK_CATCHER.weights.prevWeek, label: "Previous week high" });
  }
  for (const tf of ["1D", "4H", "1H"] as Timeframe[]) {
    const t = analysis.technical.find((x) => x.timeframe === tf);
    if (t?.ma50 == null) continue;
    const w = WICK_CATCHER.weights.ema50[tf as "1D" | "4H" | "1H"];
    const room = (t.atr ?? unitAtr) * 0.5;
    levels.push({
      kind: "ema50", timeframe: tf, price: t.ma50,
      extreme: t.ma50 < price ? t.ma50 - room : t.ma50 + room,
      weight: w, label: `${TF_LABEL[tf]} 50 EMA`,
    });
  }

  // Only levels within reach are worth an order; the rest are background.
  const reach = dayAtr * WICK_CATCHER.maxDistanceAtr;
  const inReach = levels.filter((l) => Math.abs(l.price - price) <= reach && Math.abs(l.price - price) > pip);

  /* ---------------------------------- zones ---------------------------------- */
  const tolerance = Math.max(unitAtr * WICK_CATCHER.clusterAtr, pip * 3);
  const step = roundStep(asset.symbol, price, pip);
  const todayBar = daily[daily.length - 1];
  const zones: WickZone[] = [];

  for (const side of ["buy", "sell"] as const) {
    const sideLevels = inReach.filter((l) => (side === "buy" ? l.price < price : l.price > price));
    for (const group of cluster(sideLevels, tolerance)) {
      const members = group.slice();
      const low = Math.min(...members.map((m) => m.price));
      const high = Math.max(...members.map((m) => m.price));

      // A big or half figure inside the zone adds confluence, never a zone of its own.
      const nearestRound = Math.round(((low + high) / 2) / step) * step;
      if (nearestRound >= low - tolerance / 2 && nearestRound <= high + tolerance / 2) {
        members.push({
          kind: "round", timeframe: null, price: nearestRound, extreme: nearestRound,
          weight: WICK_CATCHER.weights.round, label: `Round number ${nearestRound.toFixed(asset.precision)}`,
        });
      }

      const totalWeight = members.reduce((s, m) => s + m.weight, 0);
      const entry = members.reduce((s, m) => s + m.price * m.weight, 0) / totalWeight;
      const extremes = members.map((m) => m.extreme);
      const minStop = unitAtr * WICK_CATCHER.minStopAtr;
      let stop = side === "buy" ? Math.min(...extremes) - unitAtr * 0.1 : Math.max(...extremes) + unitAtr * 0.1;
      if (Math.abs(entry - stop) < minStop) stop = side === "buy" ? entry - minStop : entry + minStop;
      const risk = Math.abs(entry - stop);
      const target = side === "buy" ? entry + risk * 2 : entry - risk * 2;

      // The nearest liquidity on the far side of price is the natural objective.
      const opposite = levels
        .filter((l) => l.kind !== "ema50" && (side === "buy" ? l.price > price : l.price < price))
        .map((l) => l.price)
        .sort((a, b) => (side === "buy" ? a - b : b - a));
      const liq = opposite.find((p) => Math.abs(p - entry) >= risk) ?? null;
      const liquidityRR = liq != null ? Math.abs(liq - entry) / risk : null;

      const kinds = new Set(members.map((m) => `${m.kind}|${m.timeframe ?? ""}`));
      const aligned = (side === "buy" && bias === "bullish") || (side === "sell" && bias === "bearish");
      const distance = Math.abs(price - entry);
      const distanceAtr = distance / dayAtr;

      // Proximity: a zone a third of a day away is the sweet spot; one right on
      // top of price is already being traded, one two days away may never come.
      const proximity = distanceAtr < 0.08 ? 0.5 : distanceAtr <= 1 ? 1 : clamp(1 - (distanceAtr - 1) / (WICK_CATCHER.maxDistanceAtr - 1), 0, 1);
      const structural = Math.min(totalWeight, WICK_CATCHER.weightCap) / WICK_CATCHER.weightCap;
      const trend = aligned ? 0.4 + 0.6 * Math.min(1, Math.abs(strength) / 0.6) : 0;
      const score = clamp(Math.round(structural * 55 + trend * 30 + proximity * 15), 0, 100);

      const zoneTop = side === "buy" ? high : low;
      const inZone = side === "buy" ? price <= high + tolerance * 0.25 && price > stop : price >= low - tolerance * 0.25 && price < stop;
      const tapped = !inZone && todayBar
        ? side === "buy" ? todayBar.l <= zoneTop : todayBar.h >= zoneTop
        : false;

      zones.push({
        id: `${side}-${entry.toFixed(asset.precision)}`,
        side,
        entry,
        low,
        high,
        stop,
        target,
        liquidityTarget: liq,
        liquidityRR,
        stopPips: risk / pip,
        distancePips: distance / pip,
        distanceAtr,
        confluence: kinds.size,
        score,
        aligned,
        status: inZone ? "in-zone" : tapped ? "tapped" : "waiting",
        levels: members.sort((a, b) => b.weight - a.weight),
      });
    }
  }

  zones.sort((a, b) => Number(b.aligned) - Number(a.aligned) || b.score - a.score);
  const trimmed = [
    ...zones.filter((z) => z.side === "buy").slice(0, WICK_CATCHER.maxZonesPerSide),
    ...zones.filter((z) => z.side === "sell").slice(0, WICK_CATCHER.maxZonesPerSide),
  ].sort((a, b) => Number(b.aligned) - Number(a.aligned) || b.score - a.score);

  const best = trimmed.find((z) => z.aligned && z.distanceAtr <= 2) ?? null;

  return {
    symbol: asset.symbol,
    name: asset.name,
    group: asset.group,
    precision: asset.precision,
    price,
    pipSize: pip,
    pipUnit: unit,
    bias,
    biasStrength: strength,
    biasText: text,
    atrDaily: atrD,
    atr4h: atr4,
    zones: trimmed,
    best,
    generatedAt: Date.now(),
    demo: analysis.demo,
  };
}

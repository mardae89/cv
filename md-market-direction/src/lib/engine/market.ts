import type {
  AssetAnalysis,
  Direction,
  GlobalDirection,
  MarketRegime,
  RegimeResult,
  ScannerRow,
  TradingMode,
} from "@/lib/types";
import { ASSETS } from "@/lib/data/universe";
import { bandFor } from "@/lib/config/scoring";
import { singleton, TtlCache } from "@/lib/utils/cache";
import type { AnalysisContext } from "./context";
import { analyseAsset } from "./analyze";

const scanCache = singleton("scanCache", () => new TtlCache<AssetAnalysis[]>(45_000, 20));

/** Runs the full universe through the engine. Cached so a page load scans once. */
export async function scanUniverse(
  ctx: AnalysisContext,
  mode: TradingMode,
  symbols?: string[],
): Promise<AssetAnalysis[]> {
  const list = symbols?.length ? symbols : ASSETS.map((a) => a.symbol);
  const key = `${mode}|${list.length === ASSETS.length ? "all" : list.join(",")}`;
  const hit = scanCache.get(key);
  if (hit) return hit.value;

  const out: AssetAnalysis[] = [];
  // Sequential on purpose: the demo generator is CPU-bound and the live adapters
  // are rate-limited. Series are cached, so repeated symbols cost nothing.
  for (const symbol of list) {
    const a = await analyseAsset(ctx, symbol, { mode });
    if (a) out.push(a);
  }
  scanCache.set(key, out);
  return out;
}

export function toScannerRow(a: AssetAnalysis): ScannerRow {
  const daily = a.technical.find((t) => t.timeframe === "1D");
  const structure = a.structure.find((s) => s.timeframe === "1D");
  const newsCat = a.score.categories.find((c) => c.key === "news");
  const momentumStrength = a.momentumScore;
  return {
    symbol: a.asset.symbol,
    name: a.asset.name,
    assetClass: a.asset.assetClass,
    group: a.asset.group,
    price: a.quote.price,
    changePct: a.quote.changePct,
    score: a.score.score,
    direction: a.score.direction,
    ma50: daily?.priceVsMa50 ?? null,
    structure: structure?.bias ?? "neutral",
    momentum: momentumStrength >= 68 || momentumStrength <= 32 ? "strong" : momentumStrength >= 57 || momentumStrength <= 43 ? "moderate" : "weak",
    news: !newsCat?.available ? "neutral" : newsCat.strength > 0.12 ? "bullish" : newsCat.strength < -0.12 ? "bearish" : "neutral",
    eventRisk: a.eventRisk.risk,
    evidenceQuality: a.score.evidenceQuality,
    updatedAt: a.generatedAt,
    demo: a.demo,
  };
}

/* --------------------------------- REGIME --------------------------------- */

function biasOf(analyses: AssetAnalysis[], symbol: string): number {
  const a = analyses.find((x) => x.asset.symbol === symbol);
  return a ? (a.score.score - 50) / 50 : 0;
}

export function classifyRegime(analyses: AssetAnalysis[]): RegimeResult {
  const equities = analyses.filter((a) => ["SPX", "NDX", "DJI", "RUT", "DAX", "FTSE", "NIKKEI", "HSI"].includes(a.asset.symbol));
  const equityBias = equities.length ? equities.reduce((s, a) => s + (a.score.score - 50) / 50, 0) / equities.length : 0;
  const vix = analyses.find((a) => a.asset.symbol === "VIX");
  const vixLevel = vix?.quote.price ?? null;
  const goldBias = biasOf(analyses, "XAU/USD");
  const yieldBias = biasOf(analyses, "US10Y");
  const dollarBias = biasOf(analyses, "DXY");
  const oilBias = biasOf(analyses, "WTI");

  // Trend vs range: how far the universe sits from neutral on average.
  const dispersion = analyses.length
    ? analyses.reduce((s, a) => s + Math.abs(a.score.score - 50), 0) / analyses.length
    : 0;

  // Volatility: average ATR as a share of price on the daily timeframe.
  const atrPcts = analyses
    .map((a) => a.technical.find((t) => t.timeframe === "1D")?.atrPct)
    .filter((v): v is number => v != null);
  const avgAtrPct = atrPcts.length ? atrPcts.reduce((a, b) => a + b, 0) / atrPcts.length : 0;

  const secondary: MarketRegime[] = [];
  let primary: MarketRegime = "MIXED";

  if (equityBias > 0.18 && (vixLevel == null || vixLevel < 20)) primary = "RISK ON";
  else if (equityBias < -0.18 || (vixLevel != null && vixLevel > 24)) primary = "RISK OFF";

  if (dispersion > 22) secondary.push("TRENDING");
  else if (dispersion < 11) secondary.push("RANGEBOUND");

  if (vixLevel != null && vixLevel > 22) secondary.push("HIGH VOLATILITY");
  else if (vixLevel != null && vixLevel < 14) secondary.push("LOW VOLATILITY");

  if (yieldBias > 0.15 && oilBias > 0.1 && goldBias > 0) secondary.push("INFLATIONARY");
  if (yieldBias < -0.2 && oilBias < -0.1) secondary.push("DEFLATIONARY");

  if (primary === "MIXED" && secondary.length) primary = secondary[0];

  const explanation = [
    `Equity complex is ${equityBias > 0.15 ? "bid" : equityBias < -0.15 ? "offered" : "mixed"}`,
    vixLevel != null ? `VIX at ${vixLevel.toFixed(1)}` : null,
    `the dollar is ${dollarBias > 0.12 ? "firm" : dollarBias < -0.12 ? "soft" : "range-bound"}`,
    `yields are ${yieldBias > 0.12 ? "rising" : yieldBias < -0.12 ? "easing" : "stable"}`,
    `gold is ${goldBias > 0.12 ? "supported" : goldBias < -0.12 ? "pressured" : "flat"}`,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    primary,
    secondary: secondary.filter((s) => s !== primary).slice(0, 2),
    explanation: `${explanation}.`,
    metrics: [
      { label: "Equity bias", value: equityBias.toFixed(2) },
      { label: "VIX", value: vixLevel != null ? vixLevel.toFixed(2) : "Data unavailable" },
      { label: "Dollar bias", value: dollarBias.toFixed(2) },
      { label: "Yield bias", value: yieldBias.toFixed(2) },
      { label: "Avg daily ATR", value: `${avgAtrPct.toFixed(2)}%` },
      { label: "Score dispersion", value: dispersion.toFixed(1) },
    ],
  };
}

/* ----------------------------- GLOBAL DIRECTION ---------------------------- */

const GLOBAL_GROUPS = [
  "Forex Majors",
  "Stocks",
  "US Indices",
  "Metals",
  "Crypto",
  "Commodities",
];

export function globalDirection(analyses: AssetAnalysis[]): GlobalDirection {
  // Macro reference markets (DXY, VIX) are inputs to other reads, not markets a
  // user is "long" — they are excluded from the global aggregate.
  const scored = analyses.filter((a) => a.asset.group !== "Macro Reference");
  const avg = scored.length ? scored.reduce((s, a) => s + a.score.score, 0) / scored.length : 50;
  const score = Math.round(avg);
  const band = bandFor(score);

  const groups = GLOBAL_GROUPS.map((group) => {
    const members = scored.filter((a) => a.asset.group === group);
    const gAvg = members.length ? members.reduce((s, a) => s + a.score.score, 0) / members.length : 50;
    const mixedShare = members.filter((a) => a.score.direction === "mixed").length / Math.max(1, members.length);
    const gScore = Math.round(gAvg);
    const direction: Direction = mixedShare > 0.45 ? "mixed" : (bandFor(gScore).direction as Direction);
    return { group, direction, score: gScore, count: members.length };
  }).filter((g) => g.count > 0);

  return {
    direction: band.direction as Direction,
    score,
    label: band.label,
    groups,
    regime: classifyRegime(analyses),
    generatedAt: Date.now(),
  };
}

export function radar(analyses: AssetAnalysis[], limit = 6) {
  const scored = analyses.filter((a) => a.asset.group !== "Macro Reference");
  const bullish = scored.slice().sort((a, b) => b.score.score - a.score.score).slice(0, limit);
  const bearish = scored.slice().sort((a, b) => a.score.score - b.score.score).slice(0, limit);
  return { bullish, bearish };
}

/**
 * "Most interesting" = markets where many independent categories agree. High
 * alignment across categories is more notable than a single very strong reading.
 */
export function mostInteresting(analyses: AssetAnalysis[], limit = 5) {
  return analyses
    .filter((a) => a.asset.group !== "Macro Reference")
    .map((a) => {
      const directional = a.score.categories.filter((c) => c.available && c.key !== "eventRisk");
      if (!directional.length) return { analysis: a, aligned: 0, agreement: 0 };
      const sign = Math.sign(a.score.rawPoints || 1);
      const aligned = directional.filter((c) => Math.sign(c.points) === sign && Math.abs(c.strength) > 0.15).length;
      return { analysis: a, aligned, agreement: aligned / directional.length };
    })
    .sort((a, b) => b.aligned - a.aligned || Math.abs(b.analysis.score.score - 50) - Math.abs(a.analysis.score.score - 50))
    .slice(0, limit);
}

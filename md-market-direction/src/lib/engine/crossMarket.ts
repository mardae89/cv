import type { Asset, CrossMarketReading, EvidenceItem } from "@/lib/types";
import { getAsset } from "@/lib/data/universe";
import { singleton, TtlCache } from "@/lib/utils/cache";
import type { AnalysisContext } from "./context";
import { analyseTechnical } from "./technical";
import { analyseStructure } from "./structure";
import { clamp } from "./indicators";

/**
 * CROSS-MARKET CONFIRMATION.
 *
 * Relationships are supporting evidence, never absolute rules. For each declared
 * relationship we take the related market's own directional bias (from price
 * data only — no recursion into news or macro, which would double-count) and
 * apply the sign of the relationship.
 *
 * Example: gold ↔ US dollar has sign -1. A firmly bullish dollar therefore
 * produces NEGATIVE cross-market confirmation for gold.
 */

const biasCache = singleton("biasCache", () => new TtlCache<number | null>(45_000, 400));

/** Price-derived directional bias of a market, -1..1. */
export async function trendBias(ctx: AnalysisContext, symbol: string): Promise<number | null> {
  const cached = biasCache.get(symbol);
  if (cached) return cached.value;

  const asset = getAsset(symbol);
  if (!asset) return biasCache.set(symbol, null).value;

  const [daily, fourHour] = await Promise.all([ctx.candles(symbol, "1D"), ctx.candles(symbol, "4H")]);
  if (!daily.length) return biasCache.set(symbol, null).value;

  const techD = analyseTechnical(daily, "1D");
  const structD = analyseStructure(daily, "1D");
  const tech4 = fourHour.length ? analyseTechnical(fourHour, "4H") : null;

  const bias = clamp(
    techD.strength * 0.45 + structD.strength * 0.35 + (tech4 ? tech4.strength * 0.2 : 0),
    -1,
    1,
  );
  return biasCache.set(symbol, bias).value;
}

export interface CrossMarketResult {
  strength: number;
  readings: CrossMarketReading[];
  evidence: EvidenceItem[];
  available: boolean;
}

export async function analyseCrossMarket(ctx: AnalysisContext, asset: Asset): Promise<CrossMarketResult> {
  if (!asset.related.length) return { strength: 0, readings: [], evidence: [], available: false };

  const readings: CrossMarketReading[] = [];
  let weighted = 0;
  let total = 0;

  for (const link of asset.related) {
    const related = getAsset(link.symbol);
    const bias = await trendBias(ctx, link.symbol);
    if (bias === null || !related) continue;
    const confirmation = clamp(bias * link.sign, -1, 1);
    readings.push({
      symbol: link.symbol,
      name: related.name,
      label: link.label,
      sign: link.sign,
      relatedBias: bias,
      confirmation,
    });
    weighted += confirmation * link.weight;
    total += link.weight;
  }

  if (!total) return { strength: 0, readings, evidence: [], available: false };

  const strength = clamp(weighted / total, -1, 1);
  const evidence: EvidenceItem[] = readings
    .slice()
    .sort((a, b) => Math.abs(b.confirmation) - Math.abs(a.confirmation))
    .slice(0, 3)
    .map((r) => ({
      label: `${r.symbol} — ${r.label}`,
      detail: `${r.symbol} is currently ${r.relatedBias > 0.15 ? "bullish" : r.relatedBias < -0.15 ? "bearish" : "flat"} and moves ${r.sign === 1 ? "with" : "against"} ${asset.symbol}, so it is ${r.confirmation > 0.1 ? "confirming" : r.confirmation < -0.1 ? "contradicting" : "neutral for"} the current read.`,
      impact: r.confirmation,
    }));

  return { strength, readings, evidence, available: true };
}

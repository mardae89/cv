import type { Asset, EvidenceItem, Impact, NewsArticle, NewsRelevance } from "@/lib/types";
import { clamp } from "./indicators";

/**
 * NEWS → MARKET CONNECTION ENGINE.
 *
 * This is deliberately NOT positive/negative word counting. Every article carries
 * a THEME (e.g. `rates-hawkish`) and a signed sentiment measured along that
 * theme's own axis. Each asset declares how it relates to each theme
 * (`asset.newsBetas`). The effect of an article on an asset is therefore:
 *
 *     assetSentiment = themeSentiment × assetRelationshipToTheme
 *
 * So "Fed signals higher-for-longer" (rates-hawkish, +0.8) is bullish for the
 * dollar (beta +1.0), bearish for gold (beta -0.8) and bearish for the Nasdaq
 * (beta -0.9) — from one classification, not three.
 *
 * These relationships are contextual tendencies, not guarantees, and the UI says
 * so wherever they are shown.
 */

const IMPACT_WEIGHT: Record<Impact, number> = { low: 0.35, medium: 0.7, high: 1 };
const HALF_LIFE_HOURS = 20;

export function relevanceFor(asset: Asset, article: NewsArticle): NewsRelevance | null {
  const beta = asset.newsBetas[article.theme];
  const named = article.symbols.some((s) => s.toUpperCase() === asset.symbol.toUpperCase());
  if (beta === undefined && !named) return null;
  if (article.theme === "unclassified") return null;

  const relationship = beta ?? (named ? 0.6 : 0);
  const relevance = clamp(Math.abs(relationship) * (named ? 1.15 : 1), 0, 1);
  if (relevance < 0.1) return null;

  const assetSentiment = clamp(article.sentiment * relationship, -1, 1);
  const directionWord = assetSentiment > 0.12 ? "supportive of" : assetSentiment < -0.12 ? "a headwind for" : "broadly neutral for";
  const strengthWord = Math.abs(relationship) > 0.7 ? "strongly" : Math.abs(relationship) > 0.4 ? "moderately" : "loosely";

  return {
    article,
    relevance,
    assetSentiment,
    reason: `${asset.symbol} is ${strengthWord} linked to this theme, which makes the story ${directionWord} it. This is a typical relationship, not a rule.`,
  };
}

export interface NewsReading {
  strength: number;
  items: NewsRelevance[];
  evidence: EvidenceItem[];
  coverage: number;
  available: boolean;
}

export function analyseNews(asset: Asset, articles: NewsArticle[], now = Date.now()): NewsReading {
  const items: NewsRelevance[] = [];
  let weighted = 0;
  let totalWeight = 0;

  for (const article of articles) {
    const rel = relevanceFor(asset, article);
    if (!rel) continue;
    const ageHours = Math.max(0, (now - article.publishedAt) / 3_600_000);
    const decay = Math.pow(0.5, ageHours / HALF_LIFE_HOURS);
    const weight = rel.relevance * IMPACT_WEIGHT[article.impact] * decay;
    weighted += rel.assetSentiment * weight;
    totalWeight += weight;
    items.push(rel);
  }

  items.sort((a, b) => {
    const score = (r: NewsRelevance) =>
      r.relevance * IMPACT_WEIGHT[r.article.impact] * Math.pow(0.5, Math.max(0, (now - r.article.publishedAt) / 3_600_000) / HALF_LIFE_HOURS);
    return score(b) - score(a);
  });

  if (totalWeight < 0.25) {
    return { strength: 0, items: items.slice(0, 8), evidence: [], coverage: totalWeight, available: false };
  }

  // Confidence scales with how much relevant coverage there actually is.
  const coverageConfidence = clamp(totalWeight / 3, 0.35, 1);
  const strength = clamp((weighted / totalWeight) * coverageConfidence, -1, 1);

  const evidence: EvidenceItem[] = items.slice(0, 4).map((r) => ({
    label: r.article.headline,
    detail: r.reason,
    impact: r.assetSentiment,
  }));

  return { strength, items: items.slice(0, 12), evidence, coverage: totalWeight, available: true };
}

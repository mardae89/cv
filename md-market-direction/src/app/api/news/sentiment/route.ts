import { buildContext } from "@/lib/engine/context";
import { requireFeature } from "@/lib/auth/guard";
import { relevanceFor } from "@/lib/engine/news";
import { ASSETS, resolveAsset } from "@/lib/data/universe";
import { CACHE_MEDIUM, fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * NEWS → MARKET MAP.
 * For one article: every market it plausibly touches, with the direction of the
 * effect and why. For one symbol: every article that touches it.
 */
export async function GET(req: Request) {
  const auth = await requireFeature("news.intelligence");
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const articleId = searchParams.get("articleId");
  const symbol = searchParams.get("symbol");
  const ctx = await buildContext();

  if (articleId) {
    const article = ctx.news.find((a) => a.id === articleId);
    if (!article) return fail("Article not found.", 404);
    const mapped = ASSETS.map((asset) => {
      const rel = relevanceFor(asset, article);
      if (!rel) return null;
      return {
        symbol: asset.symbol,
        name: asset.name,
        group: asset.group,
        relevance: rel.relevance,
        effect: rel.assetSentiment,
        direction: rel.assetSentiment > 0.12 ? "bullish" : rel.assetSentiment < -0.12 ? "bearish" : "neutral",
        reason: rel.reason,
      };
    })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
      .slice(0, 14);

    return ok(
      {
        article,
        mapped,
        note: "These relationships are typical market tendencies, not guarantees. Markets can and do react differently.",
      },
      { headers: CACHE_MEDIUM },
    );
  }

  if (symbol) {
    const asset = resolveAsset(symbol);
    if (!asset) return fail("Unknown symbol.", 404);
    const items = ctx.news
      .map((article) => relevanceFor(asset, article))
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.relevance - a.relevance || b.article.publishedAt - a.article.publishedAt)
      .slice(0, 30);
    return ok({ symbol: asset.symbol, items }, { headers: CACHE_MEDIUM });
  }

  return fail("Provide articleId or symbol.");
}

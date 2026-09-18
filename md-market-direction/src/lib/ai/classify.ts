import type { Impact, NewsArticle, NewsCategory } from "@/lib/types";
import { NEWS_THEMES } from "@/lib/data/newsSeed";
import { getLlm } from "./llm";

interface RawArticle {
  id: string;
  headline: string;
  source: string;
  url?: string;
  publishedAt: number;
  summary: string;
}

/**
 * NEWS CLASSIFICATION.
 *
 * Live news arrives as plain headlines. The news → market mapping engine needs a
 * theme, a signed sentiment and an impact rating. We ask the configured LLM for
 * those; if there is no LLM, we return the articles marked `unclassified` with
 * neutral sentiment, and the scoring engine then treats the News category as
 * unavailable rather than guessing. We never fall back to word counting.
 */
export async function classifyArticles(
  raw: RawArticle[],
  category?: NewsCategory,
): Promise<NewsArticle[]> {
  const llm = getLlm();
  const fallback = (): NewsArticle[] =>
    raw.map((a) => ({
      ...a,
      theme: "unclassified",
      category: category ?? "markets",
      sentiment: 0,
      impact: "low" as Impact,
      symbols: [],
      summary: a.summary || "Classification unavailable — no AI provider configured.",
      demo: false,
    }));

  if (!llm || raw.length === 0) return fallback();

  const system = `You classify financial news for a market analysis engine. Reply with JSON only.
Valid themes: ${NEWS_THEMES.join(", ")}, unclassified.
For each article return: {"id": string, "theme": string, "sentiment": number between -1 and 1 measured
along the theme's own axis (for example for "rates-hawkish", +1 means clearly hawkish), "impact":
"low"|"medium"|"high", "symbols": string[] of tickers explicitly named, "summary": one plain-English
sentence on why it matters to markets}. Output {"articles":[...]} and nothing else.`;

  try {
    const text = await llm.complete({
      system,
      maxTokens: 2000,
      messages: [
        {
          role: "user",
          content: JSON.stringify(raw.map((a) => ({ id: a.id, headline: a.headline, summary: a.summary }))),
        },
      ],
    });
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as {
      articles: { id: string; theme: string; sentiment: number; impact: Impact; symbols: string[]; summary: string }[];
    };
    const byId = new Map(parsed.articles.map((a) => [a.id, a]));
    return raw.map((a) => {
      const c = byId.get(a.id);
      return {
        ...a,
        theme: c?.theme ?? "unclassified",
        category: category ?? "markets",
        sentiment: typeof c?.sentiment === "number" ? Math.max(-1, Math.min(1, c.sentiment)) : 0,
        impact: c?.impact ?? "low",
        symbols: c?.symbols ?? [],
        summary: c?.summary || a.summary,
        demo: false,
      };
    });
  } catch {
    return fallback();
  }
}

import type { NewsArticle, NewsCategory } from "@/lib/types";
import type { NewsProvider, ProviderHealth } from "../types";
import { classifyArticles } from "@/lib/ai/classify";

/**
 * LIVE NEWS — generic NewsAPI-compatible adapter.
 *
 * Enabled when NEWS_API_KEY is set. Raw headlines carry no theme or sentiment,
 * so they are passed through the classification layer (`classifyArticles`),
 * which uses the configured LLM when available. If classification is not
 * available the articles are returned with `theme: "unclassified"` and neutral
 * sentiment rather than a guessed value — the engine then reports the news
 * category as unavailable instead of inventing a reading.
 *
 * NOTE: written against NewsAPI's documented shape; not exercised against the
 * live API in this build because no credentials are configured here.
 */
export class NewsApiProvider implements NewsProvider {
  readonly id = "newsapi";
  readonly label = "NewsAPI";
  readonly live = true;
  private lastSuccessAt: number | null = null;
  private lastErrorAt: number | null = null;
  private lastMessage = "Not yet called.";

  constructor(private apiKey: string, private baseUrl = "https://newsapi.org/v2") {}

  health(): ProviderHealth {
    return {
      id: this.id, label: this.label, kind: "news", live: true,
      ok: this.lastErrorAt === null || (this.lastSuccessAt ?? 0) > this.lastErrorAt,
      message: this.lastMessage, lastSuccessAt: this.lastSuccessAt, lastErrorAt: this.lastErrorAt, latencyMs: null,
    };
  }

  async getNews(params: { symbols?: string[]; category?: NewsCategory; limit?: number } = {}): Promise<NewsArticle[]> {
    const query = params.symbols?.length
      ? params.symbols.join(" OR ")
      : "markets OR inflation OR \"central bank\" OR equities OR commodities";
    const url = new URL(`${this.baseUrl}/everything`);
    url.searchParams.set("q", query);
    url.searchParams.set("language", "en");
    url.searchParams.set("sortBy", "publishedAt");
    url.searchParams.set("pageSize", String(Math.min(params.limit ?? 60, 100)));
    const res = await fetch(url, { headers: { "X-Api-Key": this.apiKey }, next: { revalidate: 120 } });
    if (!res.ok) {
      this.lastErrorAt = Date.now();
      this.lastMessage = `HTTP ${res.status} from ${this.label}`;
      throw new Error(this.lastMessage);
    }
    const json = (await res.json()) as {
      articles?: { title: string; url: string; publishedAt: string; source: { name: string }; description?: string }[];
    };
    this.lastSuccessAt = Date.now();
    this.lastMessage = "OK";
    const raw = (json.articles ?? []).map((a, i) => ({
      id: `news-${i}-${a.publishedAt}`,
      headline: a.title,
      source: a.source?.name ?? this.label,
      url: a.url,
      publishedAt: new Date(a.publishedAt).getTime(),
      summary: a.description ?? "",
    }));
    return classifyArticles(raw, params.category);
  }
}

import type { NewsArticle, NewsCategory } from "@/lib/types";
import { generateNews } from "@/lib/data/newsSeed";
import type { NewsProvider, ProviderHealth } from "../types";

export class DemoNewsProvider implements NewsProvider {
  readonly id = "demo-news";
  readonly label = "MD Demo Newsdesk";
  readonly live = false;

  health(): ProviderHealth {
    return {
      id: this.id, label: this.label, kind: "news", live: false, ok: true,
      message: "Demo headlines generated from the same macro narrative as the rest of demo mode.",
      lastSuccessAt: Date.now(), lastErrorAt: null, latencyMs: 0,
    };
  }

  async getNews(params: { symbols?: string[]; category?: NewsCategory; limit?: number } = {}): Promise<NewsArticle[]> {
    let articles = generateNews();
    if (params.category) articles = articles.filter((a) => a.category === params.category);
    if (params.symbols?.length) {
      const set = new Set(params.symbols.map((s) => s.toUpperCase()));
      articles = articles.filter((a) => a.symbols.some((s) => set.has(s.toUpperCase())));
    }
    return articles.slice(0, params.limit ?? 120);
  }
}

import type { Candle, EconomicEvent, MacroSnapshot, NewsArticle, Quote, Timeframe } from "@/lib/types";
import { providers, withFallback, isDemoMode } from "@/lib/providers/registry";
import { singleton, TtlCache } from "@/lib/utils/cache";
import { ALL_TIMEFRAMES } from "@/lib/config/scoring";

/**
 * ANALYSIS CONTEXT.
 *
 * One context object carries everything an analysis run needs: candles, news,
 * calendar and macro. Candles are cached per (symbol, timeframe) so a full
 * market scan touches each series once, not once per asset that references it.
 */

const candleCache = singleton("candleCache", () => new TtlCache<Candle[]>(45_000, 2000));
const quoteCache = singleton("quoteCache", () => new TtlCache<Quote | null>(15_000, 1000));
const newsCache = singleton("newsCache", () => new TtlCache<NewsArticle[]>(120_000, 20));
const eventCache = singleton("eventCache", () => new TtlCache<EconomicEvent[]>(300_000, 20));
const macroCache = singleton("macroCache", () => new TtlCache<MacroSnapshot>(300_000, 5));

export interface AnalysisContext {
  now: number;
  news: NewsArticle[];
  events: EconomicEvent[];
  macro: MacroSnapshot;
  demo: boolean;
  degraded: string[];
  candles(symbol: string, tf: Timeframe): Promise<Candle[]>;
  quote(symbol: string): Promise<Quote | null>;
  /** Freshness of the most recent underlying fetch, epoch ms. */
  dataAt: number;
}

export async function buildContext(now = Date.now()): Promise<AnalysisContext> {
  const degraded: string[] = [];

  const newsEntry = await newsCache.wrap("all", async () => {
    const r = await withFallback(
      "news",
      providers.newsLive ? () => providers.newsLive!.getNews({ limit: 120 }) : null,
      () => providers.newsDemo.getNews({ limit: 120 }),
    );
    if (r.degraded) degraded.push("News provider unavailable — showing demo headlines.");
    return r.data;
  });

  const eventEntry = await eventCache.wrap("all", async () => {
    const r = await withFallback(
      "calendar",
      providers.calendarLive ? () => providers.calendarLive!.getEconomicEvents({}) : null,
      () => providers.calendarDemo.getEconomicEvents({}),
    );
    if (r.degraded) degraded.push("Calendar provider unavailable — showing demo events.");
    return r.data;
  });

  const macroEntry = await macroCache.wrap("all", () => providers.macro.getMacroSnapshot());

  return {
    now,
    news: newsEntry.value,
    events: eventEntry.value,
    macro: macroEntry.value,
    demo: isDemoMode(),
    degraded,
    dataAt: Math.min(newsEntry.at, eventEntry.at, macroEntry.at),
    async candles(symbol: string, tf: Timeframe) {
      const entry = await candleCache.wrap(`${symbol}|${tf}`, async () => {
        const r = await withFallback(
          "market",
          providers.marketLive ? () => providers.marketLive!.getHistoricalData(symbol, tf) : null,
          () => providers.marketDemo.getHistoricalData(symbol, tf),
        );
        if (r.degraded) degraded.push("Market data provider unavailable — showing demo prices.");
        return r.data;
      });
      return entry.value;
    },
    async quote(symbol: string) {
      const entry = await quoteCache.wrap(symbol, async () => {
        const r = await withFallback(
          "market",
          providers.marketLive ? () => providers.marketLive!.getQuote(symbol) : null,
          () => providers.marketDemo.getQuote(symbol),
        );
        if (r.degraded) degraded.push("Market data provider unavailable — showing demo prices.");
        return r.data;
      });
      return entry.value;
    },
  };
}

export function cacheStats() {
  return {
    candles: candleCache.size,
    quotes: quoteCache.size,
    news: newsCache.size,
    events: eventCache.size,
    macro: macroCache.size,
  };
}

export { ALL_TIMEFRAMES };

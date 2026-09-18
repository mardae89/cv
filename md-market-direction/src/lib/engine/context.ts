import type { Candle, EconomicEvent, MacroSnapshot, NewsArticle, Quote, Timeframe } from "@/lib/types";
import { providers, withFallback, isDemoMode, isLiveSymbol, markLive, marketProviderFor } from "@/lib/providers/registry";
import { singleton, TtlCache } from "@/lib/utils/cache";
import { ALL_TIMEFRAMES } from "@/lib/config/scoring";

/**
 * ANALYSIS CONTEXT.
 *
 * One context object carries everything an analysis run needs: candles, news,
 * calendar and macro. Candles are cached per (symbol, timeframe) so a full
 * market scan touches each series once, not once per asset that references it.
 */

/**
 * Cache windows. Demo data is free to regenerate, so it refreshes quickly. Live
 * data is metered, so it is held far longer — the numbers below keep a busy
 * dashboard inside a free plan's daily budget, and every screen shows the real
 * age of what it is displaying rather than implying it is a live tick.
 */
const LIVE = Boolean(process.env.TWELVE_DATA_API_KEY);
const INTRADAY_TTL = Number(process.env.MD_INTRADAY_TTL_MS ?? (LIVE ? 15 * 60_000 : 45_000));
const DAILY_TTL = Number(process.env.MD_DAILY_TTL_MS ?? (LIVE ? 6 * 60 * 60_000 : 45_000));
const QUOTE_TTL = Number(process.env.MD_QUOTE_TTL_MS ?? (LIVE ? 60_000 : 15_000));

const candleCache = singleton("candleCache", () => new TtlCache<Candle[]>(INTRADAY_TTL, 2000));
const bundleCache = singleton("bundleCache", () => new TtlCache<Record<Timeframe, Candle[]>>(INTRADAY_TTL, 200));
const quoteCache = singleton("quoteCache", () => new TtlCache<Quote | null>(QUOTE_TTL, 1000));
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
  /** Whether THIS symbol came from a live feed. Tracked per asset, not globally. */
  isLive(symbol: string): boolean;
  /** Freshness of the most recent underlying fetch, epoch ms. */
  dataAt: number;
}

export async function buildContext(now = Date.now()): Promise<AnalysisContext> {
  const degraded: string[] = [];
  // Per-symbol live tracking: a feed that fails for one market must not make the
  // whole dashboard claim to be live, nor make it claim to be entirely demo.
  const liveSymbols = new Set<string>();

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
      // Live symbols fetch two base series and derive the other four timeframes,
      // so a six-timeframe analysis costs two requests rather than six.
      const live = marketProviderFor(symbol);
      if (live?.getSeriesBundle) {
        const entry = await bundleCache.wrap(
          symbol,
          async () => {
            const r = await withFallback(
              "market",
              () => live.getSeriesBundle!(symbol),
              async () => {
                const out = {} as Record<Timeframe, Candle[]>;
                for (const t of ALL_TIMEFRAMES) out[t] = await providers.marketDemo.getHistoricalData(symbol, t);
                return out;
              },
            );
            if (r.degraded) {
              degraded.push(`Live data unavailable for ${symbol} — showing demo prices for it.`);
              liveSymbols.delete(symbol.toUpperCase());
              markLive(symbol, false);
            } else {
              liveSymbols.add(symbol.toUpperCase());
              markLive(symbol, true);
            }
            return r.data;
          },
          tf === "1D" || tf === "1W" ? DAILY_TTL : INTRADAY_TTL,
        );
        const series = entry.value[tf];
        if (series?.length) return series;
        // A timeframe the vendor could not supply falls back for that timeframe
        // only, and the engine marks its readings unavailable if still empty.
        return providers.marketDemo.getHistoricalData(symbol, tf);
      }

      const entry = await candleCache.wrap(`${symbol}|${tf}`, () =>
        providers.marketDemo.getHistoricalData(symbol, tf),
      );
      return entry.value;
    },
    async quote(symbol: string) {
      const entry = await quoteCache.wrap(symbol, async () => {
        const liveQuote = marketProviderFor(symbol);
        if (!liveQuote) return providers.marketDemo.getQuote(symbol);
        const r = await withFallback(
          "market",
          () => liveQuote.getQuote(symbol),
          () => providers.marketDemo.getQuote(symbol),
        );
        if (r.degraded) {
          degraded.push(`Live quote unavailable for ${symbol} — showing a demo price for it.`);
          liveSymbols.delete(symbol.toUpperCase());
          markLive(symbol, false);
        }
        return r.data;
      });
      return entry.value;
    },
    isLive(symbol: string) {
      return liveSymbols.has(symbol.toUpperCase());
    },
  };
}

export function cacheStats() {
  return {
    candles: candleCache.size,
    bundles: bundleCache.size,
    quotes: quoteCache.size,
    news: newsCache.size,
    events: eventCache.size,
    macro: macroCache.size,
  };
}

export { ALL_TIMEFRAMES };

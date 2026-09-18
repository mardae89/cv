import type {
  Candle,
  EconomicEvent,
  MacroSnapshot,
  NewsArticle,
  NewsCategory,
  Quote,
  Timeframe,
} from "@/lib/types";

/**
 * PROVIDER ABSTRACTION LAYER.
 *
 * Nothing above this layer knows where data comes from. Swapping in a licensed
 * market-data vendor means implementing these interfaces and registering the
 * implementation — no engine or UI code changes.
 */

export interface ProviderHealth {
  id: string;
  label: string;
  kind: "market" | "news" | "calendar" | "fundamentals" | "macro";
  live: boolean;
  ok: boolean;
  message: string;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  latencyMs: number | null;
}

export interface BaseProvider {
  readonly id: string;
  readonly label: string;
  /** false = clearly-labelled demo data. */
  readonly live: boolean;
  health(): ProviderHealth;
}

export interface MarketDataProvider extends BaseProvider {
  getQuote(symbol: string): Promise<Quote | null>;
  getQuotes(symbols: string[]): Promise<Quote[]>;
  getHistoricalData(symbol: string, timeframe: Timeframe, bars?: number): Promise<Candle[]>;
}

export interface NewsProvider extends BaseProvider {
  getNews(params?: { symbols?: string[]; category?: NewsCategory; limit?: number }): Promise<NewsArticle[]>;
}

export interface EconomicCalendarProvider extends BaseProvider {
  getEconomicEvents(params?: { from?: number; to?: number }): Promise<EconomicEvent[]>;
}

export interface FundamentalDataProvider extends BaseProvider {
  getFundamentals(symbol: string): Promise<Fundamentals | null>;
}

export interface MacroProvider extends BaseProvider {
  getMacroSnapshot(): Promise<MacroSnapshot>;
}

export interface Fundamentals {
  symbol: string;
  marketCap: number | null;
  peRatio: number | null;
  eps: number | null;
  dividendYield: number | null;
  nextEarnings: number | null;
  sector: string | null;
  /** Analyst revision trend, where licensing permits. -1..1 or null. */
  revisionTrend: number | null;
  demo: boolean;
}

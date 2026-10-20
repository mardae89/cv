import type {
  Candle,
  EconomicEvent,
  MacroSnapshot,
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
  kind: "market" | "calendar" | "macro";
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
  /**
   * All six timeframes for one symbol. Live providers implement this by
   * fetching two base series and deriving the rest (see data/aggregate.ts),
   * which cuts per-asset request cost from six calls to two.
   */
  getSeriesBundle?(symbol: string): Promise<Record<Timeframe, Candle[]>>;
}

export interface EconomicCalendarProvider extends BaseProvider {
  getEconomicEvents(params?: { from?: number; to?: number }): Promise<EconomicEvent[]>;
}

export interface MacroProvider extends BaseProvider {
  getMacroSnapshot(): Promise<MacroSnapshot>;
}

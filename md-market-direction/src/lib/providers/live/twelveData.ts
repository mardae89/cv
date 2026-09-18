import type { Candle, Quote, Timeframe } from "@/lib/types";
import type { MarketDataProvider, ProviderHealth } from "../types";

/**
 * LIVE MARKET DATA — Twelve Data adapter.
 *
 * Enabled only when TWELVE_DATA_API_KEY is present. The key is read server-side
 * and never reaches the browser. If a request fails the registry falls back to
 * demo data and the failure is surfaced in Settings → Data Sources and in the
 * admin API-health panel, so the user always knows what they are looking at.
 *
 * NOTE: this adapter is written against Twelve Data's documented REST shapes.
 * It has not been exercised against the live API in this build because no
 * credentials are configured here.
 */

const INTERVALS: Record<Timeframe, string> = {
  "5M": "5min",
  "15M": "15min",
  "1H": "1h",
  "4H": "4h",
  "1D": "1day",
  "1W": "1week",
};

/** Vendor symbols differ from MD display symbols for indices and crypto. */
const SYMBOL_MAP: Record<string, string> = {
  SPX: "SPX",
  NDX: "NDX",
  DJI: "DJI",
  RUT: "RUT",
  DAX: "DAX",
  FTSE: "UKX",
  NIKKEI: "N225",
  HSI: "HSI",
  DXY: "DXY",
  VIX: "VIX",
  WTI: "WTI/USD",
  BRENT: "BRENT/USD",
  NATGAS: "NG/USD",
  COPPER: "COPPER",
  US10Y: "US10Y",
  US02Y: "US2Y",
};

export class TwelveDataProvider implements MarketDataProvider {
  readonly id = "twelve-data";
  readonly label = "Twelve Data";
  readonly live = true;
  private lastSuccessAt: number | null = null;
  private lastErrorAt: number | null = null;
  private lastMessage = "Not yet called.";
  private latencyMs: number | null = null;

  constructor(private apiKey: string, private baseUrl = "https://api.twelvedata.com") {}

  health(): ProviderHealth {
    return {
      id: this.id,
      label: this.label,
      kind: "market",
      live: true,
      ok: this.lastErrorAt === null || (this.lastSuccessAt ?? 0) > this.lastErrorAt,
      message: this.lastMessage,
      lastSuccessAt: this.lastSuccessAt,
      lastErrorAt: this.lastErrorAt,
      latencyMs: this.latencyMs,
    };
  }

  private vendorSymbol(symbol: string) {
    return SYMBOL_MAP[symbol.toUpperCase()] ?? symbol.toUpperCase();
  }

  private async call<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("apikey", this.apiKey);
    const started = Date.now();
    const res = await fetch(url, { next: { revalidate: 30 } });
    this.latencyMs = Date.now() - started;
    if (!res.ok) {
      this.lastErrorAt = Date.now();
      this.lastMessage = `HTTP ${res.status} from ${this.label}`;
      throw new Error(this.lastMessage);
    }
    const json = (await res.json()) as T & { status?: string; message?: string };
    if (json.status === "error") {
      this.lastErrorAt = Date.now();
      this.lastMessage = json.message ?? "Provider returned an error.";
      throw new Error(this.lastMessage);
    }
    this.lastSuccessAt = Date.now();
    this.lastMessage = "OK";
    return json;
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const raw = await this.call<Record<string, string>>("quote", { symbol: this.vendorSymbol(symbol) });
    const price = Number(raw.close);
    const prevClose = Number(raw.previous_close);
    if (!Number.isFinite(price)) return null;
    return {
      symbol: symbol.toUpperCase(),
      price,
      change: Number(raw.change) || price - prevClose,
      changePct: Number(raw.percent_change) || (prevClose ? ((price - prevClose) / prevClose) * 100 : 0),
      dayHigh: Number(raw.high) || price,
      dayLow: Number(raw.low) || price,
      prevClose: Number.isFinite(prevClose) ? prevClose : price,
      volume: Number(raw.volume) || 0,
      timestamp: Date.now(),
      source: this.label,
      demo: false,
    };
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const results = await Promise.allSettled(symbols.map((s) => this.getQuote(s)));
    return results
      .filter((r): r is PromiseFulfilledResult<Quote | null> => r.status === "fulfilled")
      .map((r) => r.value)
      .filter((q): q is Quote => q !== null);
  }

  async getHistoricalData(symbol: string, timeframe: Timeframe, bars = 500): Promise<Candle[]> {
    const raw = await this.call<{ values?: Record<string, string>[] }>("time_series", {
      symbol: this.vendorSymbol(symbol),
      interval: INTERVALS[timeframe],
      outputsize: String(Math.min(bars, 5000)),
      order: "ASC",
    });
    return (raw.values ?? []).map((v) => ({
      t: new Date(v.datetime.replace(" ", "T") + "Z").getTime(),
      o: Number(v.open),
      h: Number(v.high),
      l: Number(v.low),
      c: Number(v.close),
      v: Number(v.volume ?? 0),
    }));
  }
}

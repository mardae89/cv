import type { Candle, Quote, Timeframe } from "@/lib/types";
import type { MarketDataProvider, ProviderHealth } from "../types";
import { buildTimeframes } from "@/lib/data/aggregate";
import { budget } from "../budget";

/**
 * LIVE MARKET DATA — Twelve Data adapter.
 *
 * Enabled only when TWELVE_DATA_API_KEY is present. The key is read server-side
 * and never reaches the browser.
 *
 * Request economics drive the design. The free tier allows 8 requests/minute and
 * 800/day, while a naive six-timeframe scan of 48 assets would cost 288 requests
 * per refresh. So:
 *   - only two series are fetched per asset (5min + 1day); the other four
 *     timeframes are derived locally by aggregation;
 *   - quotes are batched into a single comma-separated request;
 *   - every call is checked against a request budget first, so an exhausted plan
 *     degrades to demo data with an explanation instead of a wall of 429s.
 *
 * NOTE: written against Twelve Data's documented REST shapes. It has NOT been
 * exercised against the live API in this build, because no credentials are
 * configured here. The first real call is the real test.
 */

const INTERVALS: Record<Timeframe, string> = {
  "5M": "5min", "15M": "15min", "30M": "30min", "1H": "1h", "4H": "4h", "1D": "1day", "1W": "1week",
};

/** Vendor symbols differ from MD display symbols for indices and commodities. */
const SYMBOL_MAP: Record<string, string> = {
  SPX: "SPX", NDX: "NDX", DJI: "DJI", RUT: "RUT", DAX: "DAX", FTSE: "UKX",
  NIKKEI: "N225", HSI: "HSI", DXY: "DXY", VIX: "VIX",
  WTI: "WTI/USD", BRENT: "BRENT/USD", NATGAS: "NG/USD", COPPER: "COPPER",
  US10Y: "US10Y", US02Y: "US2Y",
};

interface TimeSeriesRow {
  datetime: string; open: string; high: string; low: string; close: string; volume?: string;
}

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
    const b = budget.state();
    const message = b.exhausted
      ? `${this.lastMessage} — ${b.reason ?? "request budget exhausted"}`
      : `${this.lastMessage} (${b.usedToday}/${b.perDay} requests used today)`;
    return {
      id: this.id,
      label: this.label,
      kind: "market",
      live: true,
      ok: !b.exhausted && (this.lastErrorAt === null || (this.lastSuccessAt ?? 0) > this.lastErrorAt),
      message,
      lastSuccessAt: this.lastSuccessAt,
      lastErrorAt: this.lastErrorAt,
      latencyMs: this.latencyMs,
    };
  }

  private vendorSymbol(symbol: string) {
    return SYMBOL_MAP[symbol.toUpperCase()] ?? symbol.toUpperCase();
  }

  private async call<T>(path: string, params: Record<string, string>, cost = 1): Promise<T> {
    if (!budget.tryConsume(cost)) {
      this.lastMessage = budget.state().reason ?? "Request budget exhausted.";
      throw new Error(this.lastMessage);
    }
    const url = new URL(`${this.baseUrl}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("apikey", this.apiKey);

    const started = Date.now();
    const res = await fetch(url, { cache: "no-store" });
    this.latencyMs = Date.now() - started;

    if (res.status === 429) {
      this.lastErrorAt = Date.now();
      this.lastMessage = "Rate limited by Twelve Data. Reduce MD_LIVE_SYMBOLS or upgrade the plan.";
      throw new Error(this.lastMessage);
    }
    if (!res.ok) {
      this.lastErrorAt = Date.now();
      this.lastMessage = `HTTP ${res.status} from ${this.label}`;
      throw new Error(this.lastMessage);
    }
    const json = (await res.json()) as T & { status?: string; message?: string; code?: number };
    if (json.status === "error") {
      this.lastErrorAt = Date.now();
      this.lastMessage = json.message ?? "Provider returned an error.";
      throw new Error(this.lastMessage);
    }
    this.lastSuccessAt = Date.now();
    this.lastMessage = "OK";
    return json;
  }

  private toCandles(rows: TimeSeriesRow[] | undefined): Candle[] {
    return (rows ?? [])
      .map((v) => ({
        t: new Date(v.datetime.replace(" ", "T") + "Z").getTime(),
        o: Number(v.open), h: Number(v.high), l: Number(v.low), c: Number(v.close),
        v: Number(v.volume ?? 0),
      }))
      .filter((c) => Number.isFinite(c.c) && Number.isFinite(c.t))
      .sort((a, b) => a.t - b.t);
  }

  /** Two requests cover all six timeframes. */
  async getSeriesBundle(symbol: string): Promise<Record<Timeframe, Candle[]>> {
    const vendor = this.vendorSymbol(symbol);
    const [intraday, daily] = await Promise.all([
      this.call<{ values?: TimeSeriesRow[] }>("time_series", {
        symbol: vendor, interval: "5min", outputsize: "5000", order: "ASC",
      }),
      this.call<{ values?: TimeSeriesRow[] }>("time_series", {
        symbol: vendor, interval: "1day", outputsize: "5000", order: "ASC",
      }),
    ]);
    return buildTimeframes(this.toCandles(intraday.values), this.toCandles(daily.values));
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const raw = await this.call<Record<string, string>>("quote", { symbol: this.vendorSymbol(symbol) });
    return this.parseQuote(symbol.toUpperCase(), raw);
  }

  private parseQuote(symbol: string, raw: Record<string, string>): Quote | null {
    const price = Number(raw.close);
    const prevClose = Number(raw.previous_close);
    if (!Number.isFinite(price)) return null;
    return {
      symbol,
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

  /** Batched: one request for many symbols rather than one per symbol. */
  async getQuotes(symbols: string[]): Promise<Quote[]> {
    if (!symbols.length) return [];
    const vendorToDisplay = new Map(symbols.map((s) => [this.vendorSymbol(s), s.toUpperCase()]));
    const joined = Array.from(vendorToDisplay.keys()).join(",");
    const raw = await this.call<Record<string, unknown>>("quote", { symbol: joined });

    // A single symbol returns the object directly; several return a map keyed by symbol.
    const entries: [string, Record<string, string>][] =
      vendorToDisplay.size === 1
        ? [[joined, raw as Record<string, string>]]
        : Object.entries(raw as Record<string, Record<string, string>>);

    const out: Quote[] = [];
    for (const [vendor, value] of entries) {
      const display = vendorToDisplay.get(vendor);
      if (!display || !value || typeof value !== "object") continue;
      const q = this.parseQuote(display, value);
      if (q) out.push(q);
    }
    return out;
  }

  async getHistoricalData(symbol: string, timeframe: Timeframe, bars = 500): Promise<Candle[]> {
    const raw = await this.call<{ values?: TimeSeriesRow[] }>("time_series", {
      symbol: this.vendorSymbol(symbol),
      interval: INTERVALS[timeframe],
      outputsize: String(Math.min(bars, 5000)),
      order: "ASC",
    });
    return this.toCandles(raw.values);
  }
}

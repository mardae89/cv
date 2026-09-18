import type { Candle, Quote, Timeframe } from "@/lib/types";
import type { MarketDataProvider, ProviderHealth } from "../types";
import { buildTimeframes } from "@/lib/data/aggregate";

/**
 * LIVE MARKET DATA — OANDA v20 adapter.
 *
 * This is the adapter to use if you trade with OANDA, because it returns YOUR
 * BROKER'S OWN PRICES. Anything else (Twelve Data, Alpha Vantage) aggregates
 * from other venues and will be close to your charts but never identical.
 *
 * Only two things are needed: a personal access token and whether the account is
 * practice or live. Notably NOT an account ID — quotes are derived from the
 * latest candle rather than the /pricing endpoint, which keeps setup to one
 * token.
 *
 * Request cost: two calls per instrument (M5 + D), with the other four
 * timeframes derived locally by aggregation. OANDA's REST limits are far more
 * generous than the metered vendors, so the whole forex/metals/indices universe
 * can run live.
 *
 * NOTE: written against OANDA's documented v20 REST shapes. It has NOT been run
 * against the live API here — no credentials exist in this environment.
 */

const GRANULARITY: Record<Timeframe, string> = {
  "5M": "M5", "15M": "M15", "1H": "H1", "4H": "H4", "1D": "D", "1W": "W",
};

/**
 * MD symbol → OANDA instrument.
 *
 * Deliberate omissions, because a wrong mapping is worse than none:
 *  - US10Y / US02Y: this app treats these as YIELDS. OANDA's USB10Y_USD is a
 *    bond PRICE, which moves inversely. Mapping them would silently invert every
 *    cross-market relationship that depends on yields.
 *  - DXY, VIX: OANDA has no equivalent instrument.
 *  - Individual stocks and crypto: not offered, or region-dependent.
 * Those symbols fall through to the next provider, or to demo data.
 */
const INSTRUMENTS: Record<string, string> = {
  "EUR/USD": "EUR_USD", "GBP/USD": "GBP_USD", "USD/JPY": "USD_JPY", "USD/CHF": "USD_CHF",
  "AUD/USD": "AUD_USD", "USD/CAD": "USD_CAD", "NZD/USD": "NZD_USD",
  "EUR/JPY": "EUR_JPY", "GBP/JPY": "GBP_JPY", "EUR/GBP": "EUR_GBP", "AUD/JPY": "AUD_JPY",
  "EUR/CHF": "EUR_CHF", "CAD/JPY": "CAD_JPY",
  "XAU/USD": "XAU_USD", "XAG/USD": "XAG_USD",
  SPX: "SPX500_USD", NDX: "NAS100_USD", DJI: "US30_USD", RUT: "US2000_USD",
  DAX: "DE30_EUR", FTSE: "UK100_GBP", NIKKEI: "JP225_USD", HSI: "HK33_HKD",
  WTI: "WTICO_USD", BRENT: "BCO_USD", NATGAS: "NATGAS_USD", COPPER: "XCU_USD",
};

export function oandaCovers(symbol: string): boolean {
  return symbol.toUpperCase() in INSTRUMENTS;
}

interface OandaCandle {
  time: string;
  volume: number;
  complete: boolean;
  mid?: { o: string; h: string; l: string; c: string };
}

export class OandaProvider implements MarketDataProvider {
  readonly id = "oanda";
  readonly label = "OANDA";
  readonly live = true;
  private lastSuccessAt: number | null = null;
  private lastErrorAt: number | null = null;
  private lastMessage = "Not yet called.";
  private latencyMs: number | null = null;
  private baseUrl: string;

  constructor(private token: string, environment: "practice" | "live" = "practice") {
    this.baseUrl =
      environment === "live" ? "https://api-fxtrade.oanda.com" : "https://api-fxpractice.oanda.com";
  }

  health(): ProviderHealth {
    return {
      id: this.id,
      label: `${this.label} (${this.baseUrl.includes("fxtrade") ? "live" : "practice"})`,
      kind: "market",
      live: true,
      ok: this.lastErrorAt === null || (this.lastSuccessAt ?? 0) > this.lastErrorAt,
      message: this.lastMessage,
      lastSuccessAt: this.lastSuccessAt,
      lastErrorAt: this.lastErrorAt,
      latencyMs: this.latencyMs,
    };
  }

  private async candles(symbol: string, granularity: string, count: number): Promise<Candle[]> {
    const instrument = INSTRUMENTS[symbol.toUpperCase()];
    if (!instrument) throw new Error(`${symbol} is not an OANDA instrument.`);

    const url = new URL(`${this.baseUrl}/v3/instruments/${instrument}/candles`);
    url.searchParams.set("granularity", granularity);
    url.searchParams.set("count", String(Math.min(count, 5000)));
    url.searchParams.set("price", "M"); // midpoint

    const started = Date.now();
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        // Epoch seconds rather than RFC3339-with-nanoseconds, which Date cannot parse.
        "Accept-Datetime-Format": "UNIX",
      },
      cache: "no-store",
    });
    this.latencyMs = Date.now() - started;

    if (res.status === 401) {
      this.lastErrorAt = Date.now();
      this.lastMessage = "OANDA rejected the token (401). Check OANDA_API_TOKEN and that OANDA_ENVIRONMENT matches the account the token came from.";
      throw new Error(this.lastMessage);
    }
    if (!res.ok) {
      this.lastErrorAt = Date.now();
      this.lastMessage = `HTTP ${res.status} from OANDA for ${instrument}`;
      throw new Error(this.lastMessage);
    }

    const json = (await res.json()) as { candles?: OandaCandle[] };
    this.lastSuccessAt = Date.now();
    this.lastMessage = "OK";

    return (json.candles ?? [])
      // An incomplete candle is the one still forming; keep it, it is the live bar.
      .filter((c) => c.mid)
      .map((c) => ({
        t: Math.round(Number(c.time) * 1000),
        o: Number(c.mid!.o), h: Number(c.mid!.h), l: Number(c.mid!.l), c: Number(c.mid!.c),
        v: Number(c.volume) || 0,
      }))
      .filter((c) => Number.isFinite(c.c) && Number.isFinite(c.t))
      .sort((a, b) => a.t - b.t);
  }

  /** Two requests cover all six timeframes. */
  async getSeriesBundle(symbol: string): Promise<Record<Timeframe, Candle[]>> {
    const [intraday, daily] = await Promise.all([
      this.candles(symbol, "M5", 5000),
      this.candles(symbol, "D", 2000),
    ]);
    return buildTimeframes(intraday, daily);
  }

  async getHistoricalData(symbol: string, timeframe: Timeframe, bars = 500): Promise<Candle[]> {
    return this.candles(symbol, GRANULARITY[timeframe], bars);
  }

  /**
   * Derived from the daily candles rather than the /pricing endpoint, so no
   * account ID is needed — one token is the whole setup.
   */
  async getQuote(symbol: string): Promise<Quote | null> {
    const daily = await this.candles(symbol, "D", 3);
    if (daily.length < 1) return null;
    const today = daily[daily.length - 1];
    const prev = daily.length > 1 ? daily[daily.length - 2] : null;
    const prevClose = prev ? prev.c : today.o;
    return {
      symbol: symbol.toUpperCase(),
      price: today.c,
      change: today.c - prevClose,
      changePct: prevClose ? ((today.c - prevClose) / prevClose) * 100 : 0,
      dayHigh: today.h,
      dayLow: today.l,
      prevClose,
      volume: today.v,
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
}

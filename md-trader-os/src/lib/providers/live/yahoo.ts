import type { Candle, Quote, Timeframe } from "@/lib/types";
import type { MarketDataProvider, ProviderHealth } from "../types";
import { aggregate } from "@/lib/data/aggregate";
import { ASSETS, getAsset } from "@/lib/data/universe";

/**
 * LIVE MARKET DATA WITH NO KEY — Yahoo Finance chart endpoint.
 *
 * This exists so a fresh deployment shows real prices before anyone has set up
 * a data account. OANDA (your broker's own prices) and Twelve Data both take
 * priority when they are configured; this covers whatever they do not.
 *
 * Three things to know:
 *  - It is an unofficial, unauthenticated endpoint. It can rate-limit or change
 *    without notice, so every call has a timeout and repeated failures open a
 *    circuit for a few minutes, during which the app shows labelled demo data
 *    instead of hanging.
 *  - Yahoo's data is licensed for personal use. Before charging subscribers,
 *    switch to a feed licensed for redistribution.
 *  - Indices, metals and energy are read from their futures contracts (NQ=F,
 *    GC=F, CL=F …). Those track the CFDs closely but are not identical: gold
 *    futures sit a few dollars from spot.
 *
 * NOTE: written against the endpoint's documented-by-use response shape. It has
 * NOT been run against the live service from where it was built — outbound
 * access to it was blocked there.
 */

const BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

const NON_FX: Record<string, string> = {
  NAS100: "NQ=F", SPX500: "ES=F", US30: "YM=F", US2000: "RTY=F",
  GER40: "^GDAXI", UK100: "^FTSE", JPN225: "^N225", HK50: "^HSI",
  "XAU/USD": "GC=F", "XAG/USD": "SI=F", COPPER: "HG=F",
  WTI: "CL=F", BRENT: "BZ=F", NATGAS: "NG=F",
  DXY: "DX-Y.NYB", VIX: "^VIX", US10Y: "^TNX",
};

/** Every pair of the eight majors is BASEQUOTE=X on Yahoo, so the 28 are derived. */
const SYMBOLS: Record<string, string> = {
  ...NON_FX,
  ...Object.fromEntries(ASSETS.filter((a) => a.assetClass === "forex").map((a) => [a.symbol, `${a.symbol.replace("/", "")}=X`])),
};

function vendorFor(symbol: string): string | undefined {
  return SYMBOLS[getAsset(symbol)?.symbol ?? symbol.toUpperCase()];
}

export function yahooCovers(symbol: string): boolean {
  return Boolean(vendorFor(symbol));
}

interface ChartResponse {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number };
      timestamp?: number[];
      indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }> };
    }> | null;
    error?: { code?: string; description?: string } | null;
  };
}

const INTERVAL: Record<Timeframe, { interval: string; range: string; from?: Timeframe }> = {
  "5M": { interval: "5m", range: "5d" },
  "15M": { interval: "15m", range: "30d" },
  "30M": { interval: "30m", range: "30d" },
  "1H": { interval: "60m", range: "120d" },
  "4H": { interval: "60m", range: "180d", from: "1H" },
  "1D": { interval: "1d", range: "5y" },
  "1W": { interval: "1wk", range: "5y" },
};

const TIMEOUT_MS = 8_000;
const TRIP_AFTER = 3;
const OPEN_FOR_MS = 5 * 60_000;

export class YahooProvider implements MarketDataProvider {
  readonly id = "yahoo";
  readonly label = "Yahoo Finance (no key)";
  readonly live = true;
  private lastSuccessAt: number | null = null;
  private lastErrorAt: number | null = null;
  private lastMessage = "Not yet called.";
  private latencyMs: number | null = null;
  private failures = 0;
  private openUntil = 0;

  health(): ProviderHealth {
    const open = Date.now() < this.openUntil;
    return {
      id: this.id,
      label: this.label,
      kind: "market",
      live: true,
      ok: !open && (this.lastErrorAt === null || (this.lastSuccessAt ?? 0) > this.lastErrorAt),
      message: open ? `${this.lastMessage} — paused for a few minutes after repeated failures` : this.lastMessage,
      lastSuccessAt: this.lastSuccessAt,
      lastErrorAt: this.lastErrorAt,
      latencyMs: this.latencyMs,
    };
  }

  private fail(message: string): never {
    this.lastErrorAt = Date.now();
    this.lastMessage = message;
    this.failures += 1;
    if (this.failures >= TRIP_AFTER) this.openUntil = Date.now() + OPEN_FOR_MS;
    throw new Error(message);
  }

  private async chart(symbol: string, interval: string, range: string): Promise<{ candles: Candle[]; meta: NonNullable<NonNullable<NonNullable<ChartResponse["chart"]>["result"]>[number]["meta"]> }> {
    const vendor = vendorFor(symbol);
    if (!vendor) throw new Error(`${symbol} has no Yahoo symbol.`);
    if (Date.now() < this.openUntil) throw new Error("Yahoo Finance paused after repeated failures.");

    const url = `${BASE}/${encodeURIComponent(vendor)}?interval=${interval}&range=${range}&includePrePost=false`;
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MDTraderOS/1.0)", Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      this.fail(`Yahoo Finance unreachable: ${err instanceof Error ? err.message : "network error"}`);
    }
    this.latencyMs = Date.now() - started;
    if (res.status === 429) this.fail("Yahoo Finance rate-limited this server (429).");
    if (!res.ok) this.fail(`HTTP ${res.status} from Yahoo Finance for ${vendor}`);

    const json = (await res.json().catch(() => null)) as ChartResponse | null;
    const result = json?.chart?.result?.[0];
    if (!result) this.fail(json?.chart?.error?.description ?? `No data from Yahoo Finance for ${vendor}`);

    const ts = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};
    // The 10-year yield has been quoted both as 4.31 and as 43.1 over the years.
    const scale = vendor === "^TNX" && (result.meta?.regularMarketPrice ?? 0) > 20 ? 0.1 : 1;
    const candles: Candle[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
      // Yahoo pads gaps with nulls; a bar without a price is no bar.
      if (o == null || h == null || l == null || c == null) continue;
      candles.push({ t: ts[i] * 1000, o: o * scale, h: h * scale, l: l * scale, c: c * scale, v: q.volume?.[i] ?? 0 });
    }
    this.failures = 0;
    this.lastSuccessAt = Date.now();
    this.lastMessage = "OK";
    return { candles: candles.sort((a, b) => a.t - b.t), meta: result.meta ?? {} };
  }

  /** Three requests cover all seven timeframes: 5-minute, hourly and daily. */
  async getSeriesBundle(symbol: string): Promise<Record<Timeframe, Candle[]>> {
    const [five, hourly, daily] = await Promise.all([
      this.chart(symbol, "5m", "5d"),
      this.chart(symbol, "60m", "180d"),
      this.chart(symbol, "1d", "5y"),
    ]);
    return {
      "5M": five.candles,
      "15M": aggregate(five.candles, "15M"),
      "30M": aggregate(five.candles, "30M"),
      "1H": hourly.candles,
      "4H": aggregate(hourly.candles, "4H"),
      "1D": daily.candles,
      "1W": aggregate(daily.candles, "1W"),
    };
  }

  async getHistoricalData(symbol: string, timeframe: Timeframe, bars = 500): Promise<Candle[]> {
    const spec = INTERVAL[timeframe];
    const { candles } = await this.chart(symbol, spec.interval, spec.range);
    const series = spec.from ? aggregate(candles, timeframe) : candles;
    return series.slice(-bars);
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const { candles, meta } = await this.chart(symbol, "1d", "5d");
    if (!candles.length) return null;
    const today = candles[candles.length - 1];
    const prev = candles.length > 1 ? candles[candles.length - 2] : null;
    const price = meta.regularMarketPrice ?? today.c;
    const prevClose = prev?.c ?? meta.chartPreviousClose ?? today.o;
    return {
      symbol: getAsset(symbol)?.symbol ?? symbol.toUpperCase(),
      price,
      change: price - prevClose,
      changePct: prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
      dayHigh: Math.max(today.h, price),
      dayLow: Math.min(today.l, price),
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

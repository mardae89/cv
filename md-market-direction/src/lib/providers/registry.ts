import type {
  EconomicCalendarProvider,
  FundamentalDataProvider,
  MacroProvider,
  MarketDataProvider,
  NewsProvider,
  ProviderHealth,
} from "./types";
import { DemoMarketDataProvider } from "./demo/market";
import { DemoNewsProvider } from "./demo/news";
import { DemoCalendarProvider } from "./demo/calendar";
import { DemoMacroProvider } from "./demo/macro";
import { DemoFundamentalsProvider } from "./demo/fundamentals";
import { TwelveDataProvider } from "./live/twelveData";
import { OandaProvider, oandaCovers } from "./live/oanda";
import { NewsApiProvider } from "./live/newsApi";
import { FmpCalendarProvider } from "./live/fmpCalendar";
import { ASSETS } from "@/lib/data/universe";
import { budget } from "./budget";

/**
 * PROVIDER REGISTRY.
 *
 * Chooses live providers when credentials exist, demo providers otherwise, and
 * wraps every live provider so a failure degrades to demo data instead of taking
 * the dashboard down. `providerStatus()` feeds Settings and the admin panel.
 */

const demoMarket = new DemoMarketDataProvider();
const demoNews = new DemoNewsProvider();
const demoCalendar = new DemoCalendarProvider();
const demoMacro = new DemoMacroProvider();
const demoFundamentals = new DemoFundamentalsProvider();

/**
 * Market data can come from two live sources at once, routed per symbol.
 *
 * OANDA is preferred wherever it has the instrument, because it returns the
 * user's OWN BROKER'S prices — the app then matches the charts they are already
 * looking at, rather than being merely close. Twelve Data covers what OANDA does
 * not (individual stocks, crypto, the dollar index, yields). Anything neither
 * covers stays on clearly-labelled demo data.
 */
const liveOanda = process.env.OANDA_API_TOKEN
  ? new OandaProvider(
      process.env.OANDA_API_TOKEN,
      process.env.OANDA_ENVIRONMENT === "live" ? "live" : "practice",
    )
  : null;

const liveTwelve = process.env.TWELVE_DATA_API_KEY
  ? new TwelveDataProvider(process.env.TWELVE_DATA_API_KEY)
  : null;

const liveMarket = liveOanda ?? liveTwelve;

/** Which live provider, if any, serves this symbol. */
export function marketProviderFor(symbol: string): MarketDataProvider | null {
  const s = symbol.toUpperCase();
  // OANDA's REST limits are generous, so everything it covers runs live.
  if (liveOanda && oandaCovers(s)) return liveOanda;
  // Twelve Data is metered, so it is restricted to the configured shortlist.
  if (liveTwelve && LIVE_SYMBOLS.has(s)) return liveTwelve;
  return null;
}
const liveNews = process.env.NEWS_API_KEY ? new NewsApiProvider(process.env.NEWS_API_KEY) : null;
const liveCalendar = process.env.FMP_API_KEY ? new FmpCalendarProvider(process.env.FMP_API_KEY) : null;

/**
 * WHICH SYMBOLS GET LIVE DATA.
 *
 * Live data is metered, so the universe is split deliberately rather than by
 * accident. `MD_LIVE_SYMBOLS` (comma separated) names the markets worth paying
 * for; everything else stays on clearly-labelled demo data and says so per
 * asset. The default is a core set that fits comfortably inside a free plan.
 */
const DEFAULT_LIVE_SYMBOLS = [
  "EUR/USD", "GBP/USD", "USD/JPY", "XAU/USD", "XAG/USD", "SPX",
  "NDX", "BTC/USD", "ETH/USD", "WTI", "AAPL", "NVDA",
];

export const LIVE_SYMBOLS: Set<string> = new Set(
  (process.env.MD_LIVE_SYMBOLS
    ? process.env.MD_LIVE_SYMBOLS.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : DEFAULT_LIVE_SYMBOLS
  ),
);

/** True when this specific symbol is CONFIGURED for a live feed. */
export function isLiveSymbol(symbol: string): boolean {
  return marketProviderFor(symbol) !== null;
}

/**
 * Symbols that a live feed has actually served, as opposed to those merely
 * configured for it. The banner reports this one: a configured symbol whose
 * fetch failed or was refused by the budget is still showing demo data, and
 * saying otherwise would be the exact dishonesty this product exists to avoid.
 */
const confirmedLive = new Set<string>();
export function markLive(symbol: string, live: boolean) {
  if (live) confirmedLive.add(symbol.toUpperCase());
  else confirmedLive.delete(symbol.toUpperCase());
}
export function confirmedLiveSymbols(): string[] {
  return Array.from(confirmedLive);
}

/** Records of degraded calls, surfaced to the user rather than hidden. */
const fallbacks = new Map<string, { at: number; reason: string }>();

export function recordFallback(providerId: string, reason: string) {
  fallbacks.set(providerId, { at: Date.now(), reason });
}

export function getFallbacks() {
  return Array.from(fallbacks.entries()).map(([id, v]) => ({ id, ...v }));
}

/** Runs a live call, falling back to the demo implementation on any failure. */
export async function withFallback<T>(
  providerId: string,
  live: (() => Promise<T>) | null,
  demo: () => Promise<T>,
): Promise<{ data: T; degraded: boolean }> {
  if (!live) return { data: await demo(), degraded: false };
  try {
    return { data: await live(), degraded: false };
  } catch (err) {
    recordFallback(providerId, err instanceof Error ? err.message : "Unknown provider error");
    return { data: await demo(), degraded: true };
  }
}

export const providers = {
  market: (liveMarket ?? demoMarket) as MarketDataProvider,
  oanda: liveOanda as MarketDataProvider | null,
  twelve: liveTwelve as MarketDataProvider | null,
  marketDemo: demoMarket as MarketDataProvider,
  marketLive: liveMarket as MarketDataProvider | null,
  news: (liveNews ?? demoNews) as NewsProvider,
  newsDemo: demoNews as NewsProvider,
  newsLive: liveNews as NewsProvider | null,
  calendar: (liveCalendar ?? demoCalendar) as EconomicCalendarProvider,
  calendarDemo: demoCalendar as EconomicCalendarProvider,
  calendarLive: liveCalendar as EconomicCalendarProvider | null,
  macro: demoMacro as MacroProvider,
  fundamentals: demoFundamentals as FundamentalDataProvider,
};

/** True when ANY core data source is running on demo data. */
export function isDemoMode(): boolean {
  return !liveMarket || !liveNews || !liveCalendar;
}

/** How many symbols any live provider is configured to serve. */
function configuredLiveCount(): number {
  return ASSETS.filter((a) => marketProviderFor(a.symbol) !== null).length;
}

/** How much of the universe is actually live — shown in the UI, not implied. */
export function liveCoverage(): {
  live: number; total: number; symbols: string[]; configured: number; pending: number;
} {
  const confirmed = liveMarket ? confirmedLiveSymbols() : [];
  const configured = configuredLiveCount();
  return {
    live: confirmed.length,
    total: ASSETS.length,
    symbols: confirmed,
    configured,
    // Configured but not yet fetched — a fresh instance warms up over the first
    // few page loads because of the per-minute request limit.
    pending: Math.max(0, configured - confirmed.length),
  };
}

export function demoSources(): string[] {
  const out: string[] = [];
  if (!liveMarket) out.push("Market data");
  if (!liveNews) out.push("News");
  if (!liveCalendar) out.push("Economic calendar");
  out.push("Macro");
  return out;
}

export function budgetState() {
  return liveTwelve ? budget.state() : null;
}

export function providerStatus(): ProviderHealth[] {
  return [
    ...(liveOanda ? [liveOanda.health()] : []),
    ...(liveTwelve ? [liveTwelve.health()] : []),
    ...(liveOanda || liveTwelve ? [] : [providers.market.health()]),
    providers.news.health(),
    providers.calendar.health(),
    providers.macro.health(),
    providers.fundamentals.health(),
  ];
}

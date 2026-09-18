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
import { NewsApiProvider } from "./live/newsApi";
import { FmpCalendarProvider } from "./live/fmpCalendar";

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

const liveMarket = process.env.TWELVE_DATA_API_KEY
  ? new TwelveDataProvider(process.env.TWELVE_DATA_API_KEY)
  : null;
const liveNews = process.env.NEWS_API_KEY ? new NewsApiProvider(process.env.NEWS_API_KEY) : null;
const liveCalendar = process.env.FMP_API_KEY ? new FmpCalendarProvider(process.env.FMP_API_KEY) : null;

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

export function demoSources(): string[] {
  const out: string[] = [];
  if (!liveMarket) out.push("Market data");
  if (!liveNews) out.push("News");
  if (!liveCalendar) out.push("Economic calendar");
  out.push("Macro");
  return out;
}

export function providerStatus(): ProviderHealth[] {
  return [
    providers.market.health(),
    providers.news.health(),
    providers.calendar.health(),
    providers.macro.health(),
    providers.fundamentals.health(),
  ];
}

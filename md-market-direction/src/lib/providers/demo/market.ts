import type { Candle, Quote, Timeframe } from "@/lib/types";
import { resolveAsset } from "@/lib/data/universe";
import { dailySummary, generateSeries, TF_BARS } from "@/lib/data/synth";
import type { MarketDataProvider, ProviderHealth } from "../types";

/** Demo market data. Always flagged `demo: true` — never presented as live. */
export class DemoMarketDataProvider implements MarketDataProvider {
  readonly id = "demo-market";
  readonly label = "MD Demo Engine";
  readonly live = false;
  private lastSuccessAt: number | null = null;

  health(): ProviderHealth {
    return {
      id: this.id,
      label: this.label,
      kind: "market",
      live: false,
      ok: true,
      message: "Deterministic demo data. Connect a licensed provider for live analysis.",
      lastSuccessAt: this.lastSuccessAt,
      lastErrorAt: null,
      latencyMs: 0,
    };
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const asset = resolveAsset(symbol);
    if (!asset) return null;
    const daily = generateSeries(asset, "1D");
    const s = dailySummary(daily);
    this.lastSuccessAt = Date.now();
    return {
      symbol: asset.symbol,
      price: s.price,
      change: s.price - s.prevClose,
      changePct: s.prevClose ? ((s.price - s.prevClose) / s.prevClose) * 100 : 0,
      dayHigh: s.dayHigh,
      dayLow: s.dayLow,
      prevClose: s.prevClose,
      volume: s.volume,
      timestamp: Date.now(),
      source: this.label,
      demo: true,
    };
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const out: Quote[] = [];
    for (const s of symbols) {
      const q = await this.getQuote(s);
      if (q) out.push(q);
    }
    return out;
  }

  async getHistoricalData(symbol: string, timeframe: Timeframe, bars?: number): Promise<Candle[]> {
    const asset = resolveAsset(symbol);
    if (!asset) return [];
    this.lastSuccessAt = Date.now();
    return generateSeries(asset, timeframe, { bars: bars ?? TF_BARS[timeframe] });
  }
}

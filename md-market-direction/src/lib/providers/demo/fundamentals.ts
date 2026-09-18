import { resolveAsset } from "@/lib/data/universe";
import { rng } from "@/lib/utils/random";
import type { Fundamentals, FundamentalDataProvider, ProviderHealth } from "../types";

const DAY = 24 * 60 * 60_000;

export class DemoFundamentalsProvider implements FundamentalDataProvider {
  readonly id = "demo-fundamentals";
  readonly label = "MD Demo Fundamentals";
  readonly live = false;

  health(): ProviderHealth {
    return {
      id: this.id, label: this.label, kind: "fundamentals", live: false, ok: true,
      message: "Demo fundamentals. Analyst revision data requires a licensed provider.",
      lastSuccessAt: Date.now(), lastErrorAt: null, latencyMs: 0,
    };
  }

  async getFundamentals(symbol: string): Promise<Fundamentals | null> {
    const asset = resolveAsset(symbol);
    if (!asset || (asset.assetClass !== "stock" && asset.assetClass !== "etf")) return null;
    const r = rng(`fund:${asset.symbol}:${Math.floor(Date.now() / DAY)}`);
    return {
      symbol: asset.symbol,
      marketCap: Math.round(asset.demoPrice * (2_000_000_000 + r() * 12_000_000_000)),
      peRatio: Number((12 + r() * 45).toFixed(1)),
      eps: Number((asset.demoPrice / (12 + r() * 40)).toFixed(2)),
      dividendYield: Number((r() * 2.6).toFixed(2)),
      nextEarnings: Date.now() + Math.floor(r() * 60) * DAY,
      sector: asset.sector ?? null,
      revisionTrend: Number(((r() - 0.5) * 1.6).toFixed(2)),
      demo: true,
    };
  }
}

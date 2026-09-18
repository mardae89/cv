import { buildContext } from "@/lib/engine/context";
import { ALL_TIMEFRAMES } from "@/lib/config/scoring";
import type { Timeframe } from "@/lib/types";
import { analyseStructure, findSwings } from "@/lib/engine/structure";
import { ema, sma } from "@/lib/engine/indicators";
import { resolveAsset } from "@/lib/data/universe";
import { CACHE_SHORT, fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Chart payload: candles + the overlays the chart actually draws. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const tf = (searchParams.get("timeframe") ?? "1D") as Timeframe;
  const bars = Math.min(Number(searchParams.get("bars") ?? 220), 600);
  if (!symbol) return fail("symbol is required");
  if (!ALL_TIMEFRAMES.includes(tf)) return fail("Invalid timeframe");

  const asset = resolveAsset(symbol);
  if (!asset) return fail("Unknown symbol", 404);

  const ctx = await buildContext();
  const all = await ctx.candles(asset.symbol, tf);
  if (!all.length) return fail("Market data temporarily unavailable.", 503);

  const closes = all.map((c) => c.c);
  const ma50 = ema(closes, 50);
  const ma200 = sma(closes, 200);
  const swings = findSwings(all, 3).slice(-12);
  const structure = analyseStructure(all, tf);

  const start = Math.max(0, all.length - bars);
  return ok(
    {
      symbol: asset.symbol,
      name: asset.name,
      precision: asset.precision,
      timeframe: tf,
      demo: ctx.demo,
      candles: all.slice(start),
      ma50: ma50.slice(start),
      ma200: ma200.slice(start),
      swings: swings.filter((s) => s.index >= start).map((s) => ({ t: s.t, price: s.price, kind: s.kind })),
      structure,
      events: ctx.events
        .filter((e) => e.importance === "high" && e.time >= all[start].t && e.time <= all[all.length - 1].t + 86_400_000)
        .map((e) => ({ t: e.time, name: e.name, importance: e.importance })),
      news: ctx.news
        .filter((n) => n.impact === "high" && n.symbols.includes(asset.symbol))
        .slice(0, 12)
        .map((n) => ({ t: n.publishedAt, headline: n.headline })),
      generatedAt: Date.now(),
    },
    { headers: CACHE_SHORT },
  );
}

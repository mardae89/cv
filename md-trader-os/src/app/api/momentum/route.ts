import { requireFeature } from "@/lib/auth/guard";
import { buildContext, type AnalysisContext } from "@/lib/engine/context";
import { analyseAsset } from "@/lib/engine/analyze";
import { evaluateMdMomentum } from "@/lib/engine/mdMomentum";
import { buildMomentumMeter, type MomentumMeter } from "@/lib/engine/momentumMeter";
import { aggregate } from "@/lib/data/aggregate";
import { resolveAsset, TRADABLE_ASSETS } from "@/lib/data/universe";
import type { AssetAnalysis } from "@/lib/types";
import { CACHE_SHORT, fail, ok, resolveScope } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * The meter's inputs. The detail view polls, so its lower timeframes come from
 * the short-cache `recent` path and follow price; the board reads the shared
 * bundle like every other scan.
 */
async function meterFor(ctx: AnalysisContext, analysis: AssetAnalysis, live: boolean, trail: boolean): Promise<MomentumMeter> {
  const s = analysis.asset.symbol;
  const read = live ? ctx.recent.bind(ctx) : ctx.candles.bind(ctx);
  const [daily, fourHour, oneHour, fifteen, five] = await Promise.all([
    ctx.candles(s, "1D"), ctx.candles(s, "4H"), read(s, "1H"), read(s, "15M"), read(s, "5M"),
  ]);
  return buildMomentumMeter({ analysis, daily, fourHour, oneHour, fifteen, five, trail });
}

/** MD Momentum — the strategy dashboard and its momentum meter. */
export async function GET(req: Request) {
  const auth = await requireFeature();
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const scope = resolveScope(searchParams.get("scope"), auth.user);
  const ctx = await buildContext();

  if (symbol) {
    const asset = resolveAsset(symbol);
    if (!asset) return fail("Unknown symbol.", 404);
    const analysis = await analyseAsset(ctx, asset.symbol, { mode: "md-momentum", scope, withPrevious: true });
    if (!analysis) return fail("Market data unavailable.", 503);
    const meter = await meterFor(ctx, analysis, true, true);
    // The live poll only needs the meter, not the whole analysis again.
    if (searchParams.get("meterOnly")) return ok({ meter }, { headers: { "Cache-Control": "no-store" } });
    const weekly = aggregate(await ctx.candles(asset.symbol, "1D"), "1W");
    return ok({ analysis, momentum: evaluateMdMomentum(analysis, weekly), meter, demo: ctx.demo }, { headers: { "Cache-Control": "no-store" } });
  }

  // Ranked board across the tradable universe.
  await ctx.warm(TRADABLE_ASSETS.map((a) => a.symbol));
  const results = [];
  for (const asset of TRADABLE_ASSETS) {
    const analysis = await analyseAsset(ctx, asset.symbol, { mode: "md-momentum", scope });
    if (!analysis) continue;
    const weekly = aggregate(await ctx.candles(asset.symbol, "1D"), "1W");
    const m = await meterFor(ctx, analysis, false, false);
    results.push({
      ...evaluateMdMomentum(analysis, weekly),
      meter: {
        push: m.push, pushLabel: m.pushLabel, side: m.side, verdict: m.verdict, verdictTitle: m.verdictTitle,
        aligned: m.aligned, prevWeek: m.prevWeek?.size ?? null, pullback: m.pullback?.status ?? null,
        timeframes: m.timeframes.map((t) => ({ timeframe: t.timeframe, push: t.push })),
      },
    });
  }
  results.sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50));

  return ok({ results, demo: ctx.demo, generatedAt: Date.now() }, { headers: CACHE_SHORT });
}

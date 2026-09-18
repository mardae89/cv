import { requireFeature } from "@/lib/auth/guard";
import { buildContext } from "@/lib/engine/context";
import { analyseAsset } from "@/lib/engine/analyze";
import { evaluateMdMomentum } from "@/lib/engine/mdMomentum";
import { ASSETS, resolveAsset } from "@/lib/data/universe";
import { CACHE_SHORT, fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

/** MD Momentum Mode — the strategy dashboard. */
export async function GET(req: Request) {
  const auth = await requireFeature();
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const ctx = await buildContext();

  if (symbol) {
    const asset = resolveAsset(symbol);
    if (!asset) return fail("Unknown symbol.", 404);
    const analysis = await analyseAsset(ctx, asset.symbol, { mode: "md-momentum", withPrevious: true });
    if (!analysis) return fail("Market data unavailable.", 503);
    const weekly = await ctx.candles(asset.symbol, "1W");
    return ok({ analysis, momentum: evaluateMdMomentum(analysis, weekly), demo: ctx.demo }, { headers: CACHE_SHORT });
  }

  // Ranked board across the tradable universe.
  const results = [];
  for (const asset of ASSETS.filter((a) => a.group !== "Macro Reference")) {
    const analysis = await analyseAsset(ctx, asset.symbol, { mode: "md-momentum" });
    if (!analysis) continue;
    const weekly = await ctx.candles(asset.symbol, "1W");
    results.push(evaluateMdMomentum(analysis, weekly));
  }
  results.sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50));

  return ok({ results, demo: ctx.demo, generatedAt: Date.now() }, { headers: CACHE_SHORT });
}

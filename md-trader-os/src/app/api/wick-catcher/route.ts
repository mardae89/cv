import { requireFeature } from "@/lib/auth/guard";
import { buildContext, type AnalysisContext } from "@/lib/engine/context";
import { analyseAsset } from "@/lib/engine/analyze";
import { buildWickReport, type WickReport } from "@/lib/engine/wickCatcher";
import { resolveAsset, TRADABLE_ASSETS } from "@/lib/data/universe";
import { CACHE_SHORT, fail, ok, resolveMode, resolveScope } from "@/lib/api";
import type { Timeframe, TradingMode, TrendScope } from "@/lib/types";

export const dynamic = "force-dynamic";

const SERIES: Timeframe[] = ["1W", "1D", "4H", "1H"];

async function report(ctx: AnalysisContext, symbol: string, mode: TradingMode, scope: TrendScope): Promise<WickReport | null> {
  const analysis = await analyseAsset(ctx, symbol, { mode, scope });
  if (!analysis) return null;
  const loaded = await Promise.all(SERIES.map((tf) => ctx.candles(analysis.asset.symbol, tf)));
  const series = Object.fromEntries(SERIES.map((tf, i) => [tf, loaded[i]]));
  return buildWickReport({ analysis, series });
}

/**
 * Wick Catcher. With ?symbol= returns every zone for one market; without it,
 * a board of the best with-trend zone per market, nearest first.
 */
export async function GET(req: Request) {
  const auth = await requireFeature();
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const mode = resolveMode(searchParams.get("mode"), auth.user);
  const scope = resolveScope(searchParams.get("scope"), auth.user);
  const ctx = await buildContext();

  if (symbol) {
    const asset = resolveAsset(symbol);
    if (!asset) return fail("Unknown symbol.", 404);
    const r = await report(ctx, asset.symbol, mode, scope);
    if (!r) return fail("Market data unavailable.", 503);
    return ok({ report: r, demo: !ctx.isLive(asset.symbol) }, { headers: CACHE_SHORT });
  }

  const rows: WickReport[] = [];
  for (const asset of TRADABLE_ASSETS) {
    const r = await report(ctx, asset.symbol, mode, scope);
    if (r) rows.push(r);
  }
  return ok(
    {
      rows: rows.map((r) => ({
        symbol: r.symbol,
        name: r.name,
        group: r.group,
        precision: r.precision,
        price: r.price,
        pipUnit: r.pipUnit,
        bias: r.bias,
        biasStrength: r.biasStrength,
        best: r.best,
        zoneCount: r.zones.length,
        demo: r.demo,
      })),
      demo: ctx.demo,
      generatedAt: Date.now(),
    },
    { headers: CACHE_SHORT },
  );
}

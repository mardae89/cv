import { buildContext } from "@/lib/engine/context";
import { analyseAsset } from "@/lib/engine/analyze";
import { viewer } from "@/lib/auth/public";
import { recordUsage } from "@/lib/db/store";
import { CACHE_SHORT, fail, ok, resolveMode, resolveScope } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) return fail("symbol is required");

  const user = await viewer();
  const mode = resolveMode(searchParams.get("mode"), user);
  const scope = resolveScope(searchParams.get("scope"), user);
  const ctx = await buildContext();
  const analysis = await analyseAsset(ctx, symbol, { mode, scope, withPrevious: true });
  if (!analysis) return fail("Market data unavailable for that symbol.", 404);

  recordUsage(user?.id ?? null, "asset-view", analysis.asset.symbol);
  return ok({ analysis, degraded: ctx.degraded }, { headers: CACHE_SHORT });
}

import { buildContext } from "@/lib/engine/context";
import { analyseAsset } from "@/lib/engine/analyze";
import { currentUser } from "@/lib/auth/session";
import { recordUsage } from "@/lib/db/store";
import { CACHE_SHORT, fail, ok, resolveMode } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) return fail("symbol is required");

  const user = await currentUser();
  const mode = resolveMode(searchParams.get("mode"), user);
  const ctx = await buildContext();
  const analysis = await analyseAsset(ctx, symbol, { mode, withPrevious: true });
  if (!analysis) return fail("Market data unavailable for that symbol.", 404);

  recordUsage(user?.id ?? null, "asset-view", analysis.asset.symbol);
  return ok({ analysis, degraded: ctx.degraded }, { headers: CACHE_SHORT });
}

import { buildContext } from "@/lib/engine/context";
import { globalDirection, mostInteresting, radar, scanUniverse, toScannerRow } from "@/lib/engine/market";
import { viewer } from "@/lib/auth/public";
import { CACHE_SHORT, ok, resolveMode, resolveScope } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Global market direction + radar + most-interesting markets. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const user = await viewer();
  const mode = resolveMode(searchParams.get("mode"), user);
  const scope = resolveScope(searchParams.get("scope"), user);
  const ctx = await buildContext();
  const analyses = await scanUniverse(ctx, mode, undefined, scope);
  const global = globalDirection(analyses);
  const { bullish, bearish } = radar(analyses, 6);

  return ok(
    {
      global,
      bullish: bullish.map(toScannerRow),
      bearish: bearish.map(toScannerRow),
      interesting: mostInteresting(analyses, 5).map((i) => ({
        ...toScannerRow(i.analysis),
        aligned: i.aligned,
        agreement: i.agreement,
      })),
      demo: ctx.demo,
      degraded: ctx.degraded,
      generatedAt: Date.now(),
    },
    { headers: CACHE_SHORT },
  );
}

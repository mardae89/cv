import { buildContext } from "@/lib/engine/context";
import { globalDirection, scanUniverse } from "@/lib/engine/market";
import { buildBrief } from "@/lib/engine/brief";
import { analyseAsset } from "@/lib/engine/analyze";
import { currentUser } from "@/lib/auth/session";
import { CACHE_SHORT, ok, resolveMode } from "@/lib/api";
import { radar } from "@/lib/engine/market";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const user = await currentUser();
  const mode = resolveMode(searchParams.get("mode"), user);
  const ctx = await buildContext();
  const analyses = await scanUniverse(ctx, mode);
  const global = globalDirection(analyses);

  // Change detection is the expensive part, so it runs only on the markets that
  // actually appear in the brief.
  const { bullish, bearish } = radar(analyses, 4);
  const withPrev = [];
  for (const a of [...bullish, ...bearish]) {
    const detailed = await analyseAsset(ctx, a.asset.symbol, { mode, withPrevious: true });
    if (detailed) withPrev.push(detailed);
  }

  return ok({ brief: buildBrief(ctx, withPrev, global) }, { headers: CACHE_SHORT });
}

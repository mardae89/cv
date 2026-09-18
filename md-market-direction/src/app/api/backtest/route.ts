import { rateLimit, requireFeature } from "@/lib/auth/guard";
import { buildContext } from "@/lib/engine/context";
import { runBacktest } from "@/lib/engine/backtest";
import { resolveAsset } from "@/lib/data/universe";
import { ALL_TIMEFRAMES } from "@/lib/config/scoring";
import type { Timeframe } from "@/lib/types";
import { fail, ok } from "@/lib/api";
import { newId, store } from "@/lib/db/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireFeature();
  if ("response" in auth) return auth.response;

  const limit = rateLimit(`backtest:${auth.user.id}`, 30, 60_000);
  if (!limit.ok) return fail("Backtests are rate limited. Try again in a moment.", 429);

  const body = await req.json().catch(() => null);
  const asset = resolveAsset(String(body?.symbol ?? ""));
  if (!asset) return fail("Unknown symbol.");
  const timeframe = (body?.timeframe ?? "1D") as Timeframe;
  if (!ALL_TIMEFRAMES.includes(timeframe)) return fail("Invalid timeframe.");

  const minScore = Math.min(95, Math.max(50, Number(body?.minScore ?? 75)));
  const holdingBars = Math.min(120, Math.max(1, Number(body?.holdingBars ?? 10)));
  const direction = body?.direction === "bearish" ? "bearish" : "bullish";

  const ctx = await buildContext();
  const candles = await ctx.candles(asset.symbol, timeframe);
  if (candles.length < 260) return fail("Not enough history for this timeframe.", 422);

  const result = runBacktest(candles, { symbol: asset.symbol, timeframe, direction, minScore, holdingBars });

  if (body?.save) {
    store.write((db) =>
      db.backtests.push({
        id: newId("bt"),
        userId: auth.user.id,
        name: String(body?.name ?? `${asset.symbol} ${timeframe} ≥${minScore}`),
        params: { symbol: asset.symbol, timeframe, direction, minScore, holdingBars },
        summary: { signals: result.signals, winRate: result.winRate, avgReturnPct: result.avgReturnPct },
        createdAt: Date.now(),
      }),
    );
  }

  return ok({ result, demo: ctx.demo });
}

export async function GET() {
  const auth = await requireFeature();
  if ("response" in auth) return auth.response;
  return ok({ saved: store.read().backtests.filter((b) => b.userId === auth.user.id) });
}

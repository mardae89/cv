import { requireUser } from "@/lib/auth/guard";
import { limitsFor } from "@/lib/auth/session";
import { newId, store } from "@/lib/db/store";
import { buildContext } from "@/lib/engine/context";
import { analyseAsset } from "@/lib/engine/analyze";
import { resolveAsset } from "@/lib/data/universe";
import { fail, ok, resolveMode } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { searchParams } = new URL(req.url);
  const withScores = searchParams.get("scores") !== "false";
  const mode = resolveMode(searchParams.get("mode"), auth.user);

  const lists = store.read().watchlists.filter((w) => w.userId === auth.user.id);
  if (!withScores) return ok({ watchlists: lists.map((l) => ({ ...l, items: [] })) });

  const ctx = await buildContext();
  const enriched = [];
  for (const list of lists) {
    const items = [];
    for (const symbol of list.symbols) {
      const a = await analyseAsset(ctx, symbol, { mode });
      if (!a) continue;
      items.push({
        symbol: a.asset.symbol, name: a.asset.name, price: a.quote.price, precision: a.asset.precision,
        changePct: a.quote.changePct, score: a.score.score, direction: a.score.direction, label: a.score.label,
      });
    }
    enriched.push({ ...list, items });
  }
  return ok({ watchlists: enriched, demo: ctx.demo });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) return fail("A watchlist name is required.");

  const limit = limitsFor(auth.user).watchlists;
  const existing = store.read().watchlists.filter((w) => w.userId === auth.user.id);
  if (existing.length >= limit) {
    return fail(`Your plan includes ${limit} watchlist${limit === 1 ? "" : "s"}. Upgrade for more.`, 402);
  }

  const symbols: string[] = Array.isArray(body?.symbols)
    ? body.symbols.map((s: string) => resolveAsset(String(s))?.symbol).filter(Boolean)
    : [];

  const watchlist = { id: newId("wl"), userId: auth.user.id, name, symbols, createdAt: Date.now() };
  store.write((db) => db.watchlists.push(watchlist));
  return ok({ watchlist });
}

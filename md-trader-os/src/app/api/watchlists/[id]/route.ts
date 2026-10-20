import { requireUser } from "@/lib/auth/guard";
import { store } from "@/lib/db/store";
import { resolveAsset } from "@/lib/data/universe";
import { fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const body = await req.json().catch(() => null);

  const result = store.write((db) => {
    const list = db.watchlists.find((w) => w.id === id && w.userId === auth.user.id);
    if (!list) return null;
    if (typeof body?.name === "string" && body.name.trim()) list.name = body.name.trim();
    if (typeof body?.add === "string") {
      const symbol = resolveAsset(body.add)?.symbol;
      if (symbol && !list.symbols.includes(symbol)) list.symbols.push(symbol);
    }
    if (typeof body?.remove === "string") {
      list.symbols = list.symbols.filter((s) => s !== body.remove.toUpperCase());
    }
    if (Array.isArray(body?.symbols)) {
      list.symbols = body.symbols.map((s: string) => resolveAsset(String(s))?.symbol).filter(Boolean) as string[];
    }
    return list;
  });

  if (!result) return fail("Watchlist not found.", 404);
  return ok({ watchlist: result });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const removed = store.write((db) => {
    const before = db.watchlists.length;
    db.watchlists = db.watchlists.filter((w) => !(w.id === id && w.userId === auth.user.id));
    return before !== db.watchlists.length;
  });
  if (!removed) return fail("Watchlist not found.", 404);
  return ok({ ok: true });
}

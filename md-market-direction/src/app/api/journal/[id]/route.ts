import { requireFeature } from "@/lib/auth/guard";
import { store } from "@/lib/db/store";
import { fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFeature();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const body = await req.json().catch(() => null);

  const updated = store.write((db) => {
    const entry = db.journal.find((j) => j.id === id && j.userId === auth.user.id);
    if (!entry) return null;
    if (typeof body?.notes === "string") entry.notes = body.notes.slice(0, 4000);
    if (typeof body?.strategy === "string") entry.strategy = body.strategy.slice(0, 80);
    if (typeof body?.screenshotUrl === "string") entry.screenshotUrl = body.screenshotUrl.slice(0, 500);

    if (Number.isFinite(Number(body?.exit))) {
      const exit = Number(body.exit);
      const sign = entry.direction === "long" ? 1 : -1;
      entry.resultPct = ((exit - entry.entry) / entry.entry) * 100 * sign;
      // R multiple only means something when a stop was recorded.
      if (entry.stop != null && entry.stop !== entry.entry) {
        entry.resultR = ((exit - entry.entry) * sign) / Math.abs(entry.entry - entry.stop);
      }
      entry.closedAt = Number(body?.closedAt) || Date.now();
      entry.outcome = entry.resultPct > 0.02 ? "win" : entry.resultPct < -0.02 ? "loss" : "breakeven";
    }
    return entry;
  });

  if (!updated) return fail("Journal entry not found.", 404);
  return ok({ entry: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFeature();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const removed = store.write((db) => {
    const before = db.journal.length;
    db.journal = db.journal.filter((j) => !(j.id === id && j.userId === auth.user.id));
    return before !== db.journal.length;
  });
  if (!removed) return fail("Journal entry not found.", 404);
  return ok({ ok: true });
}

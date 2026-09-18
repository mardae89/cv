import { requireUser } from "@/lib/auth/guard";
import { store } from "@/lib/db/store";
import { fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const updated = store.write((db) => {
    const alert = db.alerts.find((a) => a.id === id && a.userId === auth.user.id);
    if (!alert) return null;
    if (typeof body?.active === "boolean") alert.active = body.active;
    if (typeof body?.threshold === "number") alert.threshold = body.threshold;
    if (typeof body?.note === "string") alert.note = body.note;
    return alert;
  });
  if (!updated) return fail("Alert not found.", 404);
  return ok({ alert: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const removed = store.write((db) => {
    const before = db.alerts.length;
    db.alerts = db.alerts.filter((a) => !(a.id === id && a.userId === auth.user.id));
    return before !== db.alerts.length;
  });
  if (!removed) return fail("Alert not found.", 404);
  return ok({ ok: true });
}

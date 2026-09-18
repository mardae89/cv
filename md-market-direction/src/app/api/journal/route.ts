import { requireFeature } from "@/lib/auth/guard";
import { gate } from "@/lib/auth/session";
import { newId, store } from "@/lib/db/store";
import { journalAnalytics } from "@/lib/engine/journal";
import { resolveAsset } from "@/lib/data/universe";
import { fail, ok } from "@/lib/api";
import type { JournalEntry } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireFeature();
  if ("response" in auth) return auth.response;
  const entries = store.read().journal
    .filter((j) => j.userId === auth.user.id)
    .sort((a, b) => b.openedAt - a.openedAt);
  const canAnalyse = gate(auth.user, "journal.analytics").allowed;
  return ok({ entries, analytics: canAnalyse ? journalAnalytics(entries) : null, analyticsLocked: !canAnalyse });
}

export async function POST(req: Request) {
  const auth = await requireFeature();
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => null);
  const asset = resolveAsset(String(body?.symbol ?? ""));
  if (!asset) return fail("Unknown symbol.");
  const entry = Number(body?.entry);
  if (!Number.isFinite(entry)) return fail("A numeric entry price is required.");

  const record: JournalEntry = {
    id: newId("jrn"),
    userId: auth.user.id,
    symbol: asset.symbol,
    direction: body?.direction === "short" ? "short" : "long",
    entry,
    stop: Number.isFinite(Number(body?.stop)) ? Number(body.stop) : null,
    target: Number.isFinite(Number(body?.target)) ? Number(body.target) : null,
    size: Number.isFinite(Number(body?.size)) ? Number(body.size) : null,
    openedAt: Number(body?.openedAt) || Date.now(),
    closedAt: null,
    strategy: String(body?.strategy ?? "").slice(0, 80),
    timeframe: body?.timeframe ?? "1D",
    mdScoreAtEntry: Number.isFinite(Number(body?.mdScoreAtEntry)) ? Number(body.mdScoreAtEntry) : null,
    screenshotUrl: typeof body?.screenshotUrl === "string" ? body.screenshotUrl.slice(0, 500) : null,
    notes: String(body?.notes ?? "").slice(0, 4000),
    outcome: "open",
    resultR: null,
    resultPct: null,
  };
  store.write((db) => db.journal.push(record));
  return ok({ entry: record });
}

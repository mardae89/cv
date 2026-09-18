import { requireUser } from "@/lib/auth/guard";
import { gate, limitsFor } from "@/lib/auth/session";
import { newId, recordUsage, store } from "@/lib/db/store";
import { buildContext } from "@/lib/engine/context";
import { analyseAsset } from "@/lib/engine/analyze";
import { evaluateAlerts } from "@/lib/engine/alerts";
import { resolveAsset } from "@/lib/data/universe";
import { fail, ok, resolveMode } from "@/lib/api";
import type { Alert, AlertKind } from "@/lib/db/schema";
import type { AssetAnalysis } from "@/lib/types";

export const dynamic = "force-dynamic";

const KINDS: AlertKind[] = [
  "score-above", "score-below", "direction-becomes", "direction-change",
  "price-cross-ma50", "structure-change", "factors-aligned", "event-countdown",
];

/** Multi-condition alert kinds are an Elite feature. */
const ADVANCED: AlertKind[] = ["factors-aligned", "structure-change", "event-countdown"];

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { searchParams } = new URL(req.url);
  const mode = resolveMode(searchParams.get("mode"), auth.user);
  const alerts = store.read().alerts.filter((a) => a.userId === auth.user.id);

  if (searchParams.get("evaluate") === "true" && alerts.length) {
    const ctx = await buildContext();
    const map = new Map<string, AssetAnalysis>();
    for (const symbol of new Set(alerts.map((a) => a.symbol))) {
      const analysis = await analyseAsset(ctx, symbol, { mode });
      if (analysis) map.set(symbol.toUpperCase(), analysis);
    }
    const hits = evaluateAlerts(alerts, map, ctx.now);
    for (const hit of hits) recordUsage(auth.user.id, "alert-trigger", hit.alert.symbol);
    return ok({ alerts: store.read().alerts.filter((a) => a.userId === auth.user.id), triggered: hits });
  }

  return ok({ alerts, triggered: [] });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => null);
  const kind = body?.kind as AlertKind;
  if (!KINDS.includes(kind)) return fail("Unknown alert type.");

  if (ADVANCED.includes(kind) && !gate(auth.user, "alerts.advanced").allowed) {
    return fail("Multi-condition alerts require the Elite plan.", 402);
  }

  const asset = resolveAsset(String(body?.symbol ?? ""));
  if (!asset) return fail("Unknown symbol.");

  const limit = limitsFor(auth.user).alerts;
  const existing = store.read().alerts.filter((a) => a.userId === auth.user.id);
  if (existing.length >= limit) return fail(`Your plan includes ${limit} alerts. Upgrade for more.`, 402);

  const alert: Alert = {
    id: newId("alr"),
    userId: auth.user.id,
    symbol: asset.symbol,
    kind,
    threshold: Number(body?.threshold ?? 0),
    direction: body?.direction ?? null,
    note: String(body?.note ?? ""),
    active: true,
    createdAt: Date.now(),
    lastTriggeredAt: null,
    triggerCount: 0,
    lastState: null,
  };
  store.write((db) => db.alerts.push(alert));
  return ok({ alert });
}

import { requireAdmin } from "@/lib/auth/guard";
import { store } from "@/lib/db/store";
import { providerStatus, getFallbacks, isDemoMode } from "@/lib/providers/registry";
import { cacheStats } from "@/lib/engine/context";
import { llmConfigured } from "@/lib/ai/llm";
import { TIERS } from "@/lib/config/tiers";
import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const db = store.read();
  const now = Date.now();
  const day = 24 * 60 * 60_000;

  const byTier = { free: 0, pro: 0, elite: 0 } as Record<string, number>;
  for (const u of db.users) byTier[u.subscription.status === "active" ? u.subscription.tier : "free"] += 1;

  const mrr = db.users.reduce((sum, u) => {
    if (u.subscription.status !== "active") return sum;
    return sum + TIERS[u.subscription.tier].priceMonthly;
  }, 0);

  const views = db.usage.filter((u) => u.kind === "asset-view");
  const popular = Object.entries(
    views.reduce<Record<string, number>>((acc, v) => {
      acc[v.detail] = (acc[v.detail] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([symbol, count]) => ({ symbol, count }));

  return ok({
    users: {
      total: db.users.length,
      activeToday: db.users.filter((u) => now - u.lastSeenAt < day).length,
      activeWeek: db.users.filter((u) => now - u.lastSeenAt < 7 * day).length,
      newThisWeek: db.users.filter((u) => now - u.createdAt < 7 * day).length,
      list: db.users
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 25)
        .map((u) => ({
          id: u.id, email: u.email, name: u.name, role: u.role,
          tier: u.subscription.status === "active" ? u.subscription.tier : "free",
          status: u.subscription.status, createdAt: u.createdAt, lastSeenAt: u.lastSeenAt,
        })),
    },
    subscriptions: { byTier, mrr, arr: mrr * 12 },
    engagement: {
      scans: db.usage.filter((u) => u.kind === "scan" && now - u.at < day).length,
      aiMessages: db.usage.filter((u) => u.kind === "ai-message" && now - u.at < day).length,
      alertsTriggered: db.usage.filter((u) => u.kind === "alert-trigger" && now - u.at < day).length,
      popularAssets: popular,
      watchlists: db.watchlists.length,
      alerts: db.alerts.length,
      journalEntries: db.journal.length,
    },
    system: {
      demoMode: isDemoMode(),
      providers: providerStatus(),
      fallbacks: getFallbacks(),
      cache: cacheStats(),
      storage: store.storageLabel,
      aiConfigured: llmConfigured(),
      logs: db.logs.slice(0, 40),
    },
  });
}

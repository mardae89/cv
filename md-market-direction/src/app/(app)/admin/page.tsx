"use client";

import { useApi } from "@/lib/hooks";
import type { ProviderHealth } from "@/lib/providers/types";
import { Eyebrow, Panel, SectionHeading, Skeleton, StatusDot, ErrorState } from "@/components/primitives";
import { timeAgo } from "@/lib/utils/format";

interface AdminData {
  users: {
    total: number; activeToday: number; activeWeek: number; newThisWeek: number;
    list: { id: string; email: string; name: string; role: string; tier: string; status: string; createdAt: number; lastSeenAt: number }[];
  };
  subscriptions: { byTier: Record<string, number>; mrr: number; arr: number };
  engagement: {
    scans: number; aiMessages: number; alertsTriggered: number;
    popularAssets: { symbol: string; count: number }[];
    watchlists: number; alerts: number; journalEntries: number;
  };
  system: {
    demoMode: boolean; providers: ProviderHealth[]; fallbacks: { id: string; at: number; reason: string }[];
    cache: Record<string, number>; storage: string; aiConfigured: boolean;
    logs: { id: string; at: number; level: string; scope: string; message: string }[];
  };
}

export default function AdminPage() {
  const { data, loading, error, refresh } = useApi<AdminData>("/api/admin/overview");

  if (error) return <ErrorState message={error} onRetry={refresh} />;
  if (loading && !data) return <Skeleton className="h-96" />;
  if (!data) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionHeading title="Admin" subtitle="Instance health, usage and revenue." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total users" value={String(data.users.total)} />
        <Stat label="Active today" value={String(data.users.activeToday)} />
        <Stat label="Active this week" value={String(data.users.activeWeek)} />
        <Stat label="New this week" value={String(data.users.newThisWeek)} />
        <Stat label="MRR" value={`$${data.subscriptions.mrr.toFixed(2)}`} gold />
        <Stat label="ARR (run rate)" value={`$${data.subscriptions.arr.toFixed(2)}`} gold />
        <Stat label="Scans (24h)" value={String(data.engagement.scans)} />
        <Stat label="AI messages (24h)" value={String(data.engagement.aiMessages)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <div className="border-b border-hairline-soft px-4 py-3"><Eyebrow>Subscriptions by tier</Eyebrow></div>
          {Object.entries(data.subscriptions.byTier).map(([tier, count]) => (
            <div key={tier} className="flex items-center justify-between border-b border-hairline-soft px-4 py-2.5 last:border-b-0">
              <span className="text-sm uppercase">{tier}</span>
              <span className="ticker text-sm">{count}</span>
            </div>
          ))}
        </Panel>

        <Panel>
          <div className="border-b border-hairline-soft px-4 py-3"><Eyebrow>Most viewed markets</Eyebrow></div>
          {data.engagement.popularAssets.length === 0 ? (
            <p className="px-4 py-5 text-sm text-mute">No views recorded yet.</p>
          ) : (
            data.engagement.popularAssets.map((a) => (
              <div key={a.symbol} className="flex items-center justify-between border-b border-hairline-soft px-4 py-2 last:border-b-0">
                <span className="display text-sm">{a.symbol}</span>
                <span className="ticker text-sm text-mute">{a.count}</span>
              </div>
            ))
          )}
        </Panel>

        <Panel>
          <div className="border-b border-hairline-soft px-4 py-3"><Eyebrow>API health & data freshness</Eyebrow></div>
          {data.system.providers.map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-3 border-b border-hairline-soft px-4 py-3 last:border-b-0">
              <div>
                <div className="flex items-center gap-2">
                  <StatusDot state={p.ok ? (p.live ? "good" : "warn") : "bad"} />
                  <span className="text-sm">{p.label}</span>
                </div>
                <p className="mt-0.5 text-xs text-mute">{p.message}</p>
              </div>
              <div className="shrink-0 text-right text-[10px] uppercase tracking-widest text-faint">
                <div>{p.live ? "Live" : "Demo"}</div>
                <div>{p.lastSuccessAt ? timeAgo(p.lastSuccessAt) : "—"}</div>
                <div>{p.latencyMs != null ? `${p.latencyMs}ms` : ""}</div>
              </div>
            </div>
          ))}
          <div className="px-4 py-3 text-xs text-faint">
            Cache entries — {Object.entries(data.system.cache).map(([k, v]) => `${k}: ${v}`).join(" · ")}
          </div>
        </Panel>

        <Panel>
          <div className="border-b border-hairline-soft px-4 py-3"><Eyebrow>System</Eyebrow></div>
          <dl className="grid grid-cols-2 gap-1 px-4 py-3 text-xs">
            <dt className="text-faint">Data mode</dt><dd className="text-right">{data.system.demoMode ? "Demo" : "Live"}</dd>
            <dt className="text-faint">AI provider</dt><dd className="text-right">{data.system.aiConfigured ? "Configured" : "Not configured"}</dd>
            <dt className="text-faint">Storage</dt><dd className="text-right">{data.system.storage}</dd>
            <dt className="text-faint">Watchlists</dt><dd className="text-right">{data.engagement.watchlists}</dd>
            <dt className="text-faint">Alerts</dt><dd className="text-right">{data.engagement.alerts}</dd>
            <dt className="text-faint">Journal entries</dt><dd className="text-right">{data.engagement.journalEntries}</dd>
          </dl>
          {data.system.fallbacks.length ? (
            <div className="border-t border-hairline-soft px-4 py-3">
              <Eyebrow className="mb-1 text-bear">Provider fallbacks</Eyebrow>
              {data.system.fallbacks.map((f) => (
                <p key={f.id} className="text-xs text-mute">{f.id}: {f.reason} ({timeAgo(f.at)})</p>
              ))}
            </div>
          ) : null}
        </Panel>
      </div>

      <Panel className="overflow-x-auto">
        <div className="border-b border-hairline-soft px-4 py-3"><Eyebrow>Users</Eyebrow></div>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-hairline text-left">
              {["Email", "Name", "Role", "Tier", "Status", "Joined", "Last seen"].map((h) => (
                <th key={h} className="px-3 py-2 text-[10px] uppercase tracking-widest text-faint">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.users.list.map((u) => (
              <tr key={u.id} className="border-b border-hairline-soft last:border-b-0">
                <td className="px-3 py-2 text-xs">{u.email}</td>
                <td className="px-3 py-2 text-xs text-mute">{u.name}</td>
                <td className="px-3 py-2 text-xs uppercase text-mute">{u.role}</td>
                <td className="px-3 py-2 text-xs uppercase text-gold">{u.tier}</td>
                <td className="px-3 py-2 text-xs text-mute">{u.status}</td>
                <td className="px-3 py-2 text-xs text-faint">{new Date(u.createdAt).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2 text-xs text-faint">{timeAgo(u.lastSeenAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel>
        <div className="border-b border-hairline-soft px-4 py-3"><Eyebrow>System log</Eyebrow></div>
        {data.system.logs.length === 0 ? (
          <p className="px-4 py-5 text-sm text-mute">No log entries.</p>
        ) : (
          data.system.logs.map((l) => (
            <div key={l.id} className="flex items-start gap-3 border-b border-hairline-soft px-4 py-2 text-xs last:border-b-0">
              <StatusDot state={l.level === "error" ? "bad" : l.level === "warn" ? "warn" : "idle"} />
              <span className="text-faint">{timeAgo(l.at)}</span>
              <span className="uppercase text-mute">{l.scope}</span>
              <span className="flex-1">{l.message}</span>
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}

function Stat({ label, value, gold = false }: { label: string; value: string; gold?: boolean }) {
  return (
    <Panel className="p-4">
      <div className="text-[10px] uppercase tracking-widest text-faint">{label}</div>
      <div className={`ticker display mt-1 text-2xl font-bold ${gold ? "text-gold" : ""}`}>{value}</div>
    </Panel>
  );
}

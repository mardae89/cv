"use client";

import { useEffect, useState } from "react";
import { guest } from "@/lib/guestStore";
import { journalAnalytics } from "@/lib/engine/journal";
import type { JournalEntry } from "@/lib/db/schema";
import {
  EmptyState, Eyebrow, GhostButton, GoldButton, Panel, SectionHeading, Skeleton,
} from "@/components/primitives";
import { fmtPct, fmtPrice } from "@/lib/utils/format";
import Link from "next/link";

interface Bucket { key: string; trades: number; wins: number; winRate: number; avgReturnPct: number; totalReturnPct: number; avgR: number | null }
interface Analytics {
  overall: Bucket; byAsset: Bucket[]; byScore: Bucket[]; byStrategy: Bucket[];
  byTimeframe: Bucket[]; byDirection: Bucket[]; openCount: number; closedCount: number;
}

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const reload = () => setEntries(guest.journal());
  useEffect(() => { setEntries(guest.journal()); }, []);
  const analytics: Analytics | null = entries ? (journalAnalytics(entries) as Analytics) : null;

  const [form, setForm] = useState({
    symbol: "XAU/USD", direction: "long", entry: "", stop: "", target: "",
    strategy: "MD Momentum", timeframe: "4H", mdScoreAtEntry: "", notes: "", screenshotUrl: "",
  });
  const [exitValues, setExitValues] = useState<Record<string, string>>({});
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  async function add() {
    setStatusMsg(null);
    try {
      guest.createJournalEntry({
        symbol: form.symbol,
        direction: form.direction === "short" ? "short" : "long",
        entry: Number(form.entry),
        stop: form.stop ? Number(form.stop) : null,
        target: form.target ? Number(form.target) : null,
        size: null,
        openedAt: Date.now(),
        strategy: form.strategy,
        timeframe: form.timeframe as JournalEntry["timeframe"],
        mdScoreAtEntry: form.mdScoreAtEntry ? Number(form.mdScoreAtEntry) : null,
        screenshotUrl: form.screenshotUrl || null,
        notes: form.notes,
      });
      setForm({ ...form, entry: "", stop: "", target: "", notes: "", mdScoreAtEntry: "" });
      reload();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  async function close(id: string) {
    const exit = Number(exitValues[id]);
    if (!Number.isFinite(exit)) return;
    guest.closeJournalEntry(id, exit);
    setExitValues({ ...exitValues, [id]: "" });
    reload();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionHeading title="Trading Journal" subtitle="Log what you actually did, then see where your edge really is." />

      <Panel className="p-5">
        <Eyebrow className="mb-3">Log a trade</Eyebrow>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Input label="Market" value={form.symbol} onChange={(v) => setForm({ ...form, symbol: v.toUpperCase() })} />
          <Select label="Direction" value={form.direction} onChange={(v) => setForm({ ...form, direction: v })} options={["long", "short"]} />
          <Input label="Entry" value={form.entry} onChange={(v) => setForm({ ...form, entry: v })} type="number" />
          <Input label="Stop" value={form.stop} onChange={(v) => setForm({ ...form, stop: v })} type="number" />
          <Input label="Target" value={form.target} onChange={(v) => setForm({ ...form, target: v })} type="number" />
          <Input label="Strategy" value={form.strategy} onChange={(v) => setForm({ ...form, strategy: v })} />
          <Select label="Timeframe" value={form.timeframe} onChange={(v) => setForm({ ...form, timeframe: v })} options={["5M", "15M", "1H", "4H", "1D", "1W"]} />
          <Input label="MD Score at entry" value={form.mdScoreAtEntry} onChange={(v) => setForm({ ...form, mdScoreAtEntry: v })} type="number" />
          <Input label="Screenshot URL" value={form.screenshotUrl} onChange={(v) => setForm({ ...form, screenshotUrl: v })} />
          <Input label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <GoldButton onClick={add} disabled={!form.entry}>Log trade</GoldButton>
          {statusMsg ? <span className="text-xs text-bear">{statusMsg}</span> : null}
        </div>
      </Panel>

      {entries === null ? (
        <Skeleton className="h-64" />
      ) : !entries.length ? (
        <EmptyState title="No trades logged" message="Log your first trade above. Analytics appear once you close trades." />
      ) : (
        <>
          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-hairline text-left">
                  {["Market", "Dir", "Entry", "Stop", "Target", "TF", "Score", "Strategy", "Result", "R", "Status", ""].map((h) => (
                    <th key={h} className="px-3 py-2 text-[10px] uppercase tracking-widest text-faint">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-hairline-soft last:border-b-0">
                    <td className="px-3 py-2">
                      <Link href={`/markets/${encodeURIComponent(e.symbol)}`} className="display text-xs font-semibold hover:text-gold">
                        {e.symbol}
                      </Link>
                    </td>
                    <td className={`px-3 py-2 text-xs uppercase ${e.direction === "long" ? "text-bull" : "text-bear"}`}>{e.direction}</td>
                    <td className="ticker px-3 py-2 text-xs">{fmtPrice(e.entry, 2)}</td>
                    <td className="ticker px-3 py-2 text-xs text-mute">{fmtPrice(e.stop, 2)}</td>
                    <td className="ticker px-3 py-2 text-xs text-mute">{fmtPrice(e.target, 2)}</td>
                    <td className="px-3 py-2 text-xs">{e.timeframe}</td>
                    <td className="ticker px-3 py-2 text-xs">{e.mdScoreAtEntry ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-mute">{e.strategy || "—"}</td>
                    <td className={`ticker px-3 py-2 text-xs ${(e.resultPct ?? 0) >= 0 ? "text-bull" : "text-bear"}`}>
                      {e.resultPct != null ? fmtPct(e.resultPct) : "—"}
                    </td>
                    <td className="ticker px-3 py-2 text-xs">{e.resultR != null ? `${e.resultR.toFixed(2)}R` : "—"}</td>
                    <td className="px-3 py-2 text-xs uppercase text-mute">{e.outcome}</td>
                    <td className="px-3 py-2">
                      {e.outcome === "open" ? (
                        <div className="flex items-center gap-1">
                          <input
                            value={exitValues[e.id] ?? ""}
                            onChange={(ev) => setExitValues({ ...exitValues, [e.id]: ev.target.value })}
                            placeholder="Exit"
                            className="w-20 px-2 py-1 text-xs"
                          />
                          <GhostButton onClick={() => close(e.id)}>Close</GhostButton>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {analytics ? <Analytics analytics={analytics} /> : null}
        </>
      )}
    </div>
  );
}

function Analytics({ analytics }: { analytics: Analytics }) {
  const groups: [string, Bucket[]][] = [
    ["By MD Score at entry", analytics.byScore],
    ["By market", analytics.byAsset],
    ["By strategy", analytics.byStrategy],
    ["By timeframe", analytics.byTimeframe],
    ["By direction", analytics.byDirection],
  ];
  return (
    <div className="space-y-5">
      <Panel className="p-5">
        <Eyebrow className="mb-3">Overall</Eyebrow>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Closed trades" value={String(analytics.overall.trades)} />
          <Metric label="Win rate" value={`${analytics.overall.winRate.toFixed(1)}%`} />
          <Metric label="Average return" value={fmtPct(analytics.overall.avgReturnPct)} />
          <Metric label="Average R" value={analytics.overall.avgR != null ? `${analytics.overall.avgR.toFixed(2)}R` : "—"} />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map(([title, buckets]) => (
          <Panel key={title}>
            <div className="border-b border-hairline-soft px-4 py-3"><Eyebrow>{title}</Eyebrow></div>
            {buckets.length === 0 ? (
              <p className="px-4 py-5 text-sm text-mute">Not enough closed trades yet.</p>
            ) : (
              buckets.map((b) => (
                <div key={b.key} className="flex items-center justify-between gap-3 border-b border-hairline-soft px-4 py-2.5 last:border-b-0">
                  <span className="text-sm">{b.key}</span>
                  <span className="flex items-center gap-4 text-xs">
                    <span className="text-faint">{b.trades} trades</span>
                    <span className={b.winRate >= 50 ? "text-bull" : "text-bear"}>{b.winRate.toFixed(0)}% win</span>
                    <span className={`ticker w-16 text-right ${b.avgReturnPct >= 0 ? "text-bull" : "text-bear"}`}>{fmtPct(b.avgReturnPct)}</span>
                  </span>
                </div>
              ))
            )}
          </Panel>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-faint">{label}</div>
      <div className="ticker display mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <Eyebrow className="mb-1">{label}</Eyebrow>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 text-sm" />
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <Eyebrow className="mb-1">{label}</Eyebrow>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 text-sm capitalize">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

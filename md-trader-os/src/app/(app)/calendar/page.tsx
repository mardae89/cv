"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import type { EconomicEvent } from "@/lib/types";
import { ErrorState, ImpactTag, Panel, SectionHeading, Skeleton, EmptyState } from "@/components/primitives";
import { fmtDate, untilLabel } from "@/lib/utils/format";

type EventWithAssets = EconomicEvent & { affected: string[] };

export default function CalendarPage() {
  const [importance, setImportance] = useState("any");
  const [currency, setCurrency] = useState("any");
  const [days, setDays] = useState("14");

  const { data, loading, error, refresh } = useApi<{ events: EventWithAssets[]; currencies: string[] }>(
    `/api/economic-calendar?importance=${importance}&currency=${currency}&days=${days}`,
  );

  const grouped = useMemo(() => {
    const map = new Map<string, EventWithAssets[]>();
    for (const e of data?.events ?? []) {
      const key = new Date(e.time).toISOString().slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return Array.from(map.entries());
  }, [data]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <SectionHeading title="Economic Calendar" subtitle="The releases that create event risk, and which markets each one touches." />

      <div className="flex flex-wrap gap-2">
        <select value={importance} onChange={(e) => setImportance(e.target.value)} className="px-3 py-2 text-xs">
          <option value="any">All impact levels</option>
          <option value="high">High impact</option>
          <option value="medium">Medium impact</option>
          <option value="low">Low impact</option>
        </select>
        <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="px-3 py-2 text-xs">
          <option value="any">All currencies</option>
          {data?.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={days} onChange={(e) => setDays(e.target.value)} className="px-3 py-2 text-xs">
          <option value="7">Next 7 days</option>
          <option value="14">Next 14 days</option>
          <option value="30">Next 30 days</option>
        </select>
      </div>

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      {loading && !data ? (
        <Skeleton className="h-96" />
      ) : grouped.length === 0 ? (
        <EmptyState title="No events" message="No releases match these filters in the selected window." />
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, events]) => (
            <div key={day}>
              <div className="mb-2 flex items-center gap-3">
                <span className="display text-sm font-bold uppercase tracking-widest">{fmtDate(events[0].time)}</span>
                <span className="h-px flex-1 bg-hairline" />
              </div>
              <Panel className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left">
                      {["Time (UTC)", "Event", "Country", "Impact", "Actual", "Forecast", "Previous", "Affected markets"].map((h) => (
                        <th key={h} className="px-3 py-2 text-[10px] uppercase tracking-widest text-faint">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => {
                      const past = e.time <= Date.now();
                      return (
                        <tr key={e.id} className={`border-b border-hairline-soft last:border-b-0 ${past ? "opacity-60" : ""}`}>
                          <td className="ticker whitespace-nowrap px-3 py-2.5 text-xs">
                            {new Date(e.time).toISOString().slice(11, 16)}
                            <div className="text-[10px] text-faint">{past ? "released" : untilLabel(e.time)}</div>
                          </td>
                          <td className="px-3 py-2.5 text-xs font-medium">{e.name}</td>
                          <td className="px-3 py-2.5 text-xs text-mute">{e.country}</td>
                          <td className="px-3 py-2.5"><ImpactTag impact={e.importance} /></td>
                          <td className="ticker px-3 py-2.5 text-xs text-bone">{e.actual ?? "—"}</td>
                          <td className="ticker px-3 py-2.5 text-xs text-mute">{e.forecast ?? "—"}</td>
                          <td className="ticker px-3 py-2.5 text-xs text-faint">{e.previous ?? "—"}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {e.affected.slice(0, 5).map((s) => (
                                <Link
                                  key={s}
                                  href={`/markets/${encodeURIComponent(s)}`}
                                  className="border border-hairline px-1.5 py-0.5 text-[10px] text-mute hover:border-gold hover:text-gold"
                                >
                                  {s}
                                </Link>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Panel>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

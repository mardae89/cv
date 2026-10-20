"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/hooks";
import { useTradingMode, useTrendScope } from "@/lib/useTrendScope";
import { symbolMatches } from "@/lib/symbols";
import type { ScannerRow } from "@/lib/types";
import { MarketCard } from "@/components/market-card";
import { EmptyState, ErrorState, Eyebrow, SectionHeading, Skeleton, TrendScopeSwitch } from "@/components/primitives";
import Link from "next/link";
import { getAsset } from "@/lib/data/universe";

interface ScannerResponse {
  rows: ScannerRow[];
  total: number;
  lockedCount: number;
  tier: string;
  demo: boolean;
}

const GROUP_ORDER = [
  "All",
  "Forex Majors",
  "Forex Minors",
  "Index Futures",
  "Metals",
  "Energy",
  "Macro Reference",
];

export default function MarketsPage() {
  const [group, setGroup] = useState("All");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useTrendScope();
  const [mode] = useTradingMode();
  const { data, loading, error, refresh } = useApi<ScannerResponse>(`/api/scanner?scope=${scope}&mode=${mode}`, [scope, mode]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.rows.filter(
      (r) =>
        (group === "All" || r.group === group) &&
        // Separator-insensitive, and aliases count: "eurusd" finds EUR/USD, "nq" finds NAS100.
        symbolMatches(query, r.symbol, r.name, ...(getAsset(r.symbol)?.aliases ?? [])),
    );
  }, [data, group, query]);

  const groups = useMemo(() => {
    const present = new Set(data?.rows.map((r) => r.group) ?? []);
    return GROUP_ORDER.filter((g) => g === "All" || present.has(g));
  }, [data]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <SectionHeading
        title="Forex & Futures"
        subtitle="All 28 forex pairs, the index futures, metals and energy — scored on the same evidence."
      />

      <TrendScopeSwitch scope={scope} onChange={setScope} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search — e.g. gbpjpy, gold, NQ, US30"
          className="w-full px-3 py-2.5 text-sm sm:max-w-sm"
        />
        {query.trim().length >= 1 && rows.length === 0 && getAsset(query.trim()) ? (
          <Link
            href={`/markets/${encodeURIComponent(getAsset(query.trim())!.symbol)}`}
            className="border border-gold/40 px-3 py-2.5 text-xs uppercase tracking-widest text-gold hover:bg-gold/10"
          >
            Open {getAsset(query.trim())!.symbol} →
          </Link>
        ) : null}
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1 whitespace-nowrap">
          {groups.map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={`px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-widest transition ${
                g === group ? "bg-gold text-void" : "border border-hairline text-mute hover:border-gold hover:text-gold"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      {data && data.lockedCount > 0 ? (
        <div className="border border-gold/30 bg-gold/5 px-4 py-3 text-xs text-gold">
          {data.lockedCount} more markets are available on Pro.{" "}
          <Link href="/subscription" className="underline">See plans</Link>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-56" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No markets match"
          message="This app covers forex and futures only. Try a pair like EURUSD, or a contract like NQ or GC."
        />
      ) : (
        <>
          <Eyebrow>{rows.length} markets</Eyebrow>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((r) => (
              <MarketCard key={r.symbol} row={r} precision={getAsset(r.symbol)?.precision ?? 2} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

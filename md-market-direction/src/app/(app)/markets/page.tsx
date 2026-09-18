"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/hooks";
import { symbolMatches } from "@/lib/symbols";
import type { ScannerRow } from "@/lib/types";
import { MarketCard } from "@/components/market-card";
import { EmptyState, ErrorState, Eyebrow, SectionHeading, Skeleton } from "@/components/primitives";
import Link from "next/link";

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
  "Forex Crosses",
  "Metals",
  "US Indices",
  "International Indices",
  "Crypto",
  "Stocks",
  "ETFs",
  "Commodities",
  "Bonds & Rates",
  "Macro Reference",
];

export default function MarketsPage() {
  const [group, setGroup] = useState("All");
  const [query, setQuery] = useState("");
  const { data, loading, error, refresh } = useApi<ScannerResponse>("/api/scanner");

  const rows = useMemo(() => {
    if (!data) return [];
    return data.rows.filter(
      (r) =>
        (group === "All" || r.group === group) &&
        // Separator-insensitive: "eurusd" finds EUR/USD, no slash required.
        symbolMatches(query, r.symbol, r.name),
    );
  }, [data, group, query]);

  const groups = useMemo(() => {
    const present = new Set(data?.rows.map((r) => r.group) ?? []);
    return GROUP_ORDER.filter((g) => g === "All" || present.has(g));
  }, [data]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <SectionHeading
        title="Markets"
        subtitle="Every market, scored on the same evidence. Search any ticker to analyse it."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search symbol or name — e.g. XAU, NVDA, gbpjpy"
          className="w-full px-3 py-2.5 text-sm sm:max-w-sm"
        />
        {query.trim().length >= 1 && rows.length === 0 ? (
          <Link
            href={`/markets/${encodeURIComponent(query.trim().toUpperCase())}`}
            className="border border-gold/40 px-3 py-2.5 text-xs uppercase tracking-widest text-gold hover:bg-gold/10"
          >
            Analyse “{query.trim().toUpperCase()}” →
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
          message="Try a different group, or search a ticker directly to analyse it."
        />
      ) : (
        <>
          <Eyebrow>{rows.length} markets</Eyebrow>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((r) => (
              <MarketCard key={r.symbol} row={r} precision={r.symbol.includes("/") && r.price < 10 ? 5 : 2} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

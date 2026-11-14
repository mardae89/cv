"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/hooks";
import { useTradingMode, useTrendScope } from "@/lib/useTrendScope";
import { symbolMatches } from "@/lib/symbols";
import type { ScannerRow } from "@/lib/types";
import { MiniGauge, PushArrow, scoreToDial } from "@/components/gauge";
import { bandFor } from "@/lib/config/scoring";
import { EmptyState, ErrorState, Eyebrow, Panel, SectionHeading, Skeleton, TrendScopeSwitch } from "@/components/primitives";
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
  const [scope, setScope] = useTrendScope();
  const [mode] = useTradingMode();
  const { data, loading, error, refresh } = useApi<ScannerResponse>(`/api/scanner?scope=${scope}&mode=${mode}`, [scope, mode]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.rows.filter(
      (r) =>
        (group === "All" || r.group === group) &&
        // Separator-insensitive: "eurusd" finds EUR/USD, no slash required.
        symbolMatches(query, r.symbol, r.name),
    ).sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50));
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

      <TrendScopeSwitch scope={scope} onChange={setScope} />

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
        <Skeleton className="h-96" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No markets match"
          message="Try a different group, or search a ticker directly to analyse it."
        />
      ) : (
        <>
          <Eyebrow>{rows.length} markets · strongest alignment first</Eyebrow>
          <Panel>
            {rows.map((r) => (
              <MarketListRow key={r.symbol} row={r} />
            ))}
          </Panel>
        </>
      )}
    </div>
  );
}

const TAG: Record<string, string> = {
  bullish: "border-bull/50 text-bull bg-bull/10",
  bearish: "border-bear/50 text-bear bg-bear/10",
  mixed: "border-gold/50 text-gold bg-gold/10",
  neutral: "border-gold/50 text-gold bg-gold/10",
};

/** One market, laid out like the MD Trader OS momentum board. */
function MarketListRow({ row }: { row: ScannerRow }) {
  const dial = scoreToDial(row.score);
  const band = bandFor(row.score);
  const tone = dial >= 20 ? "text-bull" : dial <= -20 ? "text-bear" : "text-gold";
  const sub = [
    row.direction === "mixed" ? "Timeframes disagree" : band.label,
    row.structure !== "neutral" ? `structure ${row.structure}` : null,
    row.ma50 ? `${row.ma50} 50 EMA` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link
      href={`/markets/${encodeURIComponent(row.symbol)}`}
      className="grid grid-cols-[68px_minmax(0,1fr)_auto] items-center gap-3 border-b border-hairline-soft px-3 py-3 transition last:border-b-0 hover:bg-panel-2 sm:px-4"
    >
      <MiniGauge value={dial} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="display truncate text-base font-bold">{row.symbol}</span>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 border px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-widest ${TAG[row.direction] ?? TAG.neutral}`}
          >
            {row.direction === "bullish" || row.direction === "bearish" ? (
              <span className={`inline-block h-1.5 w-1.5 ${row.direction === "bullish" ? "bg-bull" : "bg-bear"}`} />
            ) : null}
            {row.direction}
          </span>
        </div>
        <div className="truncate text-[10px] uppercase tracking-widest text-faint">{sub}</div>
      </div>
      <div className="flex items-center gap-2">
        <PushArrow value={dial} className="h-5 w-5" />
        <div className="text-right">
          <div className={`ticker display text-xl font-extrabold leading-none ${tone}`}>{row.score}</div>
          <div className="mt-0.5 hidden text-[9px] uppercase tracking-widest text-faint sm:block">MD score</div>
        </div>
      </div>
    </Link>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { useTradingMode, useTrendScope } from "@/lib/useTrendScope";
import { symbolMatches } from "@/lib/symbols";
import type { ScannerRow } from "@/lib/types";
import { MarketCard } from "@/components/market-card";
import { GroupSection, useCollapsedGroups } from "@/components/market-tiles";
import { EmptyState, ErrorState, SectionHeading, Skeleton, TrendScopeSwitch } from "@/components/primitives";
import { ASSETS, getAsset } from "@/lib/data/universe";

interface ScannerResponse {
  rows: ScannerRow[];
  total: number;
  lockedCount: number;
  tier: string;
  demo: boolean;
}

const GROUP_ORDER = ["Forex Majors", "Forex Minors", "Index Futures", "Metals", "Energy", "Macro Reference"];

/** The reference markets are inputs, not trades — folded away until asked for. */
const DEFAULT_COLLAPSED = ["Macro Reference"];

/** Universe order: EUR/USD, GBP/USD … the order a forex trader expects. */
const POSITION = new Map(ASSETS.map((a, i) => [a.symbol, i]));

type View = "tiles" | "cards";
type Sort = "default" | "strength";
const VIEW_KEY = "mdos.markets.view";

export default function MarketsPage() {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useTrendScope();
  const [mode] = useTradingMode();
  const [collapsed, toggle] = useCollapsedGroups(DEFAULT_COLLAPSED);
  const [view, setView] = useState<View>("tiles");
  const [sort, setSort] = useState<Sort>("default");
  const { data, loading, error, refresh } = useApi<ScannerResponse>(`/api/scanner?scope=${scope}&mode=${mode}`, [scope, mode]);

  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "cards") setView("cards");
    } catch {
      /* default view */
    }
  }, []);
  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* not remembering is fine */
    }
  };

  const searching = query.trim().length > 0;

  const groups = useMemo(() => {
    const rows = (data?.rows ?? []).filter((r) =>
      // Separator-insensitive, and aliases count: "eurusd" finds EUR/USD, "nq" finds NAS100.
      symbolMatches(query, r.symbol, r.name, ...(getAsset(r.symbol)?.aliases ?? [])),
    );
    const ordered = rows.slice().sort((a, b) =>
      sort === "strength"
        ? Math.abs(b.score - 50) - Math.abs(a.score - 50)
        : (POSITION.get(a.symbol) ?? 999) - (POSITION.get(b.symbol) ?? 999),
    );
    return GROUP_ORDER.map((g) => ({ group: g, rows: ordered.filter((r) => r.group === g) })).filter((g) => g.rows.length);
  }, [data, query, sort]);

  const total = groups.reduce((s, g) => s + g.rows.length, 0);
  const allOpen = groups.every((g) => !collapsed.includes(g.group));
  const known = searching ? getAsset(query.trim()) : undefined;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <SectionHeading
        title="Forex & Futures"
        subtitle="All 28 forex pairs, the index futures, metals and energy — scored on the same evidence. Tap a group to fold it."
      />

      <TrendScopeSwitch scope={scope} onChange={setScope} />

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search — e.g. gbpjpy, gold, NQ, US30"
          className="w-full px-3 py-2.5 text-sm sm:w-80"
        />
        <div className="flex border border-hairline">
          {(["tiles", "cards"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => changeView(v)}
              className={`px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-widest ${view === v ? "bg-gold text-void" : "text-mute hover:text-gold"}`}
            >
              {v === "tiles" ? "Compact" : "Detailed"}
            </button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-auto px-3 py-2 text-xs">
          <option value="default">Standard order</option>
          <option value="strength">Strongest first</option>
        </select>
        {!searching && groups.length ? (
          <button
            onClick={() => groups.forEach((g) => (allOpen ? !collapsed.includes(g.group) : collapsed.includes(g.group)) && toggle(g.group))}
            className="ml-auto text-[10px] uppercase tracking-widest text-gold hover:underline"
          >
            {allOpen ? "Fold all" : "Open all"}
          </button>
        ) : null}
      </div>

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      {data && data.lockedCount > 0 ? (
        <div className="border border-gold/30 bg-gold/5 px-4 py-3 text-xs text-gold">
          {data.lockedCount} more markets are available on Pro.{" "}
          <Link href="/subscription" className="underline">See plans</Link>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : total === 0 ? (
        <EmptyState
          title="No markets match"
          message="This app covers forex and futures only. Try a pair like EURUSD, or a contract like NQ or GC."
          action={known ? <Link href={`/markets/${encodeURIComponent(known.symbol)}`} className="text-xs uppercase tracking-widest text-gold hover:underline">Open {known.symbol} →</Link> : undefined}
        />
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <GroupSection
              key={g.group}
              title={g.group}
              rows={g.rows}
              // A search shows every match; folding only applies to browsing.
              collapsed={!searching && collapsed.includes(g.group)}
              onToggle={() => toggle(g.group)}
            >
              {view === "cards" ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {g.rows.map((r) => <MarketCard key={r.symbol} row={r} precision={getAsset(r.symbol)?.precision ?? 2} />)}
                </div>
              ) : undefined}
            </GroupSection>
          ))}
        </div>
      )}
    </div>
  );
}

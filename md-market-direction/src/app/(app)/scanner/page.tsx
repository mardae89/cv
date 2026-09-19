"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { useTradingMode, useTrendScope } from "@/lib/useTrendScope";
import type { ScannerRow } from "@/lib/types";
import { ScoreMeter } from "@/components/score";
import { DirectionBadge, EmptyState, ErrorState, Eyebrow, GhostButton, Panel, SectionHeading, Skeleton, TrendScopeSwitch } from "@/components/primitives";
import { fmtPct, fmtPrice, timeAgo } from "@/lib/utils/format";

interface ScannerResponse {
  rows: ScannerRow[];
  total: number;
  lockedCount: number;
  tier: string;
  demo: boolean;
  generatedAt: number;
}

const FILTERS = {
  direction: ["any", "bullish", "bearish", "neutral", "mixed"],
  minScore: ["0", "50", "60", "70", "80", "90"],
  class: ["any", "forex", "stock", "crypto", "index", "commodity", "metal", "etf", "bond"],
  ma50: ["any", "above", "below"],
  structure: ["any", "bullish", "bearish", "neutral"],
  momentum: ["any", "strong", "moderate", "weak"],
  news: ["any", "bullish", "bearish", "neutral"],
  eventRisk: ["any", "none", "low", "medium", "high"],
};

export default function ScannerPage() {
  const [scope, setScope] = useTrendScope();
  const [mode] = useTradingMode();
  const [state, setState] = useState<Record<string, string>>({
    direction: "any", minScore: "0", class: "any", ma50: "any",
    structure: "any", momentum: "any", news: "any", eventRisk: "any", q: "",
  });
  const [sort, setSort] = useState<"strength" | "score" | "change">("strength");

  const query = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(state).forEach(([k, v]) => {
      if (v && v !== "any" && v !== "0" && v !== "") p.set(k, v);
    });
    p.set("scope", scope);
    p.set("mode", mode);
    return `/api/scanner?${p.toString()}`;
  }, [state, scope, mode]);

  const { data, loading, error, refresh } = useApi<ScannerResponse>(query);

  const rows = useMemo(() => {
    const list = [...(data?.rows ?? [])];
    if (sort === "score") list.sort((a, b) => b.score - a.score);
    else if (sort === "change") list.sort((a, b) => b.changePct - a.changePct);
    return list;
  }, [data, sort]);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <SectionHeading
        title="Market Scanner"
        subtitle="Rank every market by evidence alignment, then narrow it down with the filters that matter to you."
        action={<GhostButton onClick={refresh}>Rescan</GhostButton>}
      />

      <TrendScopeSwitch scope={scope} onChange={setScope} />

      <Panel className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search">
            <input
              value={state.q}
              onChange={(e) => setState({ ...state, q: e.target.value })}
              placeholder="Symbol or name"
              className="w-full px-3 py-2 text-sm"
            />
          </Field>
          {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((key) => (
            <Field key={key} label={labelFor(key)}>
              <select
                value={state[key]}
                onChange={(e) => setState({ ...state, [key]: e.target.value })}
                className="w-full px-3 py-2 text-sm capitalize"
              >
                {FILTERS[key].map((opt) => (
                  <option key={opt} value={opt}>
                    {key === "minScore" ? (opt === "0" ? "Any" : `${opt}+`) : opt}
                  </option>
                ))}
              </select>
            </Field>
          ))}
          <Field label="Sort by">
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-full px-3 py-2 text-sm">
              <option value="strength">Strength of alignment</option>
              <option value="score">MD Score (high → low)</option>
              <option value="change">Day change</option>
            </select>
          </Field>
        </div>
        <p className="mt-3 text-xs text-faint">
          “Minimum score” is symmetric: it filters on strength of alignment in either direction, so a score of 18 passes a 80+ filter as
          strong bearish alignment.
        </p>
      </Panel>

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {data && data.lockedCount > 0 ? (
        <div className="border border-gold/30 bg-gold/5 px-4 py-3 text-xs text-gold">
          Scanning {data.total} of {data.total + data.lockedCount} markets on your plan.{" "}
          <Link href="/subscription" className="underline">Unlock the full universe</Link>
        </div>
      ) : null}

      {loading && !data ? (
        <Skeleton className="h-96" />
      ) : rows.length === 0 ? (
        <EmptyState title="No markets match these filters" message="Loosen a filter — most useful setups do not satisfy every condition at once." />
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                {["Market", "Price", "Change", "MD Score", "Direction", "50 MA", "Structure", "Momentum", "News", "Event risk"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-[10px] uppercase tracking-widest text-faint">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.symbol} className="border-b border-hairline-soft transition last:border-b-0 hover:bg-panel-2">
                  <td className="px-3 py-2.5">
                    <Link href={`/markets/${encodeURIComponent(r.symbol)}`} className="block">
                      <div className="display text-sm font-semibold hover:text-gold">{r.symbol}</div>
                      <div className="text-[10px] uppercase tracking-widest text-faint">{r.group}</div>
                    </Link>
                  </td>
                  <td className="ticker px-3 py-2.5 text-xs">{fmtPrice(r.price, r.price < 10 ? 4 : 2)}</td>
                  <td className={`ticker px-3 py-2.5 text-xs ${r.changePct >= 0 ? "text-bull" : "text-bear"}`}>{fmtPct(r.changePct)}</td>
                  <td className="px-3 py-2.5"><div className="w-28"><ScoreMeter score={r.score} direction={r.direction} /></div></td>
                  <td className="px-3 py-2.5"><DirectionBadge direction={r.direction} small /></td>
                  <td className={`px-3 py-2.5 text-xs uppercase ${r.ma50 === "above" ? "text-bull" : r.ma50 === "below" ? "text-bear" : "text-faint"}`}>{r.ma50 ?? "—"}</td>
                  <td className={`px-3 py-2.5 text-xs uppercase ${r.structure === "bullish" ? "text-bull" : r.structure === "bearish" ? "text-bear" : "text-mute"}`}>{r.structure}</td>
                  <td className="px-3 py-2.5 text-xs uppercase text-mute">{r.momentum}</td>
                  <td className={`px-3 py-2.5 text-xs uppercase ${r.news === "bullish" ? "text-bull" : r.news === "bearish" ? "text-bear" : "text-mute"}`}>{r.news}</td>
                  <td className={`px-3 py-2.5 text-xs uppercase ${r.eventRisk === "high" ? "text-bear" : r.eventRisk === "medium" ? "text-gold" : "text-faint"}`}>{r.eventRisk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {data ? (
        <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-faint">
          <span>{rows.length} results</span>
          <span>Updated {timeAgo(data.generatedAt)}</span>
        </div>
      ) : null}
    </div>
  );
}

function labelFor(key: string) {
  const map: Record<string, string> = {
    direction: "Direction", minScore: "Minimum score", class: "Asset class", ma50: "Price vs 50 MA",
    structure: "Structure", momentum: "Momentum", news: "News", eventRisk: "Event risk",
  };
  return map[key] ?? key;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Eyebrow className="mb-1">{label}</Eyebrow>
      {children}
    </div>
  );
}

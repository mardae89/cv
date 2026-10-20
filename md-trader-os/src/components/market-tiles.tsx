"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Direction, ScannerRow } from "@/lib/types";
import { fmtPct } from "@/lib/utils/format";

/**
 * MARKETS AS TILES, GROUPED.
 *
 * One full card per market made the list of 42 run to dozens of screens on a
 * phone. A tile carries what a scan needs — symbol, MD score, direction, day
 * change — three across on a phone, so a whole group reads at a glance, and
 * each group folds away under its header.
 */

const COLLAPSED_KEY = "mdos.markets.collapsed";

function readCollapsed(fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Which groups are folded, remembered on this device. */
export function useCollapsedGroups(defaultCollapsed: string[]) {
  const [collapsed, setCollapsed] = useState<string[]>(defaultCollapsed);
  useEffect(() => setCollapsed(readCollapsed(defaultCollapsed)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (group: string) =>
    setCollapsed((prev) => {
      const next = prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group];
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        /* not remembering is fine */
      }
      return next;
    });
  return [collapsed, toggle] as const;
}

const EDGE: Record<string, string> = {
  bullish: "border-l-bull",
  bearish: "border-l-bear",
  mixed: "border-l-flat",
  neutral: "border-l-hairline",
};

const TEXT: Record<string, string> = {
  bullish: "text-bull",
  bearish: "text-bear",
  mixed: "text-flat",
  neutral: "text-mute",
};

const SHORT: Record<string, string> = { bullish: "Bull", bearish: "Bear", mixed: "Mixed", neutral: "Flat" };

export function MarketTile({ row }: { row: ScannerRow }) {
  return (
    <Link
      href={`/markets/${encodeURIComponent(row.symbol)}`}
      className={`panel block border-l-2 px-2.5 py-2 transition hover:border-gold/40 hover:bg-panel-2 ${EDGE[row.direction] ?? EDGE.neutral}`}
    >
      <div className="display truncate text-[12px] font-bold tracking-tight">{row.symbol}</div>
      <div className="mt-1 flex items-end justify-between gap-1">
        <span className="ticker display text-lg font-bold leading-none">{row.score}</span>
        <span className={`text-[9px] font-semibold uppercase tracking-widest ${TEXT[row.direction] ?? TEXT.neutral}`}>
          {SHORT[row.direction] ?? row.direction}
        </span>
      </div>
      <div className={`ticker mt-1 text-[10px] ${row.changePct >= 0 ? "text-bull" : "text-bear"}`}>{fmtPct(row.changePct)}</div>
    </Link>
  );
}

function tally(rows: ScannerRow[]) {
  const count = (d: Direction) => rows.filter((r) => r.direction === d).length;
  return { bull: count("bullish"), bear: count("bearish"), other: rows.length - count("bullish") - count("bearish") };
}

export function GroupSection({
  title,
  rows,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  rows: ScannerRow[];
  collapsed: boolean;
  onToggle: () => void;
  /** Overrides the default tile grid, e.g. with full cards. */
  children?: React.ReactNode;
}) {
  const t = tally(rows);
  return (
    <section className="panel-flat">
      <button
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-panel"
      >
        <span className="flex items-baseline gap-2">
          <span className="display text-xs font-bold uppercase tracking-widest">{title}</span>
          <span className="ticker text-[10px] text-faint">{rows.length}</span>
        </span>
        <span className="flex items-center gap-3 text-[10px] uppercase tracking-widest">
          <span className="text-bull">{t.bull} bull</span>
          <span className="text-bear">{t.bear} bear</span>
          {t.other ? <span className="hidden text-faint sm:inline">{t.other} other</span> : null}
          <span className={`text-gold transition ${collapsed ? "" : "rotate-90"}`} aria-hidden>›</span>
        </span>
      </button>
      {collapsed ? null : (
        <div className="border-t border-hairline-soft p-2">
          {children ?? (
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
              {rows.map((r) => <MarketTile key={r.symbol} row={r} />)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

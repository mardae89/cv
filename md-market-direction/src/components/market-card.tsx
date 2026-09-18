"use client";

import Link from "next/link";
import type { ScannerRow } from "@/lib/types";
import { DirectionBadge, directionColor } from "./primitives";
import { ScoreMeter } from "./score";
import { bandFor } from "@/lib/config/scoring";
import { fmtPct, fmtPrice, timeAgo } from "@/lib/utils/format";
import { useTicker } from "@/lib/hooks";

function symbolHref(symbol: string) {
  return `/markets/${encodeURIComponent(symbol)}`;
}

export function MarketCard({ row, precision = 2 }: { row: ScannerRow; precision?: number }) {
  useTicker(5000);
  const band = bandFor(row.score);
  return (
    <Link
      href={symbolHref(row.symbol)}
      className="panel group block p-4 transition hover:border-gold/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="display truncate text-base font-bold tracking-tight">{row.symbol}</div>
          <div className="truncate text-[11px] uppercase tracking-widest text-faint">{row.name}</div>
        </div>
        <DirectionBadge direction={row.direction} small />
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="ticker text-lg font-semibold">{fmtPrice(row.price, precision)}</span>
        <span className={`ticker text-xs ${row.changePct >= 0 ? "text-bull" : "text-bear"}`}>
          {fmtPct(row.changePct)}
        </span>
      </div>

      <div className="mt-3">
        <ScoreMeter score={row.score} direction={row.direction} />
        <div className={`mt-1 text-[10px] uppercase tracking-widest ${directionColor(row.direction)}`}>
          {row.direction === "mixed" ? "Mixed — timeframes disagree" : band.label}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-hairline-soft pt-3 text-[11px]">
        <Row label="50 MA (1D)" value={row.ma50 ? row.ma50.toUpperCase() : "—"} good={row.ma50 === "above"} bad={row.ma50 === "below"} />
        <Row label="Structure (1D)" value={row.structure.toUpperCase()} good={row.structure === "bullish"} bad={row.structure === "bearish"} />
        <Row label="Momentum" value={row.momentum.toUpperCase()} good={row.momentum === "strong"} />
        <Row label="News" value={row.news.toUpperCase()} good={row.news === "bullish"} bad={row.news === "bearish"} />
      </dl>

      <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-faint">
        <span>Updated {timeAgo(row.updatedAt)}</span>
        {row.eventRisk !== "none" ? <span className="text-gold">Event risk {row.eventRisk}</span> : <span>No event risk</span>}
      </div>
    </Link>
  );
}

function Row({ label, value, good, bad }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  return (
    <>
      <dt className="text-faint">{label}</dt>
      <dd className={`text-right font-medium ${good ? "text-bull" : bad ? "text-bear" : "text-mute"}`}>{value}</dd>
    </>
  );
}

/** Dense list row used by the scanner, radar and watchlists. */
export function MarketRow({
  symbol,
  name,
  score,
  direction,
  price,
  changePct,
  precision = 2,
  right,
}: {
  symbol: string;
  name?: string;
  score: number;
  direction: string;
  price?: number;
  changePct?: number;
  precision?: number;
  right?: React.ReactNode;
}) {
  return (
    <Link
      href={symbolHref(symbol)}
      className="flex items-center gap-3 border-b border-hairline-soft px-3 py-2.5 transition last:border-b-0 hover:bg-panel-2"
    >
      <span className={`h-6 w-0.5 shrink-0 ${direction === "bullish" ? "bg-bull" : direction === "bearish" ? "bg-bear" : "bg-flat"}`} />
      <div className="min-w-0 flex-1">
        <div className="display truncate text-sm font-semibold">{symbol}</div>
        {name ? <div className="truncate text-[10px] uppercase tracking-widest text-faint">{name}</div> : null}
      </div>
      {price != null ? (
        <div className="hidden text-right sm:block">
          <div className="ticker text-sm">{fmtPrice(price, precision)}</div>
          {changePct != null ? (
            <div className={`ticker text-[10px] ${changePct >= 0 ? "text-bull" : "text-bear"}`}>{fmtPct(changePct)}</div>
          ) : null}
        </div>
      ) : null}
      <div className="w-24 shrink-0">
        <ScoreMeter score={score} direction={direction} />
      </div>
      {right}
    </Link>
  );
}

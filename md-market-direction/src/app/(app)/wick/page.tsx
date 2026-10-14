"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "@/lib/hooks";
import { symbolMatches } from "@/lib/symbols";
import { PriceChart, type ChartZone } from "@/components/chart";
import { EmptyState, ErrorState, Eyebrow, Panel, SectionHeading, Skeleton } from "@/components/primitives";
import { WICK_TIMEFRAMES, TF_SPOKEN } from "@/lib/config/wick";
import type { HistoricalSetup, WickRule, WickSetup, ZoneState } from "@/lib/engine/wick";
import { fmtPrice } from "@/lib/utils/format";
import type { Timeframe } from "@/lib/types";

interface WickResponse {
  symbol: string;
  name: string;
  precision: number;
  timeframe: Timeframe;
  demo: boolean;
  live: { setup: WickSetup | null; rules: WickRule[]; direction: "buy" | "sell" | null };
  history: HistoricalSetup[];
  generatedAt: number;
}

/* Phase 4 replaces this with the saved colour. Until then one constant, in one
   place, so swapping it is a one-line change. */
const PAGE_SIZE = 20;

const ZONE_COLOR = "#d4a537";
const ZONE_OPACITY = 0.18;

const STATE_LABEL: Record<ZoneState, string> = {
  waiting: "Waiting",
  "in-zone": "In Zone",
  overrun: "Missed — ran past 0",
  invalidated: "Invalidated",
  expired: "Expired",
};

const STATE_TONE: Record<ZoneState, string> = {
  waiting: "text-flat",
  "in-zone": "text-bull",
  overrun: "text-faint",
  invalidated: "text-bear",
  expired: "text-faint",
};

export default function WickPage() {
  const [symbol, setSymbol] = useState("EUR/USD");
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [page, setPage] = useState(0);
  const { data, loading, error, refresh } = useApi<WickResponse>(
    `/api/wick?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`,
    [symbol, timeframe],
  );

  // A new market or timeframe is a new list; staying on page 4 of it would show
  // an empty table.
  useEffect(() => setPage(0), [symbol, timeframe]);

  /* Live zone plus the recent historical ones, so a setup can be checked against
     the chart it was found on rather than taken on trust. */
  const zones = useMemo<ChartZone[]>(() => {
    if (!data) return [];
    const out: ChartZone[] = [];
    for (const h of data.history.slice(0, 25)) {
      out.push({
        fromT: h.zone.fromT,
        toT: h.zone.toT,
        priceA: h.zone.zoneNear,
        priceB: h.zone.zoneFar,
        invalidation: h.zone.invalidation,
        color: ZONE_COLOR,
        opacity: ZONE_OPACITY,
      });
    }
    if (data.live.setup) {
      out.push({
        fromT: data.live.setup.zone.fromT,
        toT: data.live.setup.zone.toT,
        priceA: data.live.setup.zone.zoneNear,
        priceB: data.live.setup.zone.zoneFar,
        invalidation: data.live.setup.zone.invalidation,
        color: ZONE_COLOR,
        opacity: ZONE_OPACITY + 0.12,
        label: data.live.setup.direction.toUpperCase(),
      });
    }
    return out;
  }, [data]);

  const p = data?.precision ?? 5;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <SectionHeading
        title="Wick Catching"
        subtitle="Setups matching the Wick Catching method, with the pullback zone drawn on the previous candle. Not buy or sell signals."
      />

      <Panel className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SymbolSearch value={symbol} onPick={setSymbol} />
          <div className="flex border border-hairline">
            {WICK_TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-widest transition ${
                  tf === timeframe ? "bg-gold text-void" : "text-mute hover:text-gold"
                }`}
              >
                {TF_SPOKEN[tf]}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {loading && !data ? <Skeleton className="h-96 w-full" /> : null}

      {data ? (
        <>
          {/* ------------------------------ LIVE READ ----------------------------- */}
          <Panel className="p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Eyebrow>Current candle · {data.symbol} · {TF_SPOKEN[data.timeframe]}</Eyebrow>
              {data.live.setup ? (
                <span className={`display text-xs font-bold uppercase tracking-widest ${STATE_TONE[data.live.setup.zone.state]}`}>
                  {STATE_LABEL[data.live.setup.zone.state]}
                </span>
              ) : null}
            </div>

            {data.live.setup ? (
              <>
                <div className="display mt-2 text-xl font-bold tracking-tight sm:text-2xl">
                  A setup matching the Wick Catching method ·{" "}
                  <span className={data.live.setup.direction === "buy" ? "text-bull" : "text-bear"}>
                    {data.live.setup.direction === "buy" ? "Buy side" : "Sell side"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-mute">{data.live.setup.pullbackLabel}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Stat label="Zone (0.382)" value={fmtPrice(data.live.setup.zone.zoneNear, p)} />
                  <Stat label="Zone (0.75)" value={fmtPrice(data.live.setup.zone.zoneFar, p)} />
                  <Stat label="Invalidation (1.0)" value={fmtPrice(data.live.setup.zone.invalidation, p)} />
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-mute">
                No setup on the candle forming now. The rules that did not pass are listed below.
              </p>
            )}

            <div className="mt-5 space-y-1.5">
              {data.live.rules.map((r) => (
                <div key={r.id} className="flex items-start gap-2.5 text-sm">
                  <span className={`mt-0.5 text-xs ${r.passed ? "text-bull" : "text-bear"}`}>
                    {r.passed ? "✓" : "✕"}
                  </span>
                  <span className={r.passed ? "text-bone" : "text-mute"}>
                    {r.label}
                    <span className="text-faint"> — {r.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          {/* -------------------------------- CHART ------------------------------- */}
          <div className="bleed">
            <PriceChart
              symbol={data.symbol}
              timeframe={timeframe}
              onTimeframeChange={(tf) => {
                if (WICK_TIMEFRAMES.includes(tf)) setTimeframe(tf);
              }}
              zones={zones}
            />
          </div>

          {/* ------------------------------- HISTORY ------------------------------ */}
          <Panel className="p-5 sm:p-6">
            <Eyebrow className="mb-1">Past setups on this timeframe</Eyebrow>
            <p className="mb-4 text-xs text-faint">
              Replayed candle by candle using only the data that existed at the time, so each row is
              a setup the live detector would have produced on that bar — not one found with hindsight.
            </p>

            {data.history.length === 0 ? (
              <EmptyState title="No setups yet" message="No candles in the available history matched all five rules on this timeframe." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-[10px] uppercase tracking-widest text-faint">
                      {["Candle", "Side", "0.382", "0.75", "Invalidation (1.0)", "Reached zone"].map((h) => (
                        <th key={h} className="px-2 py-2 text-left font-normal">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE).map((h) => (
                      <tr key={h.candleT} className="border-b border-hairline-soft last:border-b-0">
                        <td className="px-2 py-2 tnum text-mute">
                          {new Date(h.candleT).toISOString().slice(0, 16).replace("T", " ")}
                        </td>
                        <td className={`px-2 py-2 font-semibold ${h.direction === "buy" ? "text-bull" : "text-bear"}`}>
                          {h.direction === "buy" ? "Buy" : "Sell"}
                        </td>
                        <td className="px-2 py-2 tnum">{fmtPrice(h.zone.zoneNear, p)}</td>
                        <td className="px-2 py-2 tnum">{fmtPrice(h.zone.zoneFar, p)}</td>
                        <td className="px-2 py-2 tnum text-mute">{fmtPrice(h.zone.invalidation, p)}</td>
                        <td className={`px-2 py-2 ${
                          h.outcome === "reached" ? "text-bull" : h.outcome === "invalidated" ? "text-bear" : "text-faint"
                        }`}>
                          {h.outcome === "reached"
                            ? "Yes"
                            : h.outcome === "invalidated"
                              ? "Invalidated"
                              : h.outcome === "overrun"
                                ? "Ran past 0"
                                : "No"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.history.length > PAGE_SIZE ? (
              <div className="mt-4 flex items-center justify-between gap-3 text-xs">
                <button
                  onClick={() => setPage((p0) => Math.max(0, p0 - 1))}
                  disabled={page === 0}
                  className="border border-hairline px-3 py-1.5 uppercase tracking-widest text-mute transition enabled:hover:border-gold enabled:hover:text-gold disabled:opacity-30"
                >
                  ← Previous
                </button>
                <span className="tnum text-faint">
                  {page * PAGE_SIZE + 1}–{Math.min(data.history.length, (page + 1) * PAGE_SIZE)} of {data.history.length}
                </span>
                <button
                  onClick={() => setPage((p0) => (p0 + 1) * PAGE_SIZE < data.history.length ? p0 + 1 : p0)}
                  disabled={(page + 1) * PAGE_SIZE >= data.history.length}
                  className="border border-hairline px-3 py-1.5 uppercase tracking-widest text-mute transition enabled:hover:border-gold enabled:hover:text-gold disabled:opacity-30"
                >
                  Next →
                </button>
              </div>
            ) : null}
          </Panel>

          <p className="pb-4 text-[11px] leading-relaxed text-faint">
            Educational tool. These are setups matching the Wick Catching method, not buy or sell
            signals and not financial advice. You are responsible for your own trading decisions.
          </p>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-hairline-soft px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-faint">{label}</div>
      <div className="ticker mt-0.5 text-base font-semibold">{value}</div>
    </div>
  );
}

interface AssetRow {
  symbol: string;
  name: string;
  group: string;
}

/**
 * Symbol search with live suggestions.
 *
 * Matching ignores separators, so "eurusd", "eur usd" and "EUR/USD" all find the
 * same pair — nobody should have to reach for the slash key on a phone. The list
 * is fetched once and filtered in the browser, so suggestions appear on the
 * keystroke rather than after a round trip.
 */
function SymbolSearch({ value, onPick }: { value: string; onPick: (symbol: string) => void }) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setText(value), [value]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/assets")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.assets) setAssets(j.assets as AssetRow[]);
      })
      .catch(() => {
        /* suggestions are a convenience; typing a symbol still works without them */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const matches = useMemo(() => {
    const q = text.trim();
    if (!q) return [];
    const scored = assets.filter((a) => symbolMatches(q, a.symbol, a.name));
    // A symbol that starts with what was typed is what the user meant; rank it
    // above a mid-string or name match.
    const key = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return scored
      .sort((a, b) => {
        const aStarts = a.symbol.replace(/[^A-Z0-9]/g, "").startsWith(key) ? 0 : 1;
        const bStarts = b.symbol.replace(/[^A-Z0-9]/g, "").startsWith(key) ? 0 : 1;
        return aStarts - bStarts || a.symbol.localeCompare(b.symbol);
      })
      .slice(0, 8);
  }, [assets, text]);

  const choose = (symbol: string) => {
    onPick(symbol);
    setText(symbol);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative flex-1 sm:max-w-xs">
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) {
            if (e.key === "Enter" && text.trim()) choose(text.trim());
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(matches[highlight]?.symbol ?? text.trim());
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Search a market — eurusd, gbpjpy, xau"
        className="w-full px-3 py-2.5 text-sm"
        autoComplete="off"
        spellCheck={false}
      />
      {open && matches.length > 0 ? (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto border border-hairline bg-ink shadow-lg">
          {matches.map((a, i) => (
            <li key={a.symbol}>
              <button
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(a.symbol)}
                className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition ${
                  i === highlight ? "bg-gold/15 text-gold" : "text-bone hover:bg-flat/10"
                }`}
              >
                <span className="font-semibold">{a.symbol}</span>
                <span className="truncate text-[11px] text-faint">{a.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

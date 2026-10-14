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
  const { data, loading, error, refresh } = useApi<WickResponse>(
    `/api/wick?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`,
    [symbol, timeframe],
  );



  /* ONE zone on the chart: the live one, anchored on the previous candle and
     drawn over the current one. */
  const zones = useMemo<ChartZone[]>(() => {
    const setup = data?.live.setup;
    if (!setup) return [];
    return [{
      fromT: setup.zone.fromT,
      toT: setup.zone.toT,
      priceA: setup.zone.zoneNear,
      priceB: setup.zone.zoneFar,
      invalidation: setup.zone.invalidation,
      color: ZONE_COLOR,
      opacity: ZONE_OPACITY,
      label: setup.direction.toUpperCase(),
    }];
  }, [data]);

  const p = data?.precision ?? 5;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <SectionHeading
        title="Wick Catching"
        subtitle="Setups matching the Wick Catching method, with the pullback zone drawn on the previous candle. Not buy or sell signals."
      />

      <Panel className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-widest text-faint">Timeframe</span>
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
              symbolControl={<SymbolSearch value={symbol} onPick={setSymbol} compact />}
            />
          </div>

          {/* ------------------------------ READY NOW ----------------------------- */}
          <ReadyBoard timeframe={timeframe} current={symbol} onPick={setSymbol} />

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
function SymbolSearch({
  value,
  onPick,
  compact = false,
}: {
  value: string;
  onPick: (symbol: string) => void;
  /** Sized to sit inside the chart's toolbar rather than lead the page. */
  compact?: boolean;
}) {
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
    <div ref={boxRef} className={compact ? "relative w-full" : "relative flex-1 sm:max-w-xs"}>
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
        placeholder={compact ? "Change symbol…" : "Search a market — eurusd, gbpjpy, xau"}
        className={compact ? "w-full px-2 py-1 text-xs" : "w-full px-3 py-2.5 text-sm"}
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

interface ScanRow {
  symbol: string;
  name: string;
  precision: number;
  direction: "buy" | "sell";
  state: ZoneState;
  zoneNear: number;
  zoneFar: number;
  invalidation: number;
  progress: number;
}

/**
 * Every market with a live setup on this timeframe, ready first.
 *
 * Only setups that can still be taken appear: price already past the 0 level,
 * or closed through invalidation, is a finished setup and padding the board
 * with those would bury the ones that matter.
 */
function ReadyBoard({
  timeframe,
  current,
  onPick,
}: {
  timeframe: Timeframe;
  current: string;
  onPick: (symbol: string) => void;
}) {
  const { data, loading, error, refresh } = useApi<{
    timeframe: Timeframe;
    scanned: number;
    rows: ScanRow[];
  }>(`/api/wick/scan?timeframe=${timeframe}`, [timeframe]);

  const inZone = data?.rows.filter((r) => r.state === "in-zone").length ?? 0;

  return (
    <Panel className="p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Eyebrow>Setups ready on the {TF_SPOKEN[timeframe]}</Eyebrow>
        {data ? (
          <span className="text-[10px] uppercase tracking-widest text-faint">
            {data.rows.length} of {data.scanned} markets{inZone ? ` · ${inZone} in zone` : ""}
          </span>
        ) : null}
      </div>
      <p className="mb-4 mt-1 text-xs text-faint">
        Markets whose previous {TF_SPOKEN[timeframe]} candle matches the method and whose zone is
        still live. Pick one to load it on the chart.
      </p>

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {loading && !data ? <Skeleton className="h-40 w-full" /> : null}

      {data && data.rows.length === 0 ? (
        <EmptyState
          title="Nothing ready"
          message={`No market currently has a live ${TF_SPOKEN[timeframe]} setup. Try another timeframe.`}
        />
      ) : null}

      {data && data.rows.length > 0 ? (
        <ul className="divide-y divide-hairline-soft border-y border-hairline-soft">
          {data.rows.map((r) => (
            <li key={r.symbol}>
              <button
                onClick={() => onPick(r.symbol)}
                className={`flex w-full items-center gap-3 px-1 py-2.5 text-left transition ${
                  r.symbol === current ? "bg-gold/10" : "hover:bg-flat/10"
                }`}
              >
                <span
                  className={`display w-14 shrink-0 text-[11px] font-bold uppercase tracking-widest ${
                    r.direction === "buy" ? "text-bull" : "text-bear"
                  }`}
                >
                  {r.direction}
                </span>
                <span className="w-24 shrink-0 text-sm font-semibold text-bone">{r.symbol}</span>
                <span className="ticker hidden flex-1 text-xs text-mute sm:block">
                  {fmtPrice(r.zoneNear, r.precision)} – {fmtPrice(r.zoneFar, r.precision)}
                </span>
                <span
                  className={`ml-auto shrink-0 text-[10px] uppercase tracking-widest ${
                    r.state === "in-zone" ? "text-bull" : "text-flat"
                  }`}
                >
                  {STATE_LABEL[r.state]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
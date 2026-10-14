"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "@/lib/hooks";
import { symbolMatches } from "@/lib/symbols";
import { PriceChart, type ChartLevel, type ChartMarker, type ChartZone } from "@/components/chart";
import { EmptyState, ErrorState, Eyebrow, Panel, SectionHeading, Skeleton } from "@/components/primitives";
import { SOS_TIMEFRAMES, TF_SPOKEN, WICK_TIMEFRAME } from "@/lib/config/wick";
import type { HistoricalSetup, WickRule, WickSetup, ZoneState } from "@/lib/engine/wick";
import type { Elbow, SosEvent, StructureLine } from "@/lib/engine/sos";
import { fmtPrice } from "@/lib/utils/format";
import type { Timeframe } from "@/lib/types";

interface WickResponse {
  symbol: string;
  name: string;
  precision: number;
  timeframe: Timeframe;
  setupTimeframe: Timeframe;
  demo: boolean;
  live: { setup: WickSetup | null; rules: WickRule[]; direction: "buy" | "sell" | null };
  history: HistoricalSetup[];
  entryTimeframes: Timeframe[];
  sos: {
    timeframe: Timeframe;
    line: StructureLine | null;
    lines: StructureLine[];
    latest: SosEvent | null;
    events: SosEvent[];
    elbows: Elbow[];
  };
  generatedAt: number;
}

type WickView = "zones" | "sos";

/* Phase 4 replaces this with the saved colour. Until then one constant, in one
   place, so swapping it is a one-line change. */
const ZONE_COLOR = "#d4a537";
const ZONE_OPACITY = 0.18;

/* Structure dots. Deep for the point a trend has already made — the higher high,
   the lower low — and bright for the one it is building on and that a close
   beyond would break: the higher low, the lower high. */
const STRUCTURE_DOT = {
  HH: "#16a34a",
  HL: "#39ff14",
  LL: "#c62828",
  LH: "#ff3b3b",
} as const;

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

/**
 * An edit the reader has made to a structure line: where they put it, and how
 * far they want it to run.
 *
 * Kept against the structure point it was made on, so it holds while that point
 * is on the chart and is dropped once it is gone — a hand placed line is worth
 * keeping, but not once it is answering a question nobody is asking any more.
 */
interface LineEdit {
  price?: number;
  extent?: LineExtent;
}

type LineExtent = "right" | "left" | "both";

const EDITS_KEY = "wick:line-edits";

/** Identifies a line across refetches: its name and the bar it sits on. */
const lineId = (label: string, t: number) => `${label}@${t}`;

function readEdits(): Record<string, Record<string, LineEdit>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(EDITS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Record<string, LineEdit>>) : {};
  } catch {
    return {};
  }
}

export default function WickPage() {
  const [symbol, setSymbol] = useState("EUR/USD");
  const [timeframe, setTimeframe] = useState<Timeframe>("1W");
  const [view, setView] = useState<WickView>("zones");
  const { data, loading, error, refresh } = useApi<WickResponse>(
    `/api/wick?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`,
    [symbol, timeframe],
  );

  /* Lines the reader has edited, by market and timeframe, kept in the browser so
     they survive a reload and a change of symbol and back. */
  const [edits, setEdits] = useState<Record<string, Record<string, LineEdit>>>({});
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => setEdits(readEdits()), []);
  // A different market or timeframe is a different chart: nothing stays selected.
  useEffect(() => setSelected(null), [symbol, timeframe, view]);

  const editsKey = `${symbol}|${timeframe}`;
  const myEdits = useMemo(() => edits[editsKey] ?? {}, [edits, editsKey]);

  const editLine = (id: string, change: LineEdit | null) => {
    setEdits((prev) => {
      const forKey = { ...(prev[editsKey] ?? {}) };
      if (change == null) delete forKey[id];
      else forKey[id] = { ...forKey[id], ...change };
      return { ...prev, [editsKey]: forKey };
    });
  };

  /* Written back a moment after the line stops moving rather than on every
     frame of the drag — the browser only has to remember where it ended up. */
  const firstEditRender = useRef(true);
  useEffect(() => {
    if (firstEditRender.current) {
      firstEditRender.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      try {
        window.localStorage.setItem(EDITS_KEY, JSON.stringify(edits));
      } catch {
        /* a line that cannot be remembered still works for this session */
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [edits]);



  /* ONE zone: the weekly one, anchored on last week's candle and drawn over
     this week's. It stays on screen whatever timeframe the chart is showing —
     that is the point of it, since the entry is timed further down. */
  const zones = useMemo<ChartZone[]>(() => {
    if (view !== "zones") return [];
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
      fullWidth: true,
    }];
  }, [data, view]);

  /* The shift-of-structure view: the line a candle had to close beyond, and the
     bars where each step of the sequence landed. */
  const sosFocus = useMemo<number | null>(() => {
    if (view !== "sos" || !data) return null;
    return data.sos.latest?.shiftT ?? null;
  }, [data, view]);

  /* THE STRUCTURE POINTS, DRAWN.
     While price keeps closing above the 50 EMA the market is making higher
     lows, so every one of them gets a line and they stay until a close goes
     back under the EMA; below the EMA it is every lower high. The newest line
     is the one a close beyond shifts the structure and carries the full label;
     the rest are the staircase behind it, which is where price pulls back to.
     The level the last shift broke is kept too — that is the one price retests
     before the confirmation candle. */
  const sosLevels = useMemo<ChartLevel[]>(() => {
    if (view !== "sos" || !data) return [];
    const out: ChartLevel[] = [];
    const add = (
      price: number,
      t: number,
      label: "HL" | "LH",
      shift: "buy" | "sell",
      opts: { current?: boolean; broken?: boolean; last?: boolean },
    ) => {
      const id = lineId(label, t);
      const edit = myEdits[id] ?? {};
      const at = edit.price ?? price;
      if (out.some((l) => Math.abs(l.price - at) < 1e-9)) return;
      const extent: LineExtent = edit.extent ?? "right";
      const price_ = fmtPrice(at, data.precision);
      const moved = edit.price != null;
      out.push({
        price: at,
        fromT: t,
        toT: t,
        extendRight: extent !== "left",
        extendLeft: extent !== "right",
        dashed: true,
        color: label === "HL" ? "#4ade80" : "#f87171",
        // Every structure line can be taken hold of: tapped to select, dragged
        // to where the reader reads the structure to be, and run out to either
        // edge. The engine's reading is a starting point, not the last word.
        id,
        draggable: true,
        // Only the two lines that mean something carry text: the one in force,
        // and the one the last shift broke. The rungs behind them are already
        // named where they start, by the dot on the elbow itself, and labelling
        // every one of them crowds the right edge into a stack.
        label: opts.current
          ? `${label} ${price_}${moved ? " · moved" : ""} · close ${shift === "sell" ? "below" : "above"} = shift`
          : opts.last
            ? `${label} ${price_}${moved ? " · moved" : ""} · broken`
            : moved
              ? `${label} ${price_} · moved`
              : undefined,
        // Older rungs of the staircase sit back; the line in force leads.
        faint: !opts.current && !opts.last,
      });
    };
    // Newest first, so the line in force wins the label slot nearest its own
    // price when several sit close together. A long trend can hold forty rungs,
    // and the oldest of them are nowhere near price — the nearest dozen is what
    // a chart can show and what price could plausibly come back to.
    for (const l of data.sos.lines.slice(-12).reverse()) {
      add(l.price, l.t, l.label, l.shift, { current: l.current, broken: l.broken });
    }
    const e = data.sos.latest;
    if (e) add(e.line, e.lineT, e.lineLabel, e.direction, { broken: true, last: true });
    return out;
  }, [data, view, myEdits]);

  /* Structure points, as dots only. The letters and the leader lines pointing
     at them were taller than the swings they named, so the colour carries the
     meaning instead: bright for the point the trend is building on — the higher
     low in an uptrend, the lower high in a downtrend — and dark for the point it
     has already made. */
  const sosMarkers = useMemo<ChartMarker[]>(() => {
    if (view !== "sos" || !data) return [];
    const marks: ChartMarker[] = data.sos.elbows
      // The first high and the first low have nothing to be measured against,
      // so naming them would be guessing.
      .filter((e) => e.label !== null)
      .map((e) => ({
        t: e.t,
        price: e.price,
        color: STRUCTURE_DOT[e.label as keyof typeof STRUCTURE_DOT],
        side: e.kind === "high" ? ("above" as const) : ("below" as const),
        radius: 4,
      }));

    // The most recent break keeps its words: it is one mark, and it is the one
    // thing on the chart that says something happened rather than what a point
    // is called.
    const e = data.sos.latest;
    if (e) {
      marks.push({
        t: e.shiftT,
        price: e.shiftClose,
        label: `${e.lineLabel} BROKEN`,
        color: e.direction === "buy" ? "#4ade80" : "#f87171",
        side: e.direction === "buy" ? "above" : "below",
      });
    }
    return marks;
  }, [data, view]);

  const p = data?.precision ?? 5;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <SectionHeading
        title="Wick Catching"
        subtitle="Setups matching the Wick Catching method, with the pullback zone drawn on the previous candle. Not buy or sell signals."
      />

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {loading && !data ? <Skeleton className="h-96 w-full" /> : null}

      {data ? (
        <>
          {/* ------------------------------ LIVE READ ----------------------------- */}
          <Panel className="p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Eyebrow>Current weekly candle · {data.symbol}</Eyebrow>
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
                {data.live.setup.zone.state === "in-zone" ? (
                  <div className="mt-3 border border-gold/40 bg-gold/10 px-4 py-3">
                    <div className="display text-xs font-bold uppercase tracking-widest text-gold">
                      Price is in the zone
                    </div>
                    <p className="mt-1 text-sm text-bone">
                      Drop to the{" "}
                      {data.entryTimeframes.map((t) => TF_SPOKEN[t]).join(" or the ")} to time an entry.
                      The Weekly zone is where to look; it is not an entry level.
                    </p>
                  </div>
                ) : null}

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

            {view === "sos" ? (
              <SosPanel
                sos={data.sos}
                timeframe={timeframe}
                edited={Object.keys(myEdits).length > 0}
                onResetAll={() => setEdits((prev) => ({ ...prev, [editsKey]: {} }))}
              />
            ) : null}

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
                if (SOS_TIMEFRAMES.includes(tf)) setTimeframe(tf);
              }}
              zones={zones}
              levels={sosLevels}
              markers={sosMarkers}
              onLevelMove={(id, price) => editLine(id, { price })}
              selectedLevel={selected}
              onSelectLevel={setSelected}
              overlay={
                view === "sos" && selected ? (
                  <LineTools
                    extent={myEdits[selected]?.extent ?? "right"}
                    moved={myEdits[selected]?.price != null}
                    onExtent={(extent) => editLine(selected, { extent })}
                    onReset={() => editLine(selected, null)}
                    onDone={() => setSelected(null)}
                  />
                ) : null
              }
              focusT={sosFocus}
              symbolControl={<SymbolSearch value={symbol} onPick={setSymbol} compact />}
              viewControl={
                <div className="flex border border-hairline">
                  {([
                    ["zones", "Fib zones"],
                    ["sos", "Shift of structure"],
                  ] as const).map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      title={
                        v === "zones"
                          ? "Draw the Fibonacci pullback zone"
                          : "Draw the structure line and the shift sequence"
                      }
                      className={`px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-widest transition ${
                        v === view ? "bg-gold text-void" : "text-mute hover:text-gold"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              }
            />
          </div>

          {/* ------------------------------ READY NOW ----------------------------- */}
          <ReadyBoard current={symbol} onPick={setSymbol} />

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
  pullbackLabel: string;
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
  current,
  onPick,
}: {
  current: string;
  onPick: (symbol: string) => void;
}) {
  const timeframe = WICK_TIMEFRAME;
  const { data, loading, error, refresh } = useApi<{
    timeframe: Timeframe;
    scanned: number;
    entryTimeframes: Timeframe[];
    rows: ScanRow[];
  }>("/api/wick/scan", []);

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
          message={`No market currently has a live ${TF_SPOKEN[timeframe]} setup right now. The board refreshes with the next weekly candle.`}
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
                <span className="ml-auto shrink-0 text-right">
                  <span
                    className={`block text-[10px] uppercase tracking-widest ${
                      r.state === "in-zone" ? "text-bull" : "text-flat"
                    }`}
                  >
                    {STATE_LABEL[r.state]}
                  </span>
                  {r.state === "in-zone" && data ? (
                    <span className="block text-[9px] uppercase tracking-widest text-gold">
                      enter on {data.entryTimeframes.map((t) => TF_SPOKEN[t]).join(" / ")}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}

/** Says some lines are where the reader put them, and offers them back. */
function MovedNote({ edited, onResetAll }: { edited: boolean; onResetAll: () => void }) {
  if (!edited) return null;
  return (
    <>
      {" "}
      <span className="text-bone">You have moved lines on this chart.</span>{" "}
      <button
        onClick={onResetAll}
        className="display text-[10px] font-bold uppercase tracking-widest text-gold underline-offset-2 hover:underline"
      >
        Put them all back
      </button>
    </>
  );
}

/**
 * What to do with the line that is selected: how far it runs, put it back where
 * the structure had it, or let it go.
 */
function LineTools({
  extent,
  moved,
  onExtent,
  onReset,
  onDone,
}: {
  extent: LineExtent;
  moved: boolean;
  onExtent: (extent: LineExtent) => void;
  onReset: () => void;
  onDone: () => void;
}) {
  const choices: { key: LineExtent; label: string; title: string }[] = [
    { key: "left", label: "←", title: "Run the line to the left only" },
    { key: "both", label: "↔", title: "Run the line both ways" },
    { key: "right", label: "→", title: "Run the line to the right only" },
  ];
  return (
    <div className="flex items-stretch gap-1 border border-gold/50 bg-void/90 p-1 shadow-lg backdrop-blur">
      <span className="display self-center px-1 text-[10px] font-bold uppercase tracking-widest text-gold">
        Line
      </span>
      {choices.map((c) => (
        <button
          key={c.key}
          onClick={() => onExtent(c.key)}
          title={c.title}
          className={`min-w-8 px-2 py-1 text-sm leading-none transition ${
            extent === c.key ? "bg-gold text-void" : "text-mute hover:text-gold"
          }`}
        >
          {c.label}
        </button>
      ))}
      <button
        onClick={onReset}
        disabled={!moved && extent === "right"}
        className="display px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-mute transition hover:text-gold disabled:opacity-40"
      >
        Put back
      </button>
      <button
        onClick={onDone}
        className="display px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-gold transition hover:underline"
      >
        Done
      </button>
    </div>
  );
}

/** What the lines on the chart are, in a sentence. */
function LineNote({ line, count }: { line: StructureLine; count: number }) {
  const name = line.label === "HL" ? "higher low" : "lower high";
  const plural = line.label === "HL" ? "higher lows" : "lower highs";
  const rest =
    count > 1
      ? ` The ${plural} behind it are drawn too — the run lasts until a close goes back through the 50 EMA.`
      : "";
  if (line.broken) {
    return (
      <>
        The newest {name}, at {line.price.toFixed(5)}, has been closed through — it stays on the
        chart, because that is roughly where price pulls back to before the confirmation candle.
        {rest}
      </>
    );
  }
  return (
    <>
      The line in force sits on the newest {name} at {line.price.toFixed(5)} and runs to the right
      edge — a candle closing {line.shift === "sell" ? "below" : "above"} it is the shift. Tap any line on the
      chart to take hold of it: drag it to where you read the structure to be, and run it left,
      right or both ways.{rest}
    </>
  );
}

/**
 * The shift-of-structure sequence, in the order it has to happen. A step that
 * has not occurred is shown unfilled rather than hidden, so what the market is
 * still waiting for is as visible as what it has already done.
 */
function SosPanel({
  sos,
  timeframe,
  edited,
  onResetAll,
}: {
  sos: WickResponse["sos"];
  timeframe: Timeframe;
  /** Whether any line on this chart has been moved or re-run by hand. */
  edited: boolean;
  onResetAll: () => void;
}) {
  const e = sos.latest;
  if (!e) {
    return (
      <p className="mt-4 text-sm text-mute">
        No structure shift on the {TF_SPOKEN[timeframe]}.{" "}
        {sos.line ? <LineNote line={sos.line} count={sos.lines.length} /> : "No structure point yet: nothing has formed since price last closed through the 50 EMA."}
        <MovedNote edited={edited} onResetAll={onResetAll} />
      </p>
    );
  }
  const up = e.direction === "buy";
  const steps: { done: boolean; label: string; detail: string }[] = [
    {
      done: true,
      label: `Structure shifted ${up ? "up" : "down"}`,
      detail: `A candle closed ${up ? "above the last lower high" : "below the last higher low"} at ${e.line.toFixed(5)} — the line is drawn at the close of the candle that made the elbow, and a wick through it would not have counted.`,
    },
    {
      done: e.pullbackT != null,
      label: "Pullback",
      detail: e.pullbackT ? "Price pulled back after the shift." : "Waiting for price to pull back.",
    },
    {
      done: e.confirmT != null,
      label: "Confirmation candle",
      detail: e.confirmT
        ? `${e.confirmKind === "engulfing" ? "An engulfing candle" : "A medium-to-strong body"} closed ${up ? "above" : "below"} the 50 EMA.`
        : "Waiting for an engulfing or medium-to-strong candle that closes the right side of the 50 EMA.",
    },
  ];

  return (
    <div className="mt-4 space-y-2">
      {sos.line ? (
        <p className="text-sm text-mute">
          <LineNote line={sos.line} count={sos.lines.length} />
          <MovedNote edited={edited} onResetAll={onResetAll} />
        </p>
      ) : null}
      {steps.map((st) => (
        <div key={st.label} className="flex items-start gap-2.5 text-sm">
          <span className={`mt-0.5 text-xs ${st.done ? (up ? "text-bull" : "text-bear") : "text-faint"}`}>
            {st.done ? "✓" : "○"}
          </span>
          <span className={st.done ? "text-bone" : "text-mute"}>
            {st.label}
            <span className="text-faint"> — {st.detail}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
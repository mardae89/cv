"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApi, useTicker } from "@/lib/hooks";
import { useTradingMode, useTrendScope } from "@/lib/useTrendScope";
import type { Direction } from "@/lib/types";
import type { WickReport, WickZone } from "@/lib/engine/wickCatcher";
import { DirectionBadge, EmptyState, ErrorState, Eyebrow, GhostButton, GoldButton, Panel, SectionHeading, Skeleton } from "@/components/primitives";
import { Bar } from "@/components/os";
import { LogTradeModal, type TradeDraft } from "@/components/trade-forms";
import { fmtPrice, timeAgo } from "@/lib/utils/format";

interface BoardRow {
  symbol: string;
  name: string;
  group: string;
  precision: number;
  price: number;
  pipUnit: "pips" | "points";
  bias: Direction;
  biasStrength: number;
  best: WickZone | null;
  zoneCount: number;
  demo: boolean;
}

const GROUP_ORDER = ["Forex Majors", "Forex Minors", "Index Futures", "Metals", "Energy"];
/** Nearest or strongest first, so the top of the board is the part worth reading. */
const FIRST = 12;

export default function WickCatcherPage() {
  const [symbol, setSymbol] = useState<string | null>(null);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("symbol");
    if (s) setSymbol(s);
  }, []);

  const select = (s: string | null) => {
    setSymbol(s);
    window.history.replaceState(null, "", s ? `/wick-catcher?symbol=${encodeURIComponent(s)}` : "/wick-catcher");
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionHeading
        title="Wick Catcher"
        subtitle="MD Momentum says which way. This says where: the prices a pullback is likely to wick into before the trend resumes — so the entry waits there instead of chasing."
        action={symbol ? (
          <button onClick={() => select(null)} className="text-xs uppercase tracking-widest text-gold hover:underline">← All markets</button>
        ) : undefined}
      />
      {symbol ? <Detail symbol={symbol} /> : <Board onOpen={select} />}
    </div>
  );
}

/* ----------------------------------- board ----------------------------------- */

function Board({ onOpen }: { onOpen: (s: string) => void }) {
  const [mode] = useTradingMode();
  const [scope] = useTrendScope();
  const [group, setGroup] = useState<string>("all");
  const [withTrend, setWithTrend] = useState(true);
  const [sort, setSort] = useState<"near" | "score">("near");
  const [showAll, setShowAll] = useState(false);
  const { data, loading, error, refresh } = useApi<{ rows: BoardRow[]; generatedAt: number }>(
    `/api/wick-catcher?mode=${mode}&scope=${scope}`,
    [mode, scope],
  );
  useTicker(10_000);

  const rows = useMemo(() => {
    let list = data?.rows ?? [];
    if (group !== "all") list = list.filter((r) => r.group === group);
    if (withTrend) list = list.filter((r) => r.best);
    return list.slice().sort((a, b) => {
      if (!a.best || !b.best) return Number(Boolean(b.best)) - Number(Boolean(a.best));
      // In a zone right now beats everything; then nearest, or strongest.
      const live = Number(b.best.status === "in-zone") - Number(a.best.status === "in-zone");
      if (live) return live;
      return sort === "near" ? a.best.distanceAtr - b.best.distanceAtr : b.best.score - a.best.score;
    });
  }, [data, group, withTrend, sort]);

  return (
    <>
      <HowItWorks />
      <div className="flex flex-wrap items-center gap-2">
        {["all", ...GROUP_ORDER].map((g) => (
          <button
            key={g}
            onClick={() => { setGroup(g); setShowAll(false); }}
            className={`border px-3 py-1.5 font-display text-[10px] font-semibold uppercase tracking-widest ${group === g ? "border-gold bg-gold text-void" : "border-hairline text-mute hover:text-gold"}`}
          >
            {g === "all" ? "All" : g}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-hairline" />
        <button onClick={() => setWithTrend(!withTrend)} className={`border px-3 py-1.5 text-[10px] uppercase tracking-widest ${withTrend ? "border-bull/50 text-bull" : "border-hairline text-faint"}`}>
          {withTrend ? "✓ " : ""}With-trend zones only
        </button>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="ml-auto w-auto px-3 py-1.5 text-xs">
          <option value="near">Nearest first</option>
          <option value="score">Strongest first</option>
        </select>
      </div>

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {loading && !data ? (
        <Skeleton className="h-96" />
      ) : rows.length === 0 ? (
        <EmptyState title="No with-trend zones in reach" message="Either the weekly and daily do not agree anywhere in this group, or price is too far from every level. Turn off the filter to see both sides." />
      ) : (
        <Panel>
          <div className="hidden grid-cols-[1.2fr_90px_1.4fr_120px_90px] gap-3 border-b border-hairline px-4 py-2.5 text-[10px] uppercase tracking-widest text-faint sm:grid">
            <span>Market</span><span>HTF bias</span><span>Best zone</span><span>Zone strength</span><span className="text-right">Status</span>
          </div>
          {(showAll ? rows : rows.slice(0, FIRST)).map((r) => (
            <button
              key={r.symbol}
              onClick={() => onOpen(r.symbol)}
              className="grid w-full grid-cols-[1fr_auto] items-center gap-3 border-b border-hairline-soft px-4 py-3 text-left transition last:border-b-0 hover:bg-panel-2 sm:grid-cols-[1.2fr_90px_1.4fr_120px_90px]"
            >
              <div className="min-w-0">
                <div className="display text-sm font-semibold">{r.symbol}</div>
                <div className="ticker text-[10px] uppercase tracking-widest text-faint">{fmtPrice(r.price, r.precision)} · {r.group}</div>
              </div>
              <div className="hidden sm:block"><DirectionBadge direction={r.bias} small /></div>
              <div className="col-span-2 min-w-0 text-xs sm:col-span-1">
                {r.best ? (
                  <>
                    <span className={`display mr-2 font-bold uppercase ${r.best.side === "buy" ? "text-bull" : "text-bear"}`}>{r.best.side}</span>
                    <span className="ticker text-bone">{fmtPrice(r.best.entry, r.precision)}</span>
                    <span className="ml-2 text-faint">{r.best.distancePips.toFixed(0)} {r.pipUnit} away · {r.best.confluence} reason{r.best.confluence === 1 ? "" : "s"}</span>
                  </>
                ) : (
                  <span className="text-faint">No with-trend zone in reach</span>
                )}
              </div>
              <div className="hidden sm:block">{r.best ? <ZoneStrength score={r.best.score} /> : null}</div>
              <div className="text-right">{r.best ? <StatusTag status={r.best.status} /> : null}</div>
            </button>
          ))}
          {rows.length > FIRST ? (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full border-t border-hairline px-4 py-3 text-center text-[10px] uppercase tracking-widest text-gold hover:bg-panel-2"
            >
              {showAll ? `Show the top ${FIRST} only` : `Show all ${rows.length} markets`}
            </button>
          ) : null}
        </Panel>
      )}
      {data ? <div className="text-right text-[10px] uppercase tracking-widest text-faint">Updated {timeAgo(data.generatedAt)}</div> : null}
    </>
  );
}

function HowItWorks() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-hairline-soft bg-ink px-4 py-3 text-xs text-mute">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <span><span className="text-bone">How zones are built:</span> unfilled rejection wicks, yesterday&apos;s and last week&apos;s high/low, untaken swing points and the 50 EMA — clustered so several reasons at one price make one stronger zone.</span>
        <span className="ml-3 shrink-0 text-gold">{open ? "Less" : "More"}</span>
      </button>
      {open ? (
        <ul className="mt-3 space-y-1.5 border-t border-hairline-soft pt-3">
          <li><span className="text-bone">Wick fill</span> — the 50% of a long rejection wick (1D, 4H, 1H) that price has not come back to yet.</li>
          <li><span className="text-bone">Previous day / week</span> — the high or low a pullback sweeps for liquidity before continuing.</li>
          <li><span className="text-bone">Swing</span> — 4H and 1H swing lows/highs no later candle has traded through: stops are still resting there.</li>
          <li><span className="text-bone">50 EMA</span> — the daily, 4H and 1H 50 EMA, the line the MD strategy is built on.</li>
          <li><span className="text-bone">Round number</span> — a big or half figure inside a zone adds confluence. It never makes a zone on its own.</li>
          <li>Buy zones sit below price, sell zones above. The side that agrees with the weekly + daily bias is <span className="text-bull">with the trend</span> and scores higher. Stops go beyond the wick or the sweep, never inside it.</li>
          <li>These are levels to plan around, not signals. Every zone lists the exact levels that made it, so you can check it on the chart.</li>
        </ul>
      ) : null}
    </div>
  );
}

/* ----------------------------------- detail ---------------------------------- */

function Detail({ symbol }: { symbol: string }) {
  const [mode] = useTradingMode();
  const [scope] = useTrendScope();
  const [logging, setLogging] = useState<TradeDraft | null>(null);
  const { data, loading, error, refresh } = useApi<{ report: WickReport }>(
    `/api/wick-catcher?symbol=${encodeURIComponent(symbol)}&mode=${mode}&scope=${scope}`,
    [mode, scope],
  );

  if (error) return <ErrorState message={error} onRetry={refresh} />;
  if (loading && !data) return <Skeleton className="h-[30rem]" />;
  const r = data?.report;
  if (!r) return null;

  const buys = r.zones.filter((z) => z.side === "buy");
  const sells = r.zones.filter((z) => z.side === "sell");

  const draftFor = (z: WickZone): TradeDraft => ({
    symbol: r.symbol,
    direction: z.side === "buy" ? "long" : "short",
    entry: Number(z.entry.toFixed(r.precision)),
    stop: Number(z.stop.toFixed(r.precision)),
    target: Number((z.liquidityTarget && (z.liquidityRR ?? 0) >= 2 ? z.liquidityTarget : z.target).toFixed(r.precision)),
    strategy: "Wick Catch",
    reasons: `${z.side === "buy" ? "Buy" : "Sell"} zone (${z.confluence} reasons): ${z.levels.map((l) => l.label).join("; ")}. ${r.biasText}`,
  });

  return (
    <div className="space-y-6">
      <Panel className="overflow-hidden">
        <div className="gold-line" />
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="display text-3xl font-extrabold tracking-tight">{r.symbol}</h2>
              <DirectionBadge direction={r.bias} />
              {r.demo ? <span className="text-[10px] uppercase tracking-widest text-gold">Demo data</span> : null}
            </div>
            <div className="mt-1 text-sm uppercase tracking-widest text-mute">{r.name}</div>
            <div className="ticker display mt-4 text-3xl font-bold">{fmtPrice(r.price, r.precision)}</div>
            <p className="mt-3 max-w-xl text-sm text-mute">{r.biasText}</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] uppercase tracking-widest text-faint">
              <span>Daily ATR <span className="ticker text-bone">{r.atrDaily != null ? `${(r.atrDaily / r.pipSize).toFixed(0)} ${r.pipUnit}` : "—"}</span></span>
              <span>4H ATR <span className="ticker text-bone">{r.atr4h != null ? `${(r.atr4h / r.pipSize).toFixed(0)} ${r.pipUnit}` : "—"}</span></span>
              <span>Updated {timeAgo(r.generatedAt)}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/markets/${encodeURIComponent(r.symbol)}`}><GhostButton>Chart & full analysis</GhostButton></Link>
              <Link href={`/momentum`}><GhostButton>MD Momentum</GhostButton></Link>
            </div>
          </div>
          <Ladder report={r} />
        </div>
      </Panel>

      {r.zones.length === 0 ? (
        <EmptyState title="No zones in reach" message="No tracked level sits within three daily ATRs of price. That usually means price is in open space — wait for structure to form." />
      ) : (
        // The with-trend side leads; in a bearish market that is the sell side.
        <div className="grid gap-6 lg:grid-cols-2">
          {(r.bias === "bearish"
            ? [["Sell zones — above price", sells], ["Buy zones — below price", buys]] as const
            : [["Buy zones — below price", buys], ["Sell zones — above price", sells]] as const
          ).map(([title, zones]) => (
            <ZoneColumn key={title} title={title} zones={zones} report={r} onLog={(z) => setLogging(draftFor(z))} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-faint">
        Zones are algorithmic levels for planning entries, not predictions or signals. Confirm them on your own chart, and size every trade from the stop.
      </p>

      {logging ? <LogTradeModal initial={logging} onClose={() => setLogging(null)} /> : null}
    </div>
  );
}

function ZoneColumn({ title, zones, report, onLog }: { title: string; zones: WickZone[]; report: WickReport; onLog: (z: WickZone) => void }) {
  return (
    <section>
      <Eyebrow className="mb-3">{title}</Eyebrow>
      {zones.length === 0 ? (
        <p className="panel-flat px-4 py-6 text-sm text-mute">Nothing in reach on this side.</p>
      ) : (
        <div className="space-y-3">
          {zones.map((z) => <ZoneCard key={z.id} zone={z} report={report} onLog={() => onLog(z)} />)}
        </div>
      )}
    </section>
  );
}

function ZoneCard({ zone: z, report: r, onLog }: { zone: WickZone; report: WickReport; onLog: () => void }) {
  const p = r.precision;
  const unit = r.pipUnit;
  return (
    <Panel className={`p-4 ${z.aligned ? (z.side === "buy" ? "border-bull/30" : "border-bear/30") : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`display text-sm font-extrabold uppercase tracking-widest ${z.side === "buy" ? "text-bull" : "text-bear"}`}>{z.side} limit</span>
            <span className="ticker display text-lg font-bold">{fmtPrice(z.entry, p)}</span>
            <span className={`text-[10px] uppercase tracking-widest ${z.aligned ? "text-bull" : "text-faint"}`}>{z.aligned ? "With the trend" : "Counter-trend"}</span>
          </div>
          <div className="ticker mt-0.5 text-[11px] text-faint">
            Zone {fmtPrice(z.low, p)} – {fmtPrice(z.high, p)} · {z.distancePips.toFixed(0)} {unit} away ({z.distanceAtr.toFixed(2)}× daily ATR)
          </div>
        </div>
        <StatusTag status={z.status} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 border-y border-hairline-soft py-3 text-xs">
        <div>
          <div className="text-faint">Stop</div>
          <div className="ticker mt-0.5 text-bear">{fmtPrice(z.stop, p)}</div>
          <div className="ticker text-[10px] text-faint">{z.stopPips.toFixed(1)} {unit}</div>
        </div>
        <div>
          <div className="text-faint">Target 2R</div>
          <div className="ticker mt-0.5 text-bull">{fmtPrice(z.target, p)}</div>
        </div>
        <div>
          <div className="text-faint">Liquidity target</div>
          <div className="ticker mt-0.5">{z.liquidityTarget != null ? fmtPrice(z.liquidityTarget, p) : "—"}</div>
          <div className="ticker text-[10px] text-faint">{z.liquidityRR != null ? `${z.liquidityRR.toFixed(1)}R` : ""}</div>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-baseline justify-between text-[10px] uppercase tracking-widest">
          <span className="text-faint">{z.confluence} reason{z.confluence > 1 ? "s" : ""} at this price</span>
          <span className="ticker text-gold">Strength {z.score}</span>
        </div>
        <Bar value={z.score / 100} tone={z.aligned ? (z.side === "buy" ? "bull" : "bear") : "flat"} />
        <ul className="mt-2 space-y-0.5">
          {z.levels.map((l, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-mute">{l.label}</span>
              <span className="ticker text-faint">{fmtPrice(l.price, p)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <GoldButton onClick={onLog} className="px-4 py-2">Plan this trade</GoldButton>
        <Link href={`/calculator?symbol=${encodeURIComponent(r.symbol)}&stop=${z.stopPips.toFixed(1)}`}><GhostButton>Size it</GhostButton></Link>
      </div>
    </Panel>
  );
}

function StatusTag({ status }: { status: WickZone["status"] }) {
  const map = {
    "in-zone": "border-gold bg-gold/15 text-gold",
    tapped: "border-bull/40 text-bull",
    waiting: "border-hairline text-faint",
  } as const;
  const label = { "in-zone": "In zone now", tapped: "Tapped today", waiting: "Waiting" }[status];
  return <span className={`inline-block whitespace-nowrap border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${map[status]}`}>{label}</span>;
}

function ZoneStrength({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1"><Bar value={score / 100} /></div>
      <span className="ticker w-6 text-right text-xs text-gold">{score}</span>
    </div>
  );
}

/** A vertical price ladder: zones as bands, price as a line, nearest levels labelled. */
function Ladder({ report: r }: { report: WickReport }) {
  const H = 300;
  const W = 220;
  const prices = [r.price, ...r.zones.flatMap((z) => [z.low, z.high, z.stop])];
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const pad = (hi - lo) * 0.06 || r.price * 0.001;
  const min = lo - pad;
  const max = hi + pad;
  const y = (v: number) => ((max - v) / (max - min)) * H;
  const priceY = y(r.price);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="mx-auto shrink-0" role="img" aria-label={`Price ladder for ${r.symbol}`}>
      <line x1={40} x2={40} y1={0} y2={H} stroke="var(--color-hairline)" />
      {r.zones.map((z) => {
        const top = y(z.high);
        const h = Math.max(3, y(z.low) - top);
        const color = z.side === "buy" ? "var(--color-bull)" : "var(--color-bear)";
        return (
          <g key={z.id} opacity={z.aligned ? 1 : 0.45}>
            <rect x={44} y={top} width={W - 110} height={h} fill={color} opacity={0.18 + (z.score / 100) * 0.3} />
            <line x1={44} x2={W - 66} y1={y(z.entry)} y2={y(z.entry)} stroke={color} strokeWidth={1.5} />
            <line x1={44} x2={W - 66} y1={y(z.stop)} y2={y(z.stop)} stroke={color} strokeDasharray="2 3" opacity={0.6} />
            <text x={W - 62} y={y(z.entry) + 3} fontSize={9} fill={color} fontFamily="var(--font-mono)">{fmtPrice(z.entry, r.precision)}</text>
          </g>
        );
      })}
      <line x1={0} x2={W} y1={priceY} y2={priceY} stroke="var(--color-gold)" strokeWidth={1.5} />
      <rect x={0} y={priceY - 8} width={38} height={16} fill="var(--color-gold)" />
      <text x={19} y={priceY + 3.5} fontSize={8} textAnchor="middle" fill="var(--color-void)" fontWeight={700} fontFamily="var(--font-display)">PRICE</text>
    </svg>
  );
}

"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi, useTicker } from "@/lib/hooks";
import { useTrendScope } from "@/lib/useTrendScope";
import type { MdMomentumResult } from "@/lib/engine/mdMomentum";
import type { MeterTimeframe, MomentumMeter, Verdict } from "@/lib/engine/momentumMeter";
import type { AssetAnalysis, Direction } from "@/lib/types";
import { Paywall } from "@/components/paywall";
import { ScoreMeter } from "@/components/score";
import { ErrorState, Eyebrow, GhostButton, Panel, SectionHeading, Skeleton } from "@/components/primitives";
import {
  DailyPullback, MiniGauge, MomentumGauge, PushArrow, PushTrail, RoomBar, RunwayStrip, SourceBars, TimeframeStack, VerdictCard,
  VerdictTag, WeeklyStory,
} from "@/components/momentum-meter";
import { fmtPrice, fmtSigned, timeAgo } from "@/lib/utils/format";
import { getAsset } from "@/lib/data/universe";
import { BackButton } from "@/components/back-button";
import { useShellBack } from "@/lib/shellBack";

const GROUPS = ["All", "Forex Majors", "Forex Minors", "Index Futures", "Metals", "Energy"];
/** The board is ranked by setup, then by push, so the top of it is what matters. */
const FIRST = 12;
/** How often the open meter re-reads the feed. */
const LIVE_MS = 10_000;

interface BoardMeter {
  push: number;
  pushLabel: string;
  side: Direction;
  verdict: Verdict;
  verdictTitle: string;
  aligned: number;
  prevWeek: string | null;
  pullback: string | null;
  timeframes: { timeframe: MeterTimeframe; push: number }[];
}
type BoardRow = MdMomentumResult & { meter: BoardMeter };

const VERDICT_ORDER: Verdict[] = ["in-play", "pullback", "waiting", "not-this-week", "no-data"];
const VERDICT_NAME: Record<Verdict, string> = {
  "in-play": "In play",
  pullback: "Pullback forming",
  waiting: "Waiting for pullback",
  "not-this-week": "Not this week",
  "no-data": "No data",
};

function labelFor(push: number) {
  if (push >= 55) return "Pushing up strongly";
  if (push >= 20) return "Pushing up";
  if (push > -20) return "Stalling";
  if (push > -55) return "Pushing down";
  return "Pushing down strongly";
}

export default function MomentumPage() {
  // The selected market lives in the URL (?symbol=), so the tab, the back
  // button and a shared link all land on the right view.
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-6xl" />}>
      <Momentum />
    </Suspense>
  );
}

/** The market last opened from the board, highlighted when the trader comes back. */
let lastOpened: string | null = null;

function Momentum() {
  const params = useSearchParams();
  const router = useRouter();
  const raw = params.get("symbol");
  const symbol = raw ? getAsset(raw)?.symbol ?? raw : null;
  useShellBack(symbol ? "/momentum" : null);

  const open = (s: string) => {
    lastOpened = s;
    router.push(`/momentum?symbol=${encodeURIComponent(s)}`);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {symbol ? <BackButton fallback="/momentum" label="MD Momentum" desktopOnly /> : null}
      <SectionHeading
        title={symbol ? "Momentum Meter" : "MD Momentum"}
        subtitle={
          symbol
            ? "Is there enough momentum behind last week's candle for this week's wick to be caught and pushed on?"
            : "Every market against the strategy: weekly side, last week's momentum candle, the daily pullback, and the turn."
        }
      />
      {symbol ? <MeterView symbol={symbol} /> : <Board onOpen={open} />}
    </div>
  );
}

/* ----------------------------------- board ----------------------------------- */

function Board({ onOpen }: { onOpen: (s: string) => void }) {
  const [scope] = useTrendScope();
  const [group, setGroup] = useState("All");
  const [verdict, setVerdict] = useState<Verdict | "all">("all");
  const [showAll, setShowAll] = useState(false);
  const board = useApi<{ results: BoardRow[]; demo: boolean; generatedAt: number }>(`/api/momentum?scope=${scope}`, [scope]);

  const counts = useMemo(() => {
    const c: Partial<Record<Verdict, number>> = {};
    for (const r of board.data?.results ?? []) {
      if (group !== "All" && getAsset(r.symbol)?.group !== group) continue;
      c[r.meter.verdict] = (c[r.meter.verdict] ?? 0) + 1;
    }
    return c;
  }, [board.data, group]);

  const rows = useMemo(
    () =>
      (board.data?.results ?? [])
        .filter((r) => (group === "All" || getAsset(r.symbol)?.group === group) && (verdict === "all" || r.meter.verdict === verdict))
        .sort(
          (a, b) =>
            VERDICT_ORDER.indexOf(a.meter.verdict) - VERDICT_ORDER.indexOf(b.meter.verdict) ||
            Math.abs(b.meter.push) - Math.abs(a.meter.push),
        ),
    [board.data, group, verdict],
  );
  // Coming back from a market beyond the first twelve keeps it on the board.
  const lastIndex = lastOpened ? rows.findIndex((r) => r.symbol === lastOpened) : -1;
  const shown = showAll || lastIndex >= FIRST ? rows : rows.slice(0, FIRST);

  if (board.upgrade) return <Paywall requiredTier={board.upgrade.requiredTier} featureName="MD Momentum Mode" />;

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["in-play", "pullback", "waiting", "not-this-week"] as Verdict[]).map((v) => (
          <button
            key={v}
            onClick={() => { setVerdict(verdict === v ? "all" : v); setShowAll(false); }}
            className={`border p-3 text-left transition ${verdict === v ? "border-gold bg-gold/10" : "border-hairline-soft bg-panel hover:border-hairline"}`}
          >
            <div className="flex items-center justify-between">
              <VerdictTag verdict={v} />
              <span className="ticker display text-2xl font-extrabold">{counts[v] ?? 0}</span>
            </div>
            <div className="mt-1.5 text-[11px] text-faint">{VERDICT_NAME[v]}</div>
          </button>
        ))}
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1 whitespace-nowrap">
          {GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => { setGroup(g); setShowAll(false); }}
              className={`border px-3 py-1.5 font-display text-[10px] font-semibold uppercase tracking-widest ${group === g ? "border-gold bg-gold text-void" : "border-hairline text-mute hover:text-gold"}`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {board.error ? <ErrorState message={board.error} onRetry={board.refresh} /> : null}
      {board.loading && !board.data ? (
        <Skeleton className="h-96" />
      ) : (
        <Panel>
          <div className="hidden grid-cols-[76px_1.3fr_1fr_150px_120px] gap-3 border-b border-hairline px-4 py-2.5 text-[10px] uppercase tracking-widest text-faint md:grid">
            <span>Push</span><span>Market</span><span>Momentum</span><span>W · D · 4H · 1H · 15 · 5</span><span className="text-right">MD score</span>
          </div>
          {shown.map((r) => (
            <button
              key={r.symbol}
              onClick={() => onOpen(r.symbol)}
              className={`grid w-full grid-cols-[68px_1fr_auto] items-center gap-3 border-b border-hairline-soft px-3 py-2.5 text-left transition last:border-b-0 hover:bg-panel-2 md:grid-cols-[76px_1.3fr_1fr_150px_120px] md:px-4 ${
                r.symbol === lastOpened ? "bg-gold/5 shadow-[inset_3px_0_0_var(--color-gold)]" : ""
              }`}
            >
              <MiniGauge value={r.meter.push} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="display text-sm font-bold">{r.symbol}</span>
                  <VerdictTag verdict={r.meter.verdict} />
                </div>
                <div className="truncate text-[10px] uppercase tracking-widest text-faint">
                  {r.meter.prevWeek ? `Last week ${r.meter.prevWeek.toLowerCase()}` : r.name}
                  {r.meter.pullback && r.meter.pullback !== "none" ? ` · pullback ${r.meter.pullback}` : ""}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 md:justify-start">
                <PushArrow value={r.meter.push} className="h-5 w-5" />
                <div className="text-right md:text-left">
                  <div className={`ticker display text-base font-extrabold ${r.meter.push >= 20 ? "text-bull" : r.meter.push <= -20 ? "text-bear" : "text-gold"}`}>
                    {fmtSigned(r.meter.push, 0)}
                  </div>
                  <div className="hidden text-[10px] uppercase tracking-widest text-faint sm:block">{r.meter.pushLabel}</div>
                </div>
              </div>
              <div className="hidden items-end gap-1 md:flex" aria-label="Push by timeframe">
                {r.meter.timeframes.map((t) => (
                  <span key={t.timeframe} className="relative block h-8 w-4 bg-ink" title={`${t.timeframe} ${t.push}`}>
                    <span className="absolute inset-x-0 top-1/2 h-px bg-hairline" />
                    <span
                      className="absolute inset-x-0"
                      style={{
                        height: `${Math.min(50, Math.abs(t.push) / 2)}%`,
                        [t.push >= 0 ? "bottom" : "top"]: "50%",
                        background: t.push >= 20 ? "var(--color-bull)" : t.push <= -20 ? "var(--color-bear)" : "var(--color-gold)",
                      }}
                    />
                  </span>
                ))}
              </div>
              <div className="hidden md:block"><ScoreMeter score={r.score} direction={r.direction} /></div>
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
          {rows.length === 0 ? <p className="px-4 py-8 text-center text-sm text-mute">No markets in this group match that filter right now.</p> : null}
        </Panel>
      )}
      {board.data ? (
        <p className="text-right text-[10px] uppercase tracking-widest text-faint">Updated {timeAgo(board.data.generatedAt)}{board.data.demo ? " · demo data" : ""}</p>
      ) : null}
    </>
  );
}

/* ----------------------------------- meter ----------------------------------- */

function MeterView({ symbol }: { symbol: string }) {
  const [scope] = useTrendScope();
  const full = useApi<{ analysis: AssetAnalysis; momentum: MdMomentumResult; meter: MomentumMeter }>(
    `/api/momentum?symbol=${encodeURIComponent(symbol)}&scope=${scope}`,
    [scope],
  );
  const [live, setLive] = useState<{ meter: MomentumMeter; at: number } | null>(null);
  const [tf, setTf] = useState<MeterTimeframe | "MD">("MD");
  const [showChecklist, setShowChecklist] = useState(false);
  useTicker(1000);

  // The live poll: only the meter, every few seconds, while the page is visible.
  useEffect(() => {
    setLive(null);
    let cancelled = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/momentum?symbol=${encodeURIComponent(symbol)}&scope=${scope}&meterOnly=1`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.meter) setLive({ meter: json.meter, at: Date.now() });
      } catch {
        /* the last reading stays on screen */
      }
    };
    const id = setInterval(tick, LIVE_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [symbol, scope]);

  if (full.error) return <ErrorState message={full.error} onRetry={full.refresh} />;
  if (full.loading && !full.data) return <Skeleton className="h-[40rem]" />;
  if (!full.data) return null;

  const meter = live?.meter ?? full.data.meter;
  const updatedAt = live?.at ?? full.fetchedAt ?? Date.now();
  const sel = tf === "MD" ? null : meter.timeframes.find((t) => t.timeframe === tf) ?? null;
  const value = sel ? sel.push : meter.push;
  const dir = meter.side === "bearish" ? -1 : 1;
  const dWord = dir < 0 ? "down" : "up";
  const p = meter.precision;
  const glow = value >= 20 ? "rgba(52,211,153,0.10)" : value <= -20 ? "rgba(240,90,90,0.10)" : "rgba(201,162,39,0.07)";

  return (
    <div className="space-y-6">
      {/* ------------------------------- hero ------------------------------- */}
      <Panel className="overflow-hidden">
        <div className="gold-line" />
        <div className="p-5 sm:p-6" style={{ background: `radial-gradient(120% 80% at 25% 100%, ${glow}, transparent 70%)` }}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="display text-3xl font-extrabold tracking-tight">{meter.symbol}</h2>
                <span className={`border px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-widest ${meter.side === "bullish" ? "border-bull/40 text-bull" : meter.side === "bearish" ? "border-bear/40 text-bear" : "border-hairline text-mute"}`}>
                  Weekly side · {meter.side === "bullish" ? "buys" : meter.side === "bearish" ? "sells" : "none"}
                </span>
              </div>
              <div className="mt-1 text-xs uppercase tracking-widest text-mute">{meter.name}</div>
            </div>
            <div className="text-right">
              <div className="ticker display text-2xl font-bold">{fmtPrice(meter.price, p)}</div>
              <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[10px] uppercase tracking-widest text-faint">
                <span className={`live-dot h-1.5 w-1.5 ${meter.demo ? "bg-gold" : "bg-bull"}`} />
                {meter.demo ? "Demo data" : "Live"} · updated {timeAgo(updatedAt)}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-start">
            <div>
              <div className="relative mx-auto max-w-[460px]">
                <MomentumGauge value={value} label={labelFor(value)} caption={sel ? `${sel.timeframe} momentum` : "MD momentum · all timeframes"} />
              </div>
              <div className="mt-3 flex justify-center gap-1">
                {(["MD", "1W", "1D", "4H", "1H", "15M", "5M"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setTf(k)}
                    className={`min-w-0 flex-1 border px-1 py-1.5 font-display text-[11px] font-bold uppercase tracking-wider transition sm:max-w-14 ${tf === k ? "border-gold bg-gold text-void" : "border-hairline text-mute hover:border-gold hover:text-gold"}`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              {sel && sel.trail.length ? (
                <div className="mt-3">
                  <PushTrail values={sel.trail} />
                  <div className="flex justify-between text-[10px] uppercase tracking-widest text-faint">
                    <span>Last {sel.trail.length} {sel.timeframe} bars</span>
                    <span>{sel.pace} · RSI {sel.rsi?.toFixed(0) ?? "—"} · MACD {sel.macd ?? "—"}</span>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-center text-[11px] text-faint">
                  The higher timeframes move the needle slowly; pick 15M or 5M to watch it move with price.
                </p>
              )}
              <div className="mt-4">
                <RunwayStrip duration={meter.duration} symbol={meter.symbol} />
              </div>
            </div>
            <VerdictCard meter={meter} />
          </div>
        </div>
      </Panel>

      {/* --------------------------- where it comes from --------------------------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <Eyebrow>Momentum on every timeframe</Eyebrow>
            <span className="text-[11px] text-mute">
              <span className={`ticker font-bold ${dir < 0 ? "text-bear" : "text-bull"}`}>{meter.aligned} of 6</span> pushing {dWord}
            </span>
          </div>
          <TimeframeStack timeframes={meter.timeframes} selected={tf} onSelect={setTf} />
          <p className="mt-3 text-[11px] text-faint">Each bar is that timeframe on its own scale — RSI, MACD and the last 10 bars, measured in that timeframe&apos;s ATR. Tap one to put it on the gauge.</p>
        </Panel>
        <Panel className="p-5">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <Eyebrow>Where the push comes from</Eyebrow>
            <span className={`ticker display text-sm font-bold ${meter.push >= 20 ? "text-bull" : meter.push <= -20 ? "text-bear" : "text-gold"}`}>
              {fmtSigned(meter.push, 0)} total
            </span>
          </div>
          <SourceBars sources={meter.sources} />
        </Panel>
      </div>

      {/* ------------------------------ the strategy ------------------------------ */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <Eyebrow className="mb-1">Last week&apos;s momentum candle</Eyebrow>
          <p className="mb-3 text-xs text-mute">
            {meter.prevWeek
              ? `${meter.prevWeek.size} ${meter.prevWeek.direction} candle — body ${meter.prevWeek.bodyAtr.toFixed(2)}× the weekly ATR, closed ${Math.round(meter.prevWeek.closeLocation * 100)}% toward its ${meter.prevWeek.direction === "bearish" ? "low" : "high"}.`
              : "Weekly history unavailable."}
          </p>
          <WeeklyStory meter={meter} />
        </Panel>
        <Panel className="p-5">
          <Eyebrow className="mb-1">This week&apos;s daily pullback</Eyebrow>
          <p className="mb-3 text-xs text-mute">
            {meter.pullback
              ? meter.pullback.status === "none"
                ? "No pullback into last week's candle yet."
                : `Pulled back ${Math.round(Math.max(0, meter.pullback.depth) * 100)}% into last week's range at its furthest; ${meter.pullback.nowDepth <= 0 ? `price has since pushed back through last week's ${meter.side === "bearish" ? "low" : "high"}` : `price is ${Math.round(meter.pullback.nowDepth * 100)}% in now`}.`
              : "Daily history unavailable."}
          </p>
          <DailyPullback meter={meter} />
        </Panel>
      </div>

      {/* -------------------------------- the why -------------------------------- */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel className="p-5">
          <Eyebrow className="mb-3">Why momentum is {meter.push >= 20 ? "pushing up" : meter.push <= -20 ? "pushing down" : "stalling"}</Eyebrow>
          <ol className="space-y-3">
            {meter.why.map((w, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="display flex h-6 w-6 shrink-0 items-center justify-center border border-gold/50 text-[11px] font-bold text-gold">{i + 1}</span>
                <span className="text-bone/90">{w}</span>
              </li>
            ))}
          </ol>
        </Panel>
        <div className="space-y-6">
          <Panel className="space-y-4 p-5">
            <Eyebrow>Room to run</Eyebrow>
            <RoomBar label="This week vs its average range" used={meter.volatility.weekUsed} />
            <RoomBar label="Today vs its average daily range" used={meter.volatility.dayUsed} />
          </Panel>
          <Panel className="p-5">
            <Eyebrow className="mb-2">What would stop it</Eyebrow>
            <ul className="space-y-2">
              {meter.risks.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm text-mute"><span className="mt-2 h-1 w-1 shrink-0 bg-bear" />{r}</li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <BackButton fallback="/momentum" label="All markets" />
        <Link href={`/wick-catcher?symbol=${encodeURIComponent(meter.symbol)}`}><GhostButton>Wick zones for {meter.symbol}</GhostButton></Link>
        <Link href={`/markets/${encodeURIComponent(meter.symbol)}`}><GhostButton>Chart &amp; full analysis</GhostButton></Link>
        <GhostButton onClick={() => setShowChecklist(!showChecklist)}>{showChecklist ? "Hide" : "Show"} MD Momentum checklist</GhostButton>
      </div>

      {showChecklist ? <Checklist result={full.data.momentum} /> : null}

      <p className="text-[11px] text-faint">
        The meter measures momentum in the evidence that exists right now. It is not a forecast or a signal, and it does not know about news.
      </p>
    </div>
  );
}

function Checklist({ result }: { result: MdMomentumResult }) {
  return (
    <Panel>
      <div className="flex items-center justify-between border-b border-hairline-soft px-4 py-3">
        <Eyebrow>The MD Momentum checklist</Eyebrow>
        <span className="text-xs text-mute">MD Momentum Score <span className="ticker font-bold text-bone">{result.score}</span></span>
      </div>
      {result.checks.map((c) => (
        <div key={c.key} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-hairline-soft px-4 py-3 last:border-b-0">
          <span className={`h-2.5 w-2.5 shrink-0 ${c.state === "bullish" ? "bg-bull" : c.state === "bearish" ? "bg-bear" : "bg-flat"}`} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-display text-xs font-semibold uppercase tracking-widest">{c.label}</span>
              <span className={`text-xs ${c.state === "bullish" ? "text-bull" : c.state === "bearish" ? "text-bear" : "text-mute"}`}>{c.value}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-faint">{c.detail}</p>
          </div>
          <div className="text-right">
            <div className={`ticker text-sm font-semibold ${c.contribution >= 0 ? "text-bull" : "text-bear"}`}>{fmtSigned(c.contribution, 1)}</div>
            <div className="text-[10px] uppercase tracking-widest text-faint">weight {c.weight}</div>
          </div>
        </div>
      ))}
    </Panel>
  );
}

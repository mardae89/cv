"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { useTrendScope } from "@/lib/useTrendScope";
import type { MdMomentumResult } from "@/lib/engine/mdMomentum";
import type { AssetAnalysis } from "@/lib/types";
import { Paywall } from "@/components/paywall";
import { ScoreDial, ScoreMeter } from "@/components/score";
import {
  DirectionBadge, ErrorState, Eyebrow, Panel, SectionHeading, Skeleton, TrendScopeSwitch,
} from "@/components/primitives";
import { fmtSigned } from "@/lib/utils/format";
import { getAsset } from "@/lib/data/universe";

const GROUPS = ["All", "Forex Majors", "Forex Minors", "Index Futures", "Metals", "Energy"];
/** The board is ranked strongest first, so the top of it is what matters. */
const FIRST = 12;

export default function MomentumPage() {
  const [symbol, setSymbol] = useState<string | null>(null);
  const [group, setGroup] = useState("All");
  const [showAll, setShowAll] = useState(false);
  const [scope, setScope] = useTrendScope();
  const board = useApi<{ results: MdMomentumResult[]; demo: boolean }>(
    symbol ? null : `/api/momentum?scope=${scope}`,
    [scope],
  );
  const detail = useApi<{ analysis: AssetAnalysis; momentum: MdMomentumResult }>(
    symbol ? `/api/momentum?symbol=${encodeURIComponent(symbol)}&scope=${scope}` : null,
    [scope],
  );

  const results = (board.data?.results ?? []).filter((r) => group === "All" || getAsset(r.symbol)?.group === group);
  const shown = showAll ? results : results.slice(0, FIRST);

  const up = board.upgrade ?? detail.upgrade;
  if (up) return <Paywall requiredTier={up.requiredTier} featureName="MD Momentum Mode" />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionHeading
        title="MD Momentum"
        subtitle="Higher-timeframe momentum continuation. The weekly leads, the daily and 4H must not contradict it, the 1H only confirms."
        action={symbol ? (
          <button onClick={() => setSymbol(null)} className="text-xs uppercase tracking-widest text-gold hover:underline">
            ← Back to board
          </button>
        ) : undefined}
      />

      <TrendScopeSwitch scope={scope} onChange={setScope} />

      <div className="border border-hairline-soft bg-ink px-4 py-3 text-xs text-mute">
        This is a configurable model of the strategy, not a hard rule set. Each check produces a reading between −1 and +1, and the weights in{" "}
        <code className="text-bone">MD_MOMENTUM_RULES</code> decide how much each one matters. No single check is treated as a signal on its own.
      </div>

      {!symbol ? (
        <>
          <GroupChips value={group} onChange={(g) => { setGroup(g); setShowAll(false); }} />
          {board.error ? <ErrorState message={board.error} onRetry={board.refresh} /> : null}
          {board.loading && !board.data ? (
            <Skeleton className="h-96" />
          ) : (
            <Panel>
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-hairline px-4 py-2.5 text-[10px] uppercase tracking-widest text-faint sm:grid-cols-[1fr_120px_140px_90px]">
                <span>Market</span>
                <span className="hidden sm:block">Checks aligned</span>
                <span>MD Momentum</span>
                <span className="text-right">Direction</span>
              </div>
              {shown.map((r) => (
                <button
                  key={r.symbol}
                  onClick={() => setSymbol(r.symbol)}
                  className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-hairline-soft px-4 py-3 text-left transition last:border-b-0 hover:bg-panel-2 sm:grid-cols-[1fr_120px_140px_90px]"
                >
                  <div className="min-w-0">
                    <div className="display text-sm font-semibold">{r.symbol}</div>
                    <div className="truncate text-[10px] uppercase tracking-widest text-faint">{r.name}</div>
                  </div>
                  <div className="ticker hidden text-xs text-mute sm:block">{r.aligned} / {r.total}</div>
                  <ScoreMeter score={r.score} direction={r.direction} />
                  <div className="text-right"><DirectionBadge direction={r.direction} small /></div>
                </button>
              ))}
              {results.length > FIRST ? (
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="w-full border-t border-hairline px-4 py-3 text-center text-[10px] uppercase tracking-widest text-gold hover:bg-panel-2"
                >
                  {showAll ? `Show the strongest ${FIRST} only` : `Show all ${results.length} markets`}
                </button>
              ) : null}
            </Panel>
          )}
        </>
      ) : detail.loading && !detail.data ? (
        <Skeleton className="h-96" />
      ) : detail.error ? (
        <ErrorState message={detail.error} onRetry={detail.refresh} />
      ) : detail.data ? (
        <MomentumDetail result={detail.data.momentum} />
      ) : null}
    </div>
  );
}

function MomentumDetail({ result }: { result: MdMomentumResult }) {
  return (
    <div className="space-y-5">
      <Panel className="overflow-hidden">
        <div className="gold-line" />
        <div className="grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:items-center">
          <ScoreDial score={result.score} direction={result.direction} size={180} label="MD Momentum Score" />
          <div>
            <h2 className="display text-2xl font-extrabold tracking-tight">{result.symbol}</h2>
            <div className="text-sm uppercase tracking-widest text-mute">{result.name}</div>
            <div className="mt-3"><DirectionBadge direction={result.direction} /></div>
            <p className="mt-3 max-w-lg text-sm text-mute">{result.summary}</p>
            <div className="mt-3 flex flex-wrap gap-4">
              <Link
                href={`/wick-catcher?symbol=${encodeURIComponent(result.symbol)}`}
                className="text-xs uppercase tracking-widest text-gold hover:underline"
              >
                Where to enter — wick zones →
              </Link>
              <Link
                href={`/markets/${encodeURIComponent(result.symbol)}`}
                className="text-xs uppercase tracking-widest text-gold hover:underline"
              >
                Full market analysis →
              </Link>
            </div>
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="border-b border-hairline-soft px-4 py-3">
          <Eyebrow>The MD Momentum checklist</Eyebrow>
        </div>
        {result.checks.map((c) => (
          <div key={c.key} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-hairline-soft px-4 py-3 last:border-b-0">
            <span className={`h-2.5 w-2.5 shrink-0 ${
              c.state === "bullish" ? "bg-bull" : c.state === "bearish" ? "bg-bear" : "bg-flat"
            }`} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-display text-xs font-semibold uppercase tracking-widest">{c.label}</span>
                <span className={`text-xs ${
                  c.state === "bullish" ? "text-bull" : c.state === "bearish" ? "text-bear" : "text-mute"
                }`}>
                  {c.value}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-faint">{c.detail}</p>
            </div>
            <div className="text-right">
              <div className={`ticker text-sm font-semibold ${c.contribution >= 0 ? "text-bull" : "text-bear"}`}>
                {fmtSigned(c.contribution, 1)}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-faint">weight {c.weight}</div>
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function GroupChips({ value, onChange }: { value: string; onChange: (g: string) => void }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-1 whitespace-nowrap">
        {GROUPS.map((g) => (
          <button
            key={g}
            onClick={() => onChange(g)}
            className={`border px-3 py-1.5 font-display text-[10px] font-semibold uppercase tracking-widest ${value === g ? "border-gold bg-gold text-void" : "border-hairline text-mute hover:text-gold"}`}
          >
            {g}
          </button>
        ))}
      </div>
    </div>
  );
}

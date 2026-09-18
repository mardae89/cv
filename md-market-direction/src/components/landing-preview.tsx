"use client";

import { useApi } from "@/lib/hooks";
import type { GlobalDirection, ScannerRow } from "@/lib/types";
import { ScoreDial, ScoreMeter } from "@/components/score";
import { Skeleton } from "@/components/primitives";

/**
 * The landing hero shows the REAL dashboard, running the real engine — the
 * product sells itself better than a screenshot does.
 */
export function LandingPreview() {
  const { data, loading } = useApi<{
    global: GlobalDirection; bullish: ScannerRow[]; bearish: ScannerRow[]; demo: boolean;
  }>("/api/market-score");

  if (loading && !data) return <Skeleton className="h-[420px] w-full" />;
  if (!data) return null;

  const g = data.global;
  return (
    <div className="panel relative overflow-hidden">
      <div className="gold-line" />
      <div className="flex items-center justify-between border-b border-hairline-soft px-4 py-2.5">
        <span className="eyebrow">Global Market Direction</span>
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-faint">
          <span className="live-dot h-1.5 w-1.5 bg-gold" />
          {data.demo ? "Demo data" : "Live"}
        </span>
      </div>

      <div className="grid gap-6 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex flex-col items-center">
          <ScoreDial score={g.score} direction={g.direction} size={160} />
          <div className={`mt-2 display text-xl font-extrabold uppercase ${
            g.direction === "bullish" ? "text-bull" : g.direction === "bearish" ? "text-bear" : "text-flat"
          }`}>
            {g.direction}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-mute">{g.label}</div>
        </div>
        <div className="space-y-1.5">
          {g.groups.map((group) => (
            <div key={group.group} className="flex items-center justify-between gap-3 border-b border-hairline-soft pb-1.5 text-sm">
              <span className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 ${
                  group.direction === "bullish" ? "bg-bull" : group.direction === "bearish" ? "bg-bear" : "bg-flat"
                }`} />
                {group.group}
              </span>
              <span className={`text-[11px] uppercase tracking-widest ${
                group.direction === "bullish" ? "text-bull" : group.direction === "bearish" ? "text-bear" : "text-flat"
              }`}>
                {group.direction} {group.score}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-px bg-hairline-soft sm:grid-cols-2">
        <div className="bg-panel p-4">
          <div className="eyebrow mb-2 text-bull">Bullish radar</div>
          {data.bullish.slice(0, 4).map((r) => (
            <div key={r.symbol} className="mb-2 flex items-center gap-3">
              <span className="w-20 shrink-0 font-display text-xs font-semibold">{r.symbol}</span>
              <ScoreMeter score={r.score} direction={r.direction} />
            </div>
          ))}
        </div>
        <div className="bg-panel p-4">
          <div className="eyebrow mb-2 text-bear">Bearish radar</div>
          {data.bearish.slice(0, 4).map((r) => (
            <div key={r.symbol} className="mb-2 flex items-center gap-3">
              <span className="w-20 shrink-0 font-display text-xs font-semibold">{r.symbol}</span>
              <ScoreMeter score={r.score} direction={r.direction} />
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-hairline-soft px-4 py-2 text-center text-[10px] uppercase tracking-widest text-faint">
        Market regime: <span className="text-gold">{g.regime.primary}</span>
      </div>
    </div>
  );
}

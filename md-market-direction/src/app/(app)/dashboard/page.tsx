"use client";

import Link from "next/link";
import { useApi, useTicker } from "@/lib/hooks";
import type { GlobalDirection, ScannerRow } from "@/lib/types";
import type { DailyBrief } from "@/lib/engine/brief";
import { ScoreDial } from "@/components/score";
import { MarketRow } from "@/components/market-card";
import {
  DirectionBadge, Eyebrow, Panel, SectionHeading, Skeleton, ErrorState, GhostButton, ImpactTag,
} from "@/components/primitives";
import { fmtSigned, timeAgo, untilLabel } from "@/lib/utils/format";
import { Icon } from "@/components/icons";

interface ScoreResponse {
  global: GlobalDirection;
  bullish: ScannerRow[];
  bearish: ScannerRow[];
  interesting: (ScannerRow & { aligned: number; agreement: number })[];
  demo: boolean;
  degraded: string[];
  generatedAt: number;
}

export default function DashboardPage() {
  useTicker(5000);
  const score = useApi<ScoreResponse>("/api/market-score");
  const brief = useApi<{ brief: DailyBrief }>("/api/brief");

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {score.error ? <ErrorState message={score.error} onRetry={score.refresh} /> : null}
      {score.data?.degraded?.length ? (
        <div className="border border-gold/30 bg-gold/5 px-4 py-2 text-xs text-gold">
          {score.data.degraded.join(" ")}
        </div>
      ) : null}

      {/* ------------------------- GLOBAL MARKET DIRECTION ------------------------- */}
      {score.loading && !score.data ? (
        <Skeleton className="h-64 w-full" />
      ) : score.data ? (
        <GlobalHero data={score.data} />
      ) : null}

      {/* -------------------------------- RADAR ---------------------------------- */}
      <section>
        <SectionHeading
          title="Market Radar"
          subtitle="Ranked by strength of directional evidence alignment."
          action={<Link href="/scanner"><GhostButton>Open scanner</GhostButton></Link>}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel>
            <div className="flex items-center justify-between border-b border-hairline-soft px-4 py-3">
              <Eyebrow className="text-bull">Bullish radar</Eyebrow>
              <span className="text-[10px] uppercase tracking-widest text-faint">MD Score</span>
            </div>
            {score.loading && !score.data ? (
              <Skeleton className="h-64" />
            ) : (
              score.data?.bullish.map((r) => (
                <MarketRow key={r.symbol} symbol={r.symbol} name={r.name} score={r.score} direction={r.direction} price={r.price} changePct={r.changePct} />
              ))
            )}
          </Panel>
          <Panel>
            <div className="flex items-center justify-between border-b border-hairline-soft px-4 py-3">
              <Eyebrow className="text-bear">Bearish radar</Eyebrow>
              <span className="text-[10px] uppercase tracking-widest text-faint">MD Score</span>
            </div>
            {score.loading && !score.data ? (
              <Skeleton className="h-64" />
            ) : (
              score.data?.bearish.map((r) => (
                <MarketRow key={r.symbol} symbol={r.symbol} name={r.name} score={r.score} direction={r.direction} price={r.price} changePct={r.changePct} />
              ))
            )}
          </Panel>
        </div>
      </section>

      {/* --------------------------- MOST INTERESTING ---------------------------- */}
      <section>
        <SectionHeading
          title="Most Interesting Markets"
          subtitle="Where the largest number of independent evidence categories agree."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {score.loading && !score.data
            ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)
            : score.data?.interesting.map((r) => (
                <Link key={r.symbol} href={`/markets/${encodeURIComponent(r.symbol)}`} className="panel p-4 transition hover:border-gold/40">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="display text-sm font-bold">{r.symbol}</div>
                      <div className="text-[10px] uppercase tracking-widest text-faint">{r.name}</div>
                    </div>
                    <DirectionBadge direction={r.direction} small />
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <div className="ticker display text-3xl font-bold">{r.score}</div>
                      <div className="text-[10px] uppercase tracking-widest text-faint">MD Direction Score</div>
                    </div>
                    <div className="text-right">
                      <div className="ticker text-lg font-semibold text-gold">{r.aligned}</div>
                      <div className="text-[10px] uppercase tracking-widest text-faint">factors aligned</div>
                    </div>
                  </div>
                </Link>
              ))}
        </div>
      </section>

      {/* ------------------------------ DAILY BRIEF ------------------------------- */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionHeading title="Daily Market Brief" subtitle="Everything that changed since yesterday, in one read." />
          {brief.loading && !brief.data ? (
            <Skeleton className="h-72" />
          ) : brief.error ? (
            <ErrorState message={brief.error} onRetry={brief.refresh} />
          ) : brief.data ? (
            <Brief brief={brief.data.brief} />
          ) : null}
        </div>

        <div className="space-y-4">
          <div>
            <SectionHeading title="Major Upcoming Events" />
            <Panel>
              {brief.data?.brief.events.length ? (
                brief.data.brief.events.map((e) => (
                  <div key={e.name + e.when} className="flex items-start justify-between gap-3 border-b border-hairline-soft px-4 py-3 last:border-b-0">
                    <div>
                      <div className="text-sm font-medium">{e.name}</div>
                      <div className="text-[11px] uppercase tracking-widest text-faint">{e.when}</div>
                    </div>
                    <ImpactTag impact={e.importance as "low" | "medium" | "high"} />
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-sm text-mute">No high-impact events in the next 36 hours.</div>
              )}
              <div className="border-t border-hairline-soft px-4 py-2">
                <Link href="/calendar" className="text-[10px] uppercase tracking-widest text-gold hover:underline">
                  Full economic calendar →
                </Link>
              </div>
            </Panel>
          </div>

          <div>
            <SectionHeading title="Breaking News" />
            <Panel>
              {brief.data?.brief.headlines.map((h, i) => (
                <div key={i} className="border-b border-hairline-soft px-4 py-3 last:border-b-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm leading-snug">{h.headline}</p>
                    <ImpactTag impact={h.impact as "low" | "medium" | "high"} />
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-widest text-faint">{h.source}</div>
                </div>
              ))}
              <div className="border-t border-hairline-soft px-4 py-2">
                <Link href="/news" className="text-[10px] uppercase tracking-widest text-gold hover:underline">
                  News intelligence →
                </Link>
              </div>
            </Panel>
          </div>
        </div>
      </section>
    </div>
  );
}

function GlobalHero({ data }: { data: ScoreResponse }) {
  const g = data.global;
  return (
    <section className="panel fade-up overflow-hidden">
      <div className="gold-line" />
      <div className="grid gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[auto_1fr] lg:items-center">
        <div className="flex flex-col items-center">
          <Eyebrow className="mb-4">Global Market Direction</Eyebrow>
          <ScoreDial score={g.score} direction={g.direction} size={220} />
          <div className="mt-4 text-center">
            <div className={`display text-3xl font-extrabold uppercase tracking-tight ${
              g.direction === "bullish" ? "text-bull" : g.direction === "bearish" ? "text-bear" : "text-flat"
            }`}>
              {g.direction}
            </div>
            <div className="mt-1 text-xs uppercase tracking-widest text-mute">{g.label}</div>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <Eyebrow className="mb-3">By asset group</Eyebrow>
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {g.groups.map((group) => (
                <div key={group.group} className="flex items-center justify-between border-b border-hairline-soft py-2">
                  <span className="flex items-center gap-2 text-sm">
                    <span className={`h-2 w-2 ${
                      group.direction === "bullish" ? "bg-bull" : group.direction === "bearish" ? "bg-bear" : "bg-flat"
                    }`} />
                    {group.group}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={`text-xs uppercase tracking-widest ${
                      group.direction === "bullish" ? "text-bull" : group.direction === "bearish" ? "text-bear" : "text-flat"
                    }`}>
                      {group.direction}
                    </span>
                    <span className="ticker w-7 text-right font-display text-sm font-bold">{group.score}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-hairline-soft bg-ink p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Eyebrow>Market regime</Eyebrow>
              <span className="display border border-gold/40 bg-gold/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-gold">
                {g.regime.primary}
              </span>
              {g.regime.secondary.map((s) => (
                <span key={s} className="border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-widest text-mute">
                  {s}
                </span>
              ))}
            </div>
            <p className="mt-2 text-sm text-mute">{g.regime.explanation}</p>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
              {g.regime.metrics.map((m) => (
                <div key={m.label} className="flex items-baseline justify-between text-xs">
                  <span className="text-faint">{m.label}</span>
                  <span className="ticker">{m.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-widest text-faint">
            <span className="flex items-center gap-1.5">
              <span className="live-dot h-1.5 w-1.5 bg-gold" /> Updated {timeAgo(data.generatedAt)}
            </span>
            {data.demo ? <span className="text-gold">Demo data</span> : <span>Live data</span>}
            <span className="ml-auto flex items-center gap-1 text-mute">
              The MD Direction Score measures evidence alignment — it is not a probability.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Brief({ brief }: { brief: DailyBrief }) {
  return (
    <Panel className="p-5 sm:p-6">
      <div className="display text-2xl font-extrabold uppercase tracking-tight">{brief.greeting}</div>
      <p className="mt-2 text-sm text-mute">
        Global direction is{" "}
        <span className={brief.global.direction === "bullish" ? "text-bull" : brief.global.direction === "bearish" ? "text-bear" : "text-flat"}>
          {brief.global.direction}
        </span>{" "}
        with an MD Direction Score of <span className="ticker text-bone">{brief.global.score}</span>. Regime:{" "}
        <span className="text-gold">{brief.global.regime.primary}</span>.
      </p>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <Eyebrow className="mb-2 text-bull">Strongest</Eyebrow>
          <ul className="space-y-1.5">
            {brief.strongest.map((s) => (
              <li key={s.symbol} className="flex items-center justify-between text-sm">
                <Link href={`/markets/${encodeURIComponent(s.symbol)}`} className="hover:text-gold">{s.symbol}</Link>
                <span className="ticker text-bull">{s.score}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <Eyebrow className="mb-2 text-bear">Weakest</Eyebrow>
          <ul className="space-y-1.5">
            {brief.weakest.map((s) => (
              <li key={s.symbol} className="flex items-center justify-between text-sm">
                <Link href={`/markets/${encodeURIComponent(s.symbol)}`} className="hover:text-gold">{s.symbol}</Link>
                <span className="ticker text-bear">{s.score}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {brief.biggestChanges.length ? (
        <div className="mt-6 border-t border-hairline-soft pt-4">
          <Eyebrow className="mb-2">Biggest changes since yesterday</Eyebrow>
          <ul className="space-y-2.5">
            {brief.biggestChanges.map((c) => (
              <li key={c.symbol} className="text-sm">
                <div className="flex items-center gap-2">
                  <Icon.bolt className={c.delta >= 0 ? "text-bull" : "text-bear"} />
                  <Link href={`/markets/${encodeURIComponent(c.symbol)}`} className="font-semibold hover:text-gold">
                    {c.symbol}
                  </Link>
                  <span className={`ticker text-xs ${c.delta >= 0 ? "text-bull" : "text-bear"}`}>
                    {fmtSigned(c.delta, 0)} points
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-faint">{c.headline}</span>
                </div>
                {c.reasons.length ? <p className="ml-6 mt-0.5 text-xs text-mute">{c.reasons.join(" ")}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {brief.events.length ? (
        <div className="mt-6 border-t border-hairline-soft pt-4">
          <Eyebrow className="mb-2">Events today</Eyebrow>
          <ul className="space-y-1.5 text-sm">
            {brief.events.map((e) => (
              <li key={e.name + e.when} className="flex items-center justify-between">
                <span>{e.name}</span>
                <span className="text-xs uppercase tracking-widest text-faint">{e.when}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}


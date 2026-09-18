"use client";

import { use, useState } from "react";
import Link from "next/link";
import type { AssetAnalysis } from "@/lib/types";
import { useApi, useTicker, postJson } from "@/lib/hooks";
import { PriceChart } from "@/components/chart";
import { EvidenceBreakdown, ScoreDial } from "@/components/score";
import {
  DirectionBadge, ErrorState, Eyebrow, GhostButton, GoldButton, ImpactTag, Panel, QualityTag, SectionHeading, Skeleton,
} from "@/components/primitives";
import { fmtPct, fmtPrice, fmtSigned, timeAgo, untilLabel, fmtTime } from "@/lib/utils/format";
import { Icon } from "@/components/icons";

export default function MarketDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = use(params);
  const symbol = decodeURIComponent(raw).toUpperCase();
  useTicker(5000);

  const { data, loading, error, refresh } = useApi<{ analysis: AssetAnalysis; degraded: string[] }>(
    `/api/market-analysis?symbol=${encodeURIComponent(symbol)}`,
  );
  const [showWhy, setShowWhy] = useState(false);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [showAlert, setShowAlert] = useState(false);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl pt-10">
        <ErrorState message={error} onRetry={refresh} />
        <div className="mt-4">
          <Link href="/markets"><GhostButton>Back to markets</GhostButton></Link>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const a = data?.analysis;
  if (!a) return null;

  const daily = a.technical.find((t) => t.timeframe === "1D");
  const p = a.asset.precision;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* ------------------------------- HERO ---------------------------------- */}
      <Panel className="fade-up overflow-hidden">
        <div className="gold-line" />
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="display text-3xl font-extrabold tracking-tight sm:text-4xl">{a.asset.symbol}</h1>
              <DirectionBadge direction={a.score.direction} />
              <QualityTag quality={a.score.evidenceQuality} />
            </div>
            <div className="mt-1 text-sm uppercase tracking-widest text-mute">
              {a.asset.name} · {a.asset.group}
              {a.asset.sector ? ` · ${a.asset.sector}` : ""}
            </div>

            <div className="mt-5 flex flex-wrap items-baseline gap-4">
              <span className="ticker display text-3xl font-bold">{fmtPrice(a.quote.price, p)}</span>
              <span className={`ticker text-lg ${a.quote.changePct >= 0 ? "text-bull" : "text-bear"}`}>
                {fmtPct(a.quote.changePct)}
              </span>
              <span className="text-xs text-faint">
                H {fmtPrice(a.quote.dayHigh, p)} · L {fmtPrice(a.quote.dayLow, p)}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-widest text-faint">
              <span className="flex items-center gap-1.5">
                <span className="live-dot h-1.5 w-1.5 bg-gold" /> Updated {timeAgo(a.generatedAt)}
              </span>
              <span>Source: {a.quote.source}</span>
              {a.demo ? <span className="text-gold">Demo data</span> : <span>Live</span>}
              <span>Mode: {a.mode}</span>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <GoldButton onClick={() => setShowWhy(true)} className="px-8 py-3 text-sm">
                Why?
              </GoldButton>
              <GhostButton onClick={() => setShowWatchlist(true)}>
                <Icon.watchlist /> Add to watchlist
              </GhostButton>
              <GhostButton onClick={() => setShowAlert(true)}>
                <Icon.alerts /> Create alert
              </GhostButton>
            </div>
          </div>

          <div className="flex flex-col items-center lg:pl-8">
            <ScoreDial score={a.score.score} direction={a.score.direction} size={200} />
            <div className={`mt-3 text-center display text-xl font-bold uppercase tracking-tight ${
              a.score.direction === "bullish" ? "text-bull" : a.score.direction === "bearish" ? "text-bear" : "text-flat"
            }`}>
              {a.score.direction}
            </div>
            <div className="text-center text-[11px] uppercase tracking-widest text-mute">{a.score.label}</div>
          </div>
        </div>

        {a.change && a.change.kind !== "stable" ? (
          <div className={`flex flex-wrap items-center gap-3 border-t px-5 py-3 sm:px-7 ${
            a.change.kind === "shift" ? "border-gold/40 bg-gold/10" : "border-hairline-soft bg-panel-2"
          }`}>
            <span className={`display text-xs font-bold uppercase tracking-widest ${
              a.change.kind === "shift" ? "text-gold" : a.change.delta >= 0 ? "text-bull" : "text-bear"
            }`}>
              {a.change.kind === "shift" ? "🚨" : "⚠️"} {a.change.headline}
            </span>
            <span className="ticker text-xs text-mute">
              {a.previous?.score} → {a.score.score} ({fmtSigned(a.change.delta, 0)})
            </span>
            {a.change.reasons.length ? <span className="text-xs text-mute">{a.change.reasons.join(" ")}</span> : null}
          </div>
        ) : null}

        {a.score.conflict.conflicted ? (
          <div className="border-t border-flat/30 bg-flat/10 px-5 py-3 text-sm text-flat sm:px-7">
            <span className="display text-xs font-bold uppercase tracking-widest">Conflict detected · </span>
            {a.score.conflict.message} The score has been pulled toward neutral as a result.
          </div>
        ) : null}
      </Panel>

      {/* ------------------------------- CHART ---------------------------------- */}
      <PriceChart symbol={a.asset.symbol} initialTimeframe="1D" />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* --------------------------- EVIDENCE ---------------------------------- */}
        <section>
          <SectionHeading title="MD Direction Score" subtitle="Every point is accounted for. Expand any category for the underlying observations." />
          <Panel className="p-5">
            <EvidenceBreakdown score={a.score} />
          </Panel>
        </section>

        <div className="space-y-6">
          {/* ----------------------------- TREND --------------------------------- */}
          <section>
            <SectionHeading title="Trend" />
            <Panel className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline-soft text-left">
                    {["TF", "Price", "50 MA", "200 MA", "vs 50", "50 slope", "Trend", "Vol"].map((h) => (
                      <th key={h} className="px-3 py-2 text-[10px] uppercase tracking-widest text-faint">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.technical.map((t) => (
                    <tr key={t.timeframe} className="border-b border-hairline-soft last:border-b-0">
                      <td className="px-3 py-2 font-display text-xs font-semibold">{t.timeframe}</td>
                      <td className="ticker px-3 py-2 text-xs">{fmtPrice(t.price, p)}</td>
                      <td className="ticker px-3 py-2 text-xs text-gold">{fmtPrice(t.ma50, p)}</td>
                      <td className="ticker px-3 py-2 text-xs text-mute">{fmtPrice(t.ma200, p)}</td>
                      <td className={`px-3 py-2 text-xs uppercase ${t.priceVsMa50 === "above" ? "text-bull" : t.priceVsMa50 === "below" ? "text-bear" : "text-faint"}`}>
                        {t.priceVsMa50 ?? "—"}
                      </td>
                      <td className={`px-3 py-2 text-xs uppercase ${t.ma50Slope === "rising" ? "text-bull" : t.ma50Slope === "falling" ? "text-bear" : "text-faint"}`}>
                        {t.ma50Slope ?? "—"}
                      </td>
                      <td className={`px-3 py-2 text-xs uppercase ${t.trend === "bullish" ? "text-bull" : t.trend === "bearish" ? "text-bear" : "text-mute"}`}>
                        {t.trend}
                      </td>
                      <td className="px-3 py-2 text-xs capitalize text-mute">{t.volatility}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </section>

          {/* --------------------------- STRUCTURE ------------------------------- */}
          <section>
            <SectionHeading title="Market Structure" subtitle="Higher highs and higher lows, breaks of structure and changes of character, per timeframe." />
            <div className="grid gap-3 sm:grid-cols-2">
              {a.structure.map((s) => (
                <Panel key={s.timeframe} className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="display text-sm font-bold">{s.timeframe}</span>
                    <DirectionBadge direction={s.bias} small />
                  </div>
                  <ul className="mt-3 space-y-1 text-xs">
                    <Check label="Higher High" on={s.higherHigh} />
                    <Check label="Higher Low" on={s.higherLow} />
                    <Check label="Lower High" on={s.lowerHigh} bearish />
                    <Check label="Lower Low" on={s.lowerLow} bearish />
                  </ul>
                  <div className="mt-3 space-y-1 border-t border-hairline-soft pt-2 text-[11px] text-mute">
                    <div>State: <span className="text-bone">{s.state.replace(/-/g, " ")}</span></div>
                    {s.breakOfStructure ? (
                      <div className={s.breakOfStructure === "bullish" ? "text-bull" : "text-bear"}>
                        {s.breakOfStructure} break of structure
                      </div>
                    ) : null}
                    {s.changeOfCharacter ? (
                      <div className="text-gold">{s.changeOfCharacter} change of character</div>
                    ) : null}
                    <div className="ticker">
                      Swing H {fmtPrice(s.lastSwingHigh, p)} · L {fmtPrice(s.lastSwingLow, p)}
                    </div>
                  </div>
                </Panel>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* ------------------------------ MOMENTUM -------------------------------- */}
      <section>
        <SectionHeading title="Momentum" subtitle={`Momentum score ${a.momentumScore} / 100 across the timeframes weighted for ${a.mode} mode.`} />
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline-soft text-left">
                {["TF", "RSI", "MACD", "10-bar ROC", "Volume vs avg", "Reading"].map((h) => (
                  <th key={h} className="px-3 py-2 text-[10px] uppercase tracking-widest text-faint">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {a.momentum.map((m) => (
                <tr key={m.timeframe} className="border-b border-hairline-soft last:border-b-0">
                  <td className="px-3 py-2 font-display text-xs font-semibold">{m.timeframe}</td>
                  <td className="ticker px-3 py-2 text-xs">{m.rsi?.toFixed(1) ?? "—"}</td>
                  <td className={`px-3 py-2 text-xs uppercase ${m.macdState === "bullish" ? "text-bull" : m.macdState === "bearish" ? "text-bear" : "text-mute"}`}>
                    {m.macdState ?? "—"}
                  </td>
                  <td className={`ticker px-3 py-2 text-xs ${(m.roc ?? 0) >= 0 ? "text-bull" : "text-bear"}`}>
                    {m.roc != null ? `${m.roc.toFixed(2)}%` : "—"}
                  </td>
                  <td className="ticker px-3 py-2 text-xs text-mute">
                    {m.volumeVsAvg != null ? `${m.volumeVsAvg.toFixed(2)}×` : "Data unavailable"}
                  </td>
                  <td className={`px-3 py-2 text-xs ${m.strength >= 0 ? "text-bull" : "text-bear"}`}>
                    {fmtSigned(m.strength * 100, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* -------------------------- NEWS SENTIMENT ---------------------------- */}
        <section>
          <SectionHeading title="News Sentiment" subtitle="Mapped to this market by theme relationship, not by counting positive words." />
          <Panel>
            {a.news.length === 0 ? (
              <p className="px-4 py-6 text-sm text-mute">No sufficiently relevant news found for this market in the last 72 hours.</p>
            ) : (
              a.news.slice(0, 8).map((n) => (
                <div key={n.article.id} className="border-b border-hairline-soft px-4 py-3 last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm leading-snug">{n.article.headline}</p>
                    <span className={`shrink-0 text-xs font-semibold ${n.assetSentiment > 0.1 ? "text-bull" : n.assetSentiment < -0.1 ? "text-bear" : "text-mute"}`}>
                      {n.assetSentiment > 0.1 ? "Bullish" : n.assetSentiment < -0.1 ? "Bearish" : "Neutral"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-mute">{n.article.summary}</p>
                  <p className="mt-1 text-xs text-faint">{n.reason}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest text-faint">
                    <span>{n.article.source}</span>
                    <span>{timeAgo(n.article.publishedAt)}</span>
                    <ImpactTag impact={n.article.impact} />
                    <span>Relevance {(n.relevance * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))
            )}
          </Panel>
        </section>

        {/* ------------------------------ MACRO --------------------------------- */}
        <section>
          <SectionHeading title="Macro" subtitle="How the current macro setting interacts with this specific market." />
          <Panel className="p-4">
            {a.macroDrivers.length === 0 ? (
              <p className="text-sm text-mute">Macro sensitivities are not defined for this market.</p>
            ) : (
              <ul className="space-y-3">
                {a.macroDrivers.map((d) => (
                  <li key={d.label}>
                    <div className="flex items-center justify-between">
                      <span className="font-display text-xs font-semibold uppercase tracking-widest">{d.label}</span>
                      <span className={`ticker text-xs ${d.impact >= 0 ? "text-bull" : "text-bear"}`}>
                        {d.impact > 0.08 ? "Supportive" : d.impact < -0.08 ? "Headwind" : "Neutral"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-mute">{d.detail}</p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-hairline-soft pt-3">
              {a.macro.readings.slice(0, 8).map((r) => (
                <div key={r.label} className="flex items-baseline justify-between text-xs">
                  <span className="truncate text-faint">{r.label}</span>
                  <span className="ticker">{r.value}</span>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        {/* --------------------------- CROSS MARKET ----------------------------- */}
        <section>
          <SectionHeading title="Cross-Market Confirmation" subtitle="Supporting evidence from related markets — tendencies, not rules." />
          <Panel>
            {a.crossMarket.length === 0 ? (
              <p className="px-4 py-6 text-sm text-mute">No cross-market relationships are defined for this market.</p>
            ) : (
              a.crossMarket.map((c) => (
                <div key={c.symbol} className="flex items-center justify-between gap-3 border-b border-hairline-soft px-4 py-3 last:border-b-0">
                  <div className="min-w-0">
                    <Link href={`/markets/${encodeURIComponent(c.symbol)}`} className="display text-sm font-semibold hover:text-gold">
                      {c.symbol}
                    </Link>
                    <div className="truncate text-[11px] text-faint">
                      {c.label} · moves {c.sign === 1 ? "with" : "against"} {a.asset.symbol}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xs uppercase tracking-widest ${c.relatedBias > 0.15 ? "text-bull" : c.relatedBias < -0.15 ? "text-bear" : "text-mute"}`}>
                      {c.relatedBias > 0.15 ? "Bullish" : c.relatedBias < -0.15 ? "Bearish" : "Flat"}
                    </div>
                    <div className={`ticker text-[11px] ${c.confirmation >= 0 ? "text-bull" : "text-bear"}`}>
                      {c.confirmation >= 0 ? "Confirming" : "Contradicting"} {fmtSigned(c.confirmation * 10, 1)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </Panel>
        </section>

        {/* ---------------------------- EVENT RISK ------------------------------ */}
        <section>
          <SectionHeading title="Event Risk" subtitle="Scheduled events reduce conviction — they do not push a market bearish." />
          <Panel className="p-4">
            {a.eventRisk.nextEvent ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="display text-lg font-bold">{a.eventRisk.nextEvent.name}</div>
                    <div className="text-xs text-mute">
                      {a.eventRisk.nextEvent.country} · {fmtTime(a.eventRisk.nextEvent.time)}
                    </div>
                  </div>
                  <div className="text-right">
                    <ImpactTag impact={a.eventRisk.risk === "none" ? "low" : a.eventRisk.risk} />
                    <div className="ticker mt-1 text-xs text-mute">{untilLabel(a.eventRisk.nextEvent.time)}</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-mute">
                  Conviction dampening applied: <span className="ticker text-gold">{(a.eventRisk.dampening * 100).toFixed(0)}%</span> of the
                  event-risk weight.
                </div>
                {a.eventRisk.upcoming.length > 1 ? (
                  <ul className="mt-3 space-y-1 border-t border-hairline-soft pt-3 text-xs">
                    {a.eventRisk.upcoming.slice(1, 5).map((e) => (
                      <li key={e.id} className="flex items-center justify-between">
                        <span className="text-mute">{e.name}</span>
                        <span className="text-faint">{untilLabel(e.time)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-mute">No scheduled events found that this market is directly exposed to.</p>
            )}
          </Panel>
        </section>
      </div>

      {/* --------------------- WHAT COULD CHANGE IT ----------------------------- */}
      <section>
        <SectionHeading title="What Could Change It" subtitle="The specific conditions that would alter this read." />
        <Panel className="p-5">
          <ul className="space-y-2">
            {a.whatCouldChangeIt.map((w, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-gold" />
                <span className="text-mute">{w}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      {showWhy ? <WhyModal analysis={a} onClose={() => setShowWhy(false)} /> : null}
      {showWatchlist ? <WatchlistModal symbol={a.asset.symbol} onClose={() => setShowWatchlist(false)} /> : null}
      {showAlert ? <AlertModal symbol={a.asset.symbol} onClose={() => setShowAlert(false)} /> : null}
    </div>
  );
}

function Check({ label, on, bearish = false }: { label: string; on: boolean; bearish?: boolean }) {
  return (
    <li className="flex items-center justify-between">
      <span className={on ? "text-bone" : "text-faint"}>{label}</span>
      <span className={on ? (bearish ? "text-bear" : "text-bull") : "text-faint"}>{on ? "✓" : "—"}</span>
    </li>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-void/80 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="panel max-h-[85vh] w-full max-w-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline-soft px-5 py-3">
          <h3 className="display text-sm font-bold uppercase tracking-widest">{title}</h3>
          <button onClick={onClose} className="text-mute hover:text-bone"><Icon.close /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function WhyModal({ analysis, onClose }: { analysis: AssetAnalysis; onClose: () => void }) {
  return (
    <Modal title={`Why is ${analysis.asset.symbol} ${analysis.score.direction}?`} onClose={onClose}>
      <p className="text-base leading-relaxed">{analysis.why}</p>

      <div className="mt-6">
        <Eyebrow className="mb-2">The evidence</Eyebrow>
        <EvidenceBreakdown score={analysis.score} expandable={false} />
      </div>

      <div className="mt-6">
        <Eyebrow className="mb-2">What could change it</Eyebrow>
        <ul className="space-y-1.5">
          {analysis.whatCouldChangeIt.map((w, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-mute">
              <span className="mt-1.5 h-1 w-1 shrink-0 bg-gold" />{w}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-6 border-t border-hairline-soft pt-4 text-xs text-faint">
        This is a directional analysis of current evidence. It is not a forecast, not a probability, and not investment advice.
      </p>
    </Modal>
  );
}

function WatchlistModal({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const { data, refresh } = useApi<{ watchlists: { id: string; name: string; symbols: string[] }[] }>("/api/watchlists?scores=false");
  const [status, setStatus] = useState<string | null>(null);
  const [name, setName] = useState("");

  async function add(id: string) {
    try {
      await postJson(`/api/watchlists/${id}`, { add: symbol }, "PATCH");
      setStatus(`${symbol} added.`);
      refresh();
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  async function create() {
    try {
      const res = await postJson<{ watchlist: { id: string } }>("/api/watchlists", { name, symbols: [symbol] });
      setStatus(`Created “${name}” with ${symbol}.`);
      setName("");
      void res;
      refresh();
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  return (
    <Modal title={`Add ${symbol} to a watchlist`} onClose={onClose}>
      <div className="space-y-2">
        {data?.watchlists.length ? (
          data.watchlists.map((w) => (
            <button
              key={w.id}
              onClick={() => add(w.id)}
              className="flex w-full items-center justify-between border border-hairline px-4 py-3 text-left text-sm transition hover:border-gold"
            >
              <span>{w.name}</span>
              <span className="text-xs text-faint">
                {w.symbols.includes(symbol) ? "Already added" : `${w.symbols.length} markets`}
              </span>
            </button>
          ))
        ) : (
          <p className="text-sm text-mute">You have no watchlists yet.</p>
        )}
      </div>
      <div className="mt-5 border-t border-hairline-soft pt-4">
        <Eyebrow className="mb-2">Create a new watchlist</Eyebrow>
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My Forex" className="flex-1 px-3 py-2 text-sm" />
          <GoldButton onClick={create} disabled={!name.trim()}>Create</GoldButton>
        </div>
      </div>
      {status ? <p className="mt-3 text-xs text-gold">{status}</p> : null}
    </Modal>
  );
}

const ALERT_KINDS = [
  { kind: "score-above", label: "MD Score rises above", needsThreshold: true, defaultThreshold: 75 },
  { kind: "score-below", label: "MD Score falls below", needsThreshold: true, defaultThreshold: 30 },
  { kind: "direction-becomes", label: "Direction becomes", needsDirection: true },
  { kind: "direction-change", label: "Direction changes at all" },
  { kind: "price-cross-ma50", label: "Price crosses the daily 50 MA" },
  { kind: "structure-change", label: "Daily market structure changes (Elite)" },
  { kind: "factors-aligned", label: "N or more factors align (Elite)", needsThreshold: true, defaultThreshold: 5 },
  { kind: "event-countdown", label: "Hours before the next major event (Elite)", needsThreshold: true, defaultThreshold: 1 },
] as const;

function AlertModal({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const [kind, setKind] = useState<string>("score-above");
  const [threshold, setThreshold] = useState(75);
  const [direction, setDirection] = useState("bullish");
  const [status, setStatus] = useState<string | null>(null);
  const selected = ALERT_KINDS.find((k) => k.kind === kind)!;

  async function submit() {
    try {
      await postJson("/api/alerts", { symbol, kind, threshold, direction: "needsDirection" in selected ? direction : null });
      setStatus("Alert created. You can manage it on the Alerts page.");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  return (
    <Modal title={`Create an alert for ${symbol}`} onClose={onClose}>
      <label className="eyebrow mb-1 block">Condition</label>
      <select
        value={kind}
        onChange={(e) => {
          setKind(e.target.value);
          const k = ALERT_KINDS.find((x) => x.kind === e.target.value);
          if (k && "defaultThreshold" in k) setThreshold(k.defaultThreshold as number);
        }}
        className="w-full px-3 py-2.5 text-sm"
      >
        {ALERT_KINDS.map((k) => (
          <option key={k.kind} value={k.kind}>{k.label}</option>
        ))}
      </select>

      {"needsThreshold" in selected && selected.needsThreshold ? (
        <div className="mt-4">
          <label className="eyebrow mb-1 block">Value</label>
          <input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full px-3 py-2.5 text-sm" />
        </div>
      ) : null}

      {"needsDirection" in selected && selected.needsDirection ? (
        <div className="mt-4">
          <label className="eyebrow mb-1 block">Direction</label>
          <select value={direction} onChange={(e) => setDirection(e.target.value)} className="w-full px-3 py-2.5 text-sm">
            <option value="bullish">Bullish</option>
            <option value="bearish">Bearish</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>
      ) : null}

      <div className="mt-6 flex gap-2">
        <GoldButton onClick={submit}>Create alert</GoldButton>
        <Link href="/alerts"><GhostButton>Manage alerts</GhostButton></Link>
      </div>
      {status ? <p className="mt-3 text-xs text-gold">{status}</p> : null}
    </Modal>
  );
}

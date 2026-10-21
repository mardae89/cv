"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState, Eyebrow, GhostButton, GoldButton, Panel, SectionHeading, Skeleton } from "@/components/primitives";
import { Bar, ConfirmButton, LocalNote, Segmented, Stat, fmtMoney, fmtR, toneOf, useModal } from "@/components/os";
import { CloseTradeModal, LogTradeModal, type TradeDraft } from "@/components/trade-forms";
import { Icon } from "@/components/icons";
import { usePlan, useTrades, type Trade } from "@/lib/os/store";
import { breakdowns, dailyResults, equityCurve, stats, type Bucket } from "@/lib/os/analytics";
import { pipUnit, getAsset } from "@/lib/data/universe";
import { fmtPrice } from "@/lib/utils/format";
import { readQuery, replaceRoute } from "@/lib/route";

type Tab = "trades" | "analytics" | "calendar";

export default function JournalPage() {
  const [trades, saveTrades, ready] = useTrades();
  const [plan] = usePlan();
  const [tab, setTab] = useState<Tab>("trades");
  const [logging, setLogging] = useState<TradeDraft | null>(null);
  const [closing, setClosing] = useState<Trade | null>(null);
  const [viewing, setViewing] = useState<Trade | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");

  // Deep links from the Wick Catcher and market pages: /journal?new=1&symbol=…
  useEffect(() => {
    const q = readQuery();
    if (!q.get("new")) return;
    const n = (k: string) => (q.get(k) != null && q.get(k) !== "" && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : undefined);
    setLogging({
      symbol: q.get("symbol") ?? undefined,
      direction: q.get("direction") === "short" ? "short" : q.get("direction") === "long" ? "long" : undefined,
      entry: n("entry"), stop: n("stop"), target: n("target"),
      strategy: q.get("strategy") ?? undefined,
      mdScore: n("score") ?? null,
      reasons: q.get("reasons") ?? undefined,
    });
    replaceRoute("/journal");
  }, []);

  const shown = trades.filter((t) => (filter === "all" ? true : filter === "open" ? t.outcome === "open" : t.outcome !== "open"));
  const s = useMemo(() => stats(trades), [trades]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionHeading
        title="Trade Journal"
        subtitle="Record the decision before the result can bias it. The numbers tell you where your edge really is — and what your emotions cost."
        action={<GoldButton onClick={() => setLogging({})}><Icon.plus className="h-4 w-4" /> Log a trade</GoldButton>}
      />

      {/* --------------------------------- headline -------------------------------- */}
      <Panel className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Closed trades" value={String(s.trades)} sub={`${trades.length - s.trades} open`} />
        <Stat label="Win rate" value={s.trades ? `${s.winRate.toFixed(0)}%` : "—"} sub={`${s.wins}W · ${s.losses}L`} />
        <Stat label="Expectancy" value={fmtR(s.expectancy)} tone={toneOf(s.expectancy)} sub="average R per trade" />
        <Stat label="Total" value={fmtR(s.totalR, 1)} tone={toneOf(s.totalR)} sub={s.hasPnl ? fmtMoney(s.pnl, plan.accountCurrency) : undefined} />
        <Stat label="Profit factor" value={s.profitFactor == null ? "—" : s.profitFactor === Infinity ? "∞" : s.profitFactor.toFixed(2)} tone={s.profitFactor != null && s.profitFactor >= 1 ? "text-bull" : s.profitFactor != null ? "text-bear" : "text-bone"} />
        <Stat label="Followed plan" value={s.planAdherence != null ? `${s.planAdherence.toFixed(0)}%` : "—"} tone={s.planAdherence != null ? (s.planAdherence >= 80 ? "text-bull" : s.planAdherence >= 60 ? "text-gold" : "text-bear") : "text-bone"} />
      </Panel>

      <div className="max-w-md">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[{ value: "trades", label: "Trades" }, { value: "analytics", label: "Analytics" }, { value: "calendar", label: "Calendar" }]}
        />
      </div>

      {!ready ? (
        <Skeleton className="h-72" />
      ) : tab === "trades" ? (
        trades.length === 0 ? (
          <EmptyState
            title="Your journal is empty"
            message="Log your next trade before you take it — market, levels, checklist and how you feel. Close it when it is done."
            action={<GoldButton onClick={() => setLogging({})}>Log your first trade</GoldButton>}
          />
        ) : (
          <>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest">
              {(["all", "open", "closed"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`border px-2.5 py-1 ${filter === f ? "border-gold text-gold" : "border-hairline text-faint hover:text-bone"}`}>
                  {f} {f === "open" ? `(${trades.length - s.trades})` : f === "closed" ? `(${s.trades})` : `(${trades.length})`}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {shown.map((t) => (
                <TradeRow key={t.id} trade={t} currency={plan.accountCurrency} onClose={() => setClosing(t)} onView={() => setViewing(t)} />
              ))}
            </div>
          </>
        )
      ) : tab === "analytics" ? (
        <Analytics trades={trades} currency={plan.accountCurrency} />
      ) : (
        <CalendarView trades={trades} currency={plan.accountCurrency} />
      )}

      <LocalNote />

      {logging ? <LogTradeModal initial={logging} onClose={() => setLogging(null)} /> : null}
      {closing ? <CloseTradeModal trade={closing} onClose={() => setClosing(null)} /> : null}
      {viewing ? (
        <TradeDetail
          trade={viewing}
          currency={plan.accountCurrency}
          checklistText={(id) => plan.checklist.find((c) => c.id === id)?.text ?? null}
          onClose={() => setViewing(null)}
          onEdit={() => { setClosing(viewing); setViewing(null); }}
          onDelete={() => {
            saveTrades((prev) => prev.filter((x) => x.id !== viewing.id));
            setViewing(null);
          }}
        />
      ) : null}
    </div>
  );
}

/* ----------------------------------- rows ----------------------------------- */

function TradeRow({ trade: t, currency, onClose, onView }: { trade: Trade; currency: string; onClose: () => void; onView: () => void }) {
  const precision = getAsset(t.symbol)?.precision ?? 5;
  const unit = pipUnit(t.symbol);
  const rr = t.stop != null && t.target != null && t.stop !== t.entry ? Math.abs(t.target - t.entry) / Math.abs(t.entry - t.stop) : null;
  const open = t.outcome === "open";
  return (
    <div className="panel grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[170px_1fr_auto]">
      <button onClick={onView} className="min-w-0 text-left">
        <div className="flex items-center gap-2">
          <span className="display text-sm font-bold">{t.symbol}</span>
          <span className={`text-[10px] font-semibold uppercase tracking-widest ${t.direction === "long" ? "text-bull" : "text-bear"}`}>{t.direction}</span>
          {t.setupGrade ? <span className="border border-gold/40 px-1 text-[10px] font-bold text-gold">{t.setupGrade}</span> : null}
        </div>
        <div className="truncate text-[10px] uppercase tracking-widest text-faint">
          {new Date(t.openedAt).toLocaleDateString(undefined, { day: "2-digit", month: "short" })} · {t.strategy || "—"} · {t.timeframe}
        </div>
      </button>

      <button onClick={onView} className="hidden min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-left text-xs text-mute sm:flex">
        <span>Entry <span className="ticker text-bone">{fmtPrice(t.entry, precision)}</span></span>
        <span>SL <span className="ticker">{fmtPrice(t.stop, precision)}</span></span>
        <span>TP <span className="ticker">{fmtPrice(t.target, precision)}</span></span>
        {rr ? <span>R:R <span className="ticker text-gold">{rr.toFixed(1)}</span></span> : null}
        {t.emotionBefore ? <span className="text-faint">felt {t.emotionBefore.toLowerCase()}</span> : null}
        {t.checklistTotal ? <span className={t.checklist.length === t.checklistTotal ? "text-bull" : "text-gold"}>✓ {t.checklist.length}/{t.checklistTotal}</span> : null}
        {t.followedPlan === false ? <span className="text-bear">broke plan</span> : null}
      </button>

      <div className="flex items-center justify-end gap-3">
        {open ? (
          <>
            <span className="border border-gold/40 px-2 py-0.5 text-[10px] uppercase tracking-widest text-gold">Open</span>
            <GhostButton onClick={onClose}>Close</GhostButton>
          </>
        ) : (
          <div className="text-right">
            <div className={`ticker display text-base font-bold ${toneOf(t.resultR ?? t.pnl ?? t.pips)}`}>
              {t.resultR != null ? fmtR(t.resultR) : t.pnl != null ? fmtMoney(t.pnl, currency) : "—"}
            </div>
            <div className="ticker text-[10px] uppercase tracking-widest text-faint">
              {t.pips != null ? `${t.pips >= 0 ? "+" : ""}${t.pips.toFixed(1)} ${unit}` : t.outcome}
              {t.pnl != null && t.resultR != null ? ` · ${fmtMoney(t.pnl, currency)}` : ""}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TradeDetail({
  trade: t, currency, checklistText, onClose, onEdit, onDelete,
}: {
  trade: Trade;
  currency: string;
  checklistText: (id: string) => string | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  useModal(onClose);
  const precision = getAsset(t.symbol)?.precision ?? 5;
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-hairline-soft py-1.5 text-sm last:border-b-0">
      <span className="text-faint">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-void/80 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div className="panel max-h-[90vh] w-full max-w-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-hairline-soft px-5 py-3">
          <h3 className="display text-sm font-bold uppercase tracking-widest">
            {t.symbol} <span className={t.direction === "long" ? "text-bull" : "text-bear"}>{t.direction}</span>
          </h3>
          <button onClick={onClose} className="text-mute hover:text-bone" aria-label="Close"><Icon.close /></button>
        </div>
        <div className="grid gap-6 p-5 sm:grid-cols-2">
          <div>
            <Eyebrow className="mb-2">The trade</Eyebrow>
            {row("Opened", new Date(t.openedAt).toLocaleString())}
            {row("Strategy", t.strategy || "—")}
            {row("Setup grade", t.setupGrade ?? "—")}
            {row("Timeframe · session", `${t.timeframe} · ${t.session ?? "—"}`)}
            {row("Entry", <span className="ticker">{fmtPrice(t.entry, precision)}</span>)}
            {row("Stop", <span className="ticker">{fmtPrice(t.stop, precision)}</span>)}
            {row("Target", <span className="ticker">{fmtPrice(t.target, precision)}</span>)}
            {row("Risk", t.riskAmount != null ? fmtMoney(t.riskAmount, currency, false) : "—")}
            {row("MD Score at entry", t.mdScoreAtEntry ?? "—")}
            {row("Felt before", t.emotionBefore ?? "—")}
            {row("Confidence", t.confidence != null ? `${t.confidence}/5` : "—")}
          </div>
          <div>
            <Eyebrow className="mb-2">The result</Eyebrow>
            {row("Outcome", <span className="uppercase">{t.outcome}</span>)}
            {row("Exit", <span className="ticker">{fmtPrice(t.exit, precision)}</span>)}
            {row("Result", <span className={`ticker ${toneOf(t.resultR)}`}>{fmtR(t.resultR)}</span>)}
            {row(pipUnit(t.symbol), <span className={`ticker ${toneOf(t.pips)}`}>{t.pips != null ? t.pips.toFixed(1) : "—"}</span>)}
            {row("P/L", <span className={`ticker ${toneOf(t.pnl)}`}>{fmtMoney(t.pnl, currency)}</span>)}
            {row("Followed plan", t.followedPlan == null ? "—" : t.followedPlan ? <span className="text-bull">Yes</span> : <span className="text-bear">No</span>)}
            {row("Execution", t.executionRating != null ? `${t.executionRating}/5` : "—")}
            {row("Felt after", t.emotionAfter ?? "—")}
            {t.mistakes.length ? row("Mistakes", <span className="text-bear">{t.mistakes.join(", ")}</span>) : null}
          </div>
          {t.reasons ? (
            <div className="sm:col-span-2">
              <Eyebrow className="mb-1">Why I took it</Eyebrow>
              <p className="whitespace-pre-wrap text-sm text-mute">{t.reasons}</p>
            </div>
          ) : null}
          {t.checklistTotal ? (
            <div className="sm:col-span-2">
              <Eyebrow className="mb-1">Checklist · {t.checklist.length}/{t.checklistTotal}</Eyebrow>
              <ul className="space-y-0.5 text-xs text-mute">
                {t.checklist.map((id) => <li key={id}>✓ {checklistText(id) ?? "(item since removed from the plan)"}</li>)}
              </ul>
            </div>
          ) : null}
          {t.lesson ? (
            <div className="sm:col-span-2">
              <Eyebrow className="mb-1">Lesson</Eyebrow>
              <p className="border-l-2 border-gold pl-3 text-sm">{t.lesson}</p>
            </div>
          ) : null}
          {t.screenshotUrl ? (
            <div className="sm:col-span-2">
              <Eyebrow className="mb-1">Screenshot</Eyebrow>
              <a href={t.screenshotUrl} target="_blank" rel="noreferrer noopener" className="break-all text-xs text-gold hover:underline">{t.screenshotUrl}</a>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline-soft px-5 py-4">
          <GoldButton onClick={onEdit}>{t.outcome === "open" ? "Close trade" : "Edit result"}</GoldButton>
          <Link href={`/markets/${encodeURIComponent(t.symbol)}`}><GhostButton>Open chart</GhostButton></Link>
          <ConfirmButton className="ml-auto" label="Delete" confirmLabel="Tap again to delete" onConfirm={onDelete} />
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- analytics --------------------------------- */

function Analytics({ trades, currency }: { trades: Trade[]; currency: string }) {
  const s = stats(trades);
  const b = breakdowns(trades);
  const curve = equityCurve(trades);

  if (s.trades === 0) {
    return <EmptyState title="Nothing to analyse yet" message="Analytics appear as soon as you close a trade. Thirty or more closed trades make them meaningful." />;
  }

  return (
    <div className="space-y-5">
      <Panel className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-4">
        <Stat label="Average win" value={fmtR(s.avgWinR)} tone="text-bull" />
        <Stat label="Average loss" value={fmtR(s.avgLossR)} tone="text-bear" />
        <Stat label="Best · worst" value={`${fmtR(s.bestR, 1)} · ${fmtR(s.worstR, 1)}`} />
        <Stat label="Longest losing run" value={String(s.maxLosingStreak)} sub={`Max drawdown ${s.maxDrawdownR.toFixed(1)}R`} />
      </Panel>

      <Panel className="p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <Eyebrow>Equity curve, in R</Eyebrow>
          <span className="text-[10px] uppercase tracking-widest text-faint">{curve.length} trades with a known R</span>
        </div>
        <EquityChart points={curve.map((p) => p.r)} />
      </Panel>

      {s.trades < 30 ? (
        <p className="border border-hairline-soft bg-ink px-4 py-3 text-xs text-mute">
          {s.trades} closed trade{s.trades === 1 ? "" : "s"} so far. Treat the tables below as early hints — below about thirty trades, one result can swing any row.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <BucketTable title="Followed my plan vs broke it" buckets={b.byPlan} currency={currency} highlight />
        <BucketTable title="Cost of each mistake" buckets={b.byMistake} currency={currency} mistakes />
        <BucketTable title="By emotion before entry" buckets={b.byEmotion} currency={currency} />
        <BucketTable title="By setup grade" buckets={b.bySetup} currency={currency} />
        <BucketTable title="By market" buckets={b.byMarket} currency={currency} />
        <BucketTable title="By strategy" buckets={b.byStrategy} currency={currency} />
        <BucketTable title="By session" buckets={b.bySession} currency={currency} />
        <BucketTable title="By MD alignment at entry" buckets={b.byScore} currency={currency} />
        <BucketTable title="By day of week" buckets={b.byDay} currency={currency} />
        <BucketTable title="By direction" buckets={b.byDirection} currency={currency} />
      </div>
    </div>
  );
}

function BucketTable({ title, buckets, currency, highlight = false, mistakes = false }: { title: string; buckets: Bucket[]; currency: string; highlight?: boolean; mistakes?: boolean }) {
  return (
    <Panel className={highlight ? "border-gold/30" : ""}>
      <div className="border-b border-hairline-soft px-4 py-3"><Eyebrow className={highlight ? "text-gold" : ""}>{title}</Eyebrow></div>
      {buckets.length === 0 ? (
        <p className="px-4 py-5 text-sm text-mute">{mistakes ? "No mistakes tagged yet. Tag them honestly when you close a trade." : "Not enough data yet."}</p>
      ) : (
        <div>
          <div className="grid grid-cols-[1fr_44px_52px_70px] gap-2 px-4 pt-2 text-[9px] uppercase tracking-widest text-faint">
            <span />
            <span className="text-right">Trades</span>
            <span className="text-right">Win</span>
            <span className="text-right">{mistakes ? "Total" : "Expect."}</span>
          </div>
          {buckets.map((x) => (
            <div key={x.key} className="grid grid-cols-[1fr_44px_52px_70px] items-center gap-2 border-b border-hairline-soft px-4 py-2 text-xs last:border-b-0">
              <span className="truncate text-sm">
                {x.key}
                {x.pnl !== 0 ? <span className={`ml-2 ticker text-[10px] ${toneOf(x.pnl)}`}>{fmtMoney(x.pnl, currency)}</span> : null}
              </span>
              <span className="ticker text-right text-faint">{x.trades}</span>
              <span className={`ticker text-right ${x.winRate >= 50 ? "text-bull" : "text-bear"}`}>{x.winRate.toFixed(0)}%</span>
              <span className={`ticker text-right font-semibold ${toneOf(mistakes ? x.totalR : x.expectancy)}`}>
                {mistakes ? fmtR(x.totalR, 1) : fmtR(x.expectancy)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function EquityChart({ points }: { points: number[] }) {
  if (points.length < 2) return <p className="py-8 text-center text-sm text-mute">Close at least two trades with a stop to draw the curve.</p>;
  const W = 600;
  const H = 160;
  const series = [0, ...points];
  const min = Math.min(0, ...series);
  const max = Math.max(0, ...series);
  const span = max - min || 1;
  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / span) * H;
  const path = series.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = series[series.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H + 4}`} className="h-44 w-full" preserveAspectRatio="none" role="img" aria-label={`Equity curve ending at ${last.toFixed(1)}R`}>
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-hairline)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      <path d={`${path} L${W},${y(0)} L0,${y(0)} Z`} fill={last >= 0 ? "var(--color-bull)" : "var(--color-bear)"} opacity={0.08} />
      <path d={path} fill="none" stroke={last >= 0 ? "var(--color-bull)" : "var(--color-bear)"} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* --------------------------------- calendar --------------------------------- */

function CalendarView({ trades, currency }: { trades: Trade[]; currency: string }) {
  const [offset, setOffset] = useState(0);
  const results = dailyResults(trades);
  const base = new Date();
  const month = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const lead = (month.getDay() + 6) % 7; // Monday-first
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const key = (d: number) => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => results.get(key(i + 1))).filter(Boolean) as { r: number; pnl: number; trades: number }[];
  const monthR = monthDays.reduce((s, d) => s + d.r, 0);
  const monthPnl = monthDays.reduce((s, d) => s + d.pnl, 0);
  const green = monthDays.filter((d) => d.r > 0 || (d.r === 0 && d.pnl > 0)).length;
  const maxAbs = Math.max(1, ...monthDays.map((d) => Math.abs(d.r)));

  return (
    <Panel className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GhostButton onClick={() => setOffset(offset - 1)} aria-label="Previous month">←</GhostButton>
          <span className="display w-40 text-center text-sm font-bold uppercase tracking-widest">
            {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </span>
          <GhostButton onClick={() => setOffset(offset + 1)} disabled={offset >= 0} aria-label="Next month">→</GhostButton>
        </div>
        <div className="flex gap-5 text-xs text-faint">
          <span>Month <span className={`ticker font-semibold ${toneOf(monthR)}`}>{fmtR(monthR, 1)}</span></span>
          {monthPnl ? <span className={`ticker ${toneOf(monthPnl)}`}>{fmtMoney(monthPnl, currency)}</span> : null}
          <span>{green}/{monthDays.length} green days</span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[9px] uppercase tracking-widest text-faint">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="pb-1">{d}</div>)}
        {cells.map((d, i) => {
          if (d == null) return <div key={`b${i}`} />;
          const r = results.get(key(d));
          const intensity = r ? Math.min(1, Math.abs(r.r) / maxAbs) : 0;
          const up = r ? r.r > 0 || (r.r === 0 && r.pnl > 0) : false;
          const down = r ? r.r < 0 || (r.r === 0 && r.pnl < 0) : false;
          return (
            <div
              key={d}
              className={`flex aspect-square flex-col items-center justify-center border text-[10px] ${r ? (up ? "border-bull/40" : down ? "border-bear/40" : "border-hairline") : "border-hairline-soft"}`}
              style={r ? { background: up ? `rgba(52,211,153,${0.08 + intensity * 0.3})` : down ? `rgba(240,90,90,${0.08 + intensity * 0.3})` : undefined } : undefined}
              title={r ? `${r.trades} trade(s), ${fmtR(r.r)}${r.pnl ? `, ${fmtMoney(r.pnl, currency)}` : ""}` : undefined}
            >
              <span className="text-faint">{d}</span>
              {r ? <span className={`ticker font-semibold normal-case ${up ? "text-bull" : down ? "text-bear" : "text-mute"}`}>{fmtR(r.r, 1)}</span> : null}
            </div>
          );
        })}
      </div>
      <div className="mt-4"><Bar value={monthDays.length ? green / monthDays.length : 0} tone="bull" /></div>
    </Panel>
  );
}

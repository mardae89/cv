"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eyebrow, GhostButton, Panel, SectionHeading, Skeleton } from "@/components/primitives";
import { Field, LocalNote, Segmented, Stat, TextArea, fmtMoney, fmtR, toneOf } from "@/components/os";
import { dayKey, useCheckIns, usePlan, useReset, useReviews, useTrades, weekKey, type SetupGrade, type WeeklyReview } from "@/lib/os/store";
import { breakdowns, stats } from "@/lib/os/analytics";

function emptyReview(week: string): WeeklyReview {
  return { week, wentWell: "", toImprove: "", lesson: "", focusNext: "", grade: null, updatedAt: 0 };
}

function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

export default function ReviewPage() {
  const [trades, , tradesReady] = useTrades();
  const [checkIns] = useCheckIns();
  const [reviews, saveReviews, ready] = useReviews();
  const [reset] = useReset();
  const [plan] = usePlan();
  const [week, setWeek] = useState<string | null>(null);

  useEffect(() => setWeek(weekKey()), []);
  if (!ready || !tradesReady || !week) return <Skeleton className="mx-auto h-96 max-w-5xl" />;

  const end = addDays(week, 7);
  const inWeek = (t: number) => {
    const k = dayKey(t);
    return k >= week && k < end;
  };
  const weekTrades = trades.filter((t) => inWeek(t.closedAt ?? t.openedAt));
  const s = stats(weekTrades);
  const b = breakdowns(weekTrades);
  const topMistake = b.byMistake[0];
  const bestMarket = b.byMarket.slice().sort((x, y) => y.totalR - x.totalR)[0];
  const worstMarket = b.byMarket.slice().sort((x, y) => x.totalR - y.totalR)[0];

  const days = Array.from({ length: 7 }, (_, i) => checkIns[addDays(week, i)]).filter(Boolean);
  const avg = (f: (c: (typeof days)[number]) => number | null) => {
    const v = days.map(f).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, c) => a + c, 0) / v.length : null;
  };
  const ruleDays = days.filter((d) => d.followedRules != null);
  const resisted = reset.urges.filter((u) => u.resisted && inWeek(u.at)).length;

  const review = reviews[week] ?? emptyReview(week);
  const update = (patch: Partial<WeeklyReview>) =>
    saveReviews((all) => ({ ...all, [week]: { ...(all[week] ?? emptyReview(week)), ...patch, updatedAt: Date.now() } }));

  const isThisWeek = week === weekKey();
  const label = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  };
  const past = Object.values(reviews).filter((r) => r.updatedAt && r.week !== week).sort((a, c) => c.week.localeCompare(a.week));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SectionHeading
        title="Weekly Review"
        subtitle="Twenty minutes, once a week. The numbers come from your journal; the answers come from you."
      />

      <div className="flex flex-wrap items-center gap-2">
        <GhostButton onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week">←</GhostButton>
        <span className="display min-w-56 text-center text-sm font-bold uppercase tracking-widest">
          {isThisWeek ? "This week" : `Week of ${label(week)}`} · {label(week)} – {label(addDays(week, 6))}
        </span>
        <GhostButton onClick={() => setWeek(addDays(week, 7))} disabled={isThisWeek} aria-label="Next week">→</GhostButton>
      </div>

      <Panel className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Closed trades" value={String(s.trades)} />
        <Stat label="Win rate" value={s.trades ? `${s.winRate.toFixed(0)}%` : "—"} />
        <Stat label="Result" value={fmtR(s.totalR, 1)} tone={toneOf(s.totalR)} sub={s.hasPnl ? fmtMoney(s.pnl, plan.accountCurrency) : undefined} />
        <Stat label="Followed plan" value={s.planAdherence != null ? `${s.planAdherence.toFixed(0)}%` : "—"} />
        <Stat label="Check-ins" value={`${days.length}/7`} sub={ruleDays.length ? `${ruleDays.filter((d) => d.followedRules).length}/${ruleDays.length} rule days` : undefined} />
        <Stat label="Urges resisted" value={String(resisted)} tone={resisted ? "text-bull" : "text-bone"} />
      </Panel>

      <div className="grid gap-4 sm:grid-cols-3">
        <Insight title="Most costly mistake" value={topMistake ? topMistake.key : "None tagged"} detail={topMistake ? `${topMistake.trades} trade${topMistake.trades > 1 ? "s" : ""} · ${fmtR(topMistake.totalR, 1)}` : "Tag mistakes when you close trades."} bad={Boolean(topMistake)} />
        <Insight title="Best market" value={bestMarket && bestMarket.totalR > 0 ? bestMarket.key : "—"} detail={bestMarket && bestMarket.totalR > 0 ? fmtR(bestMarket.totalR, 1) : "No winning market yet this week."} />
        <Insight
          title="Mood · sleep · stress"
          value={[avg((c) => c.mood), avg((c) => c.sleep), avg((c) => c.stress)].map((v) => (v != null ? v.toFixed(1) : "—")).join(" · ")}
          detail={worstMarket && worstMarket.totalR < 0 ? `Toughest market: ${worstMarket.key} (${fmtR(worstMarket.totalR, 1)})` : "Averages from your morning check-ins."}
        />
      </div>

      <Panel className="space-y-4 p-5">
        <Eyebrow>Your review</Eyebrow>
        <Field label="What went well? Name the behaviour, not the P/L.">
          <TextArea value={review.wentWell} onChange={(v) => update({ wentWell: v })} />
        </Field>
        <Field label="One thing I will improve">
          <TextArea value={review.toImprove} onChange={(v) => update({ toImprove: v })} rows={2} />
        </Field>
        <Field label="What the market taught me this week">
          <TextArea value={review.lesson} onChange={(v) => update({ lesson: v })} rows={2} />
        </Field>
        <Field label="My one focus for next week">
          <TextArea value={review.focusNext} onChange={(v) => update({ focusNext: v })} rows={2} />
        </Field>
        <Field label="Grade the week on discipline">
          <div className="max-w-xs">
            <Segmented
              value={(review.grade ?? "") as SetupGrade}
              onChange={(v) => update({ grade: v })}
              options={(["A+", "A", "B", "C"] as SetupGrade[]).map((g) => ({ value: g, label: g }))}
            />
          </div>
        </Field>
        {topMistake && topMistake.trades >= 2 ? (
          <p className="border-l-2 border-gold bg-ink px-3 py-2 text-xs text-mute">
            &ldquo;{topMistake.key}&rdquo; showed up {topMistake.trades} times this week. If it shows up again next week,{" "}
            <Link href="/plan" className="text-gold hover:underline">make a rule about it</Link>.
          </p>
        ) : null}
      </Panel>

      {past.length ? (
        <Panel>
          <div className="border-b border-hairline-soft px-4 py-3"><Eyebrow>Past reviews</Eyebrow></div>
          {past.slice(0, 12).map((r) => (
            <button key={r.week} onClick={() => setWeek(r.week)} className="flex w-full items-center justify-between gap-3 border-b border-hairline-soft px-4 py-2.5 text-left text-sm transition last:border-b-0 hover:bg-panel-2">
              <span>Week of {label(r.week)}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-faint">{r.focusNext || r.toImprove || r.wentWell}</span>
              {r.grade ? <span className="border border-gold/40 px-1.5 text-[10px] font-bold text-gold">{r.grade}</span> : null}
            </button>
          ))}
        </Panel>
      ) : null}

      <LocalNote />
    </div>
  );
}

function Insight({ title, value, detail, bad = false }: { title: string; value: string; detail: string; bad?: boolean }) {
  return (
    <Panel className="p-4">
      <Eyebrow className="mb-1">{title}</Eyebrow>
      <div className={`display text-base font-bold ${bad ? "text-bear" : ""}`}>{value}</div>
      <div className="mt-0.5 text-xs text-faint">{detail}</div>
    </Panel>
  );
}

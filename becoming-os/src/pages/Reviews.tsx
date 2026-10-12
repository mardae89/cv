import { ChevronLeft, ChevronRight, Lightbulb } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSubmit } from "@/components/forms/body";
import { PcrBadge, usePowerIndex } from "@/components/power";
import { Button, Card, cx, Eyebrow, Field, Meter, Notice, PageHeader, Pill, Segmented, Stat, Table, Textarea, Toggle } from "@/components/ui";
import { useStore } from "@/data/store";
import { contentTally, firstStart, periodResult, settingsOf } from "@/lib/calc/power";
import { buildReview } from "@/lib/calc/reviews";
import { METRICS, trafficPeriod } from "@/lib/calc/traffic";
import { weightProgress } from "@/lib/calc/weight";
import { addDays, addMonths, dateRange, dow, fmtDate, fmtMonth, fmtWeekRange, maxDate, minDate, monthEnd, monthStart, weekStart } from "@/lib/dates";
import { lb, money, pct, signed } from "@/lib/format";
import type { ISODate, Review } from "@/lib/types";

export default function Reviews() {
  const { data, today, ev } = useStore();
  const [params, setParams] = useSearchParams();
  const period = params.get("period") === "month" ? "month" : "week";
  const defaultWeek = dow(today) === 0 ? weekStart(today) : addDays(weekStart(today), -7);
  const defaultMonth = Number(today.slice(8, 10)) <= 7 ? addMonths(monthStart(today), -1) : monthStart(today);
  const week = params.get("week") ?? defaultWeek;
  const month = params.get("month") ?? defaultMonth;
  const from = period === "week" ? weekStart(week) : monthStart(month);
  const to = period === "week" ? addDays(from, 6) : monthEnd(month);
  const end = to > today ? today : to;
  const r = buildReview(data, from, end, today, ev.unlocked);
  const wp = weightProgress(data.goals, data.weights);
  const existing = data.reviews.find((x) => x.period === period && x.period_start === from) ?? null;
  const set = (k: string, v: string) => setParams((p) => { const n = new URLSearchParams(p); n.set(k, v); return n; }, { replace: true });
  const shift = (n: number) => (period === "week" ? set("week", addDays(from, 7 * n)) : set("month", addMonths(from, n)));
  const canNext = period === "week" ? addDays(from, 7) <= today : addMonths(from, 1) <= today;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Reflection" title={period === "week" ? "Weekly review" : "Monthly review"}
        sub="Built from your saved records. Observations are patterns worth noticing, not proof of cause." />

      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Review period" value={period} onChange={(v) => set("period", v)} options={[{ value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
        <div className="flex items-center gap-1">
          <button className="rounded-lg p-2 text-mute hover:bg-raised hover:text-bone" aria-label="Previous period" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></button>
          <span className="num min-w-[170px] text-center text-[14px] text-bone">{period === "week" ? fmtWeekRange(from) : fmtMonth(from)}</span>
          <button className="rounded-lg p-2 text-mute hover:bg-raised hover:text-bone disabled:opacity-30" aria-label="Next period" disabled={!canNext} onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></button>
        </div>
        {existing?.completed_at && <Pill tone="gold">Completed</Pill>}
        {to > today && <Pill>In progress — through {fmtDate(today)}</Pill>}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <Eyebrow className="mb-3">Weight</Eyebrow>
          {r.weight ? (
            <>
              <div className="num text-[26px] font-semibold">{r.weight.change === null ? "—" : `${signed(r.weight.change)} lb`}</div>
              <p className="text-[12px] text-mute">7-day average {r.weight.startTrend !== null ? lb(r.weight.startTrend) : "—"} → {r.weight.endTrend !== null ? lb(r.weight.endTrend) : "—"}</p>
              <p className="mt-2 text-[12px] text-faint">{r.weight.weighIns} weigh-in{r.weight.weighIns === 1 ? "" : "s"}{wp ? ` · ${wp.lost.toFixed(1)} lb lost total · next ${wp.nextMilestone} lb` : ""}</p>
            </>
          ) : <p className="text-[13px] text-faint">Set a starting weight to review weight.</p>}
        </Card>
        <Card>
          <Eyebrow className="mb-3">Training</Eyebrow>
          <Meter value={r.training.sessions} max={r.training.target} right={`${r.training.sessions}/${r.training.target}`} label="Sessions" />
          <p className="mt-3 text-[12px] text-mute">{r.training.runMiles} run mi · longest {r.training.longestRun} mi · {r.training.strength} strength · {r.training.recoveryDays} rest/recovery</p>
        </Card>
        <Card>
          <Eyebrow className="mb-3">Sleep</Eyebrow>
          <div className="num text-[26px] font-semibold">{r.sleep.avgHours !== null ? `${r.sleep.avgHours} h` : "—"}</div>
          <p className="text-[12px] text-mute">{r.sleep.nights} nights logged · {r.sleep.nights7} at 7+ h{r.sleep.avgQuality !== null ? ` · quality ${r.sleep.avgQuality}/5` : ""}</p>
        </Card>
        <Card>
          <Eyebrow className="mb-3">Habits</Eyebrow>
          <div className="num text-[26px] font-semibold">{r.habits.pct === null ? "—" : pct(r.habits.pct)}</div>
          <p className="text-[12px] text-mute">{r.habits.done} of {r.habits.scheduled} scheduled</p>
        </Card>
      </div>

      <PowerReview from={from} to={to} period={period} />

      {r.business && (
        <Card>
          <Eyebrow className="mb-3">Business</Eyebrow>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Stat label="Revenue earned" value={money(r.business.revenue)} />
            <Stat label="Cash collected" value={money(r.business.cashIn)} />
            <Stat label="Expenses" value={money(r.business.expenses)} />
            <Stat label="Net profit" value={money(r.business.profit)} />
            <Stat label="New customers" value={r.business.newCustomers} />
          </div>
          {r.business.activity.length > 0 && (
            <div className="mt-4 grid gap-x-6 gap-y-3 border-t border-hair pt-4 sm:grid-cols-2 lg:grid-cols-3">
              {r.business.activity.map((a, i) => (
                a.target ? <Meter key={i} thin value={a.count} max={a.target} label={a.label} right={`${a.count}/${a.target}`} />
                  : <div key={i} className="flex justify-between text-[12px]"><span className="text-mute">{a.label}</span><span className="num text-bone">{a.count}</span></div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-[24px] leading-none">Observations</h2>
          {r.insights.length ? (
            <ul className="space-y-3">
              {r.insights.map((i) => (
                <li key={i.key} className={cx("rounded-xl border p-3", i.tone === "caution" ? "border-alert/30" : i.tone === "positive" ? "border-gold/30" : "border-hair")}>
                  <div className="flex items-center gap-2 text-[14px] text-bone"><Lightbulb className={cx("h-4 w-4", i.tone === "caution" ? "text-alert" : "text-gold")} />{i.title}</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-mute">{i.text}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-faint">No notable patterns yet. Observations appear once there's enough data to compare periods.</p>}
          {r.setbacks.length > 0 && (
            <div className="mt-4 border-t border-hair pt-3">
              <div className="eyebrow mb-2">Challenges this period</div>
              <ul className="list-disc space-y-1 pl-5 text-[13px] text-mute">{r.setbacks.map((s) => <li key={s}>{s}</li>)}</ul>
              <p className="mt-2 text-[11.5px] text-faint">Setbacks are information. Nothing you've earned is taken away.</p>
            </div>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 text-[24px] leading-none">Priorities for next {period}</h2>
          <ol className="list-decimal space-y-2 pl-5 text-[13.5px] text-bone/90">{r.priorities.map((p) => <li key={p}>{p}</li>)}</ol>
          <div className="mt-4 border-t border-hair pt-3">
            <div className="eyebrow mb-2">Milestones unlocked</div>
            {r.milestones.length ? <div className="flex flex-wrap gap-2">{r.milestones.map((m) => <Pill key={m.key} tone="gold">{m.title}</Pill>)}</div>
              : <p className="text-[13px] text-faint">None this {period}.</p>}
          </div>
        </Card>
      </div>

      {r.habitRows.length > 0 && (
        <Card>
          <h2 className="mb-2 text-[22px] leading-none">Habit by habit</h2>
          <Table head={["Habit", "Done", "Scheduled", "Rate"]} rows={r.habitRows.map((h) => [h.name, h.done, h.scheduled, h.pct === null ? "—" : `${h.pct}%`])} />
        </Card>
      )}

      <Reflection key={`${period}-${from}`} period={period} from={from} existing={existing} />

      {period === "month" && <p className="text-[13px] text-mute">This month's reflection also appears in its <Link to="/roadmap" className="link">roadmap chapter</Link>.</p>}
      <History />
    </div>
  );
}

/** The Power List score, content output and the four traffic numbers for the period under review. */
function PowerReview({ from, to, period }: { from: ISODate; to: ISODate; period: "week" | "month" }) {
  const { data, today } = useStore();
  const idx = usePowerIndex();
  if (!data.powerItems.length && !data.traffic.length && !data.contentIdeas.length) return null;
  const p = periodResult(data.powerItems, from, to, idx, today);
  const start = firstStart(data.powerItems);
  const end = minDate(to, today);
  const tally = contentTally(data.contentIdeas, from, to, settingsOf(data), dateRange(start ? maxDate(from, start) : from, end));
  const traffic = trafficPeriod(data.traffic, from, end);
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Eyebrow>Power List · content · traffic</Eyebrow>
        <Link to="/power" className="text-[12.5px] text-mute hover:text-gold">Power List →</Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="num text-[34px] font-semibold leading-none">{p.pct === null ? "—" : `${Math.round(p.pct)}%`}</span>
            <PcrBadge pct={p.pct} />
          </div>
          <p className="mt-2 text-[12px] text-mute">
            {p.due ? `PCR · ${p.done} of ${p.due} items · ${p.greenDays} green · ${p.orangeDays} orange · ${p.redDays} red${p.perfectDays ? ` · ${p.perfectDays} perfect` : ""}` : `No Power List items were due this ${period}.`}
          </p>
        </div>
        <div className="space-y-4">
          <Meter thin value={tally.shorts} max={Math.max(1, tally.shortTarget)} label="Short-form" right={`${tally.shorts}/${tally.shortTarget}`} />
          <Meter thin value={tally.longs} max={Math.max(1, tally.longTarget)} label="Long-form" right={`${tally.longs}/${tally.longTarget}`} />
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {METRICS.map((m) => <Stat key={m.key} label={m.label} value={Math.round(traffic.totals[m.key]).toLocaleString("en-US")} />)}
        </div>
      </div>
    </Card>
  );
}

const QUESTIONS: [keyof Review, string][] = [
  ["went_well", "What went well?"],
  ["difficult", "What was difficult?"],
  ["learned", "What did I learn?"],
  ["change_next", "What will I change next time?"],
  ["proud", "What am I proud of?"],
];

function Reflection({ period, from, existing }: { period: "week" | "month"; from: string; existing: Review | null }) {
  const { upsert } = useStore();
  const { busy, run } = useSubmit();
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(QUESTIONS.map(([k]) => [k, (existing?.[k] as string) ?? ""])));
  const [shared, setShared] = useState(existing?.shared ?? false);
  const save = (complete: boolean) => run(async () => {
    const filled = QUESTIONS.filter(([k]) => vals[k]?.trim()).length;
    if (complete && filled < 1) throw new Error("Answer at least one question to complete the review.");
    await upsert("reviews", {
      period, period_start: from, shared,
      ...Object.fromEntries(QUESTIONS.map(([k]) => [k, vals[k]?.trim() || null])),
      completed_at: complete ? existing?.completed_at ?? new Date().toISOString() : existing?.completed_at ?? null,
    }, "user_id,period,period_start");
    return complete ? (existing?.completed_at ? "Review saved." : "Review completed. Well done.") : "Draft saved.";
  });
  return (
    <Card>
      <h2 className="mb-1 text-[26px] leading-none">Reflection</h2>
      <p className="mb-4 text-[12.5px] text-mute">Private unless you choose to share it with your partner.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {QUESTIONS.map(([k, q]) => (
          <Field key={k} label={q}><Textarea value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} maxLength={3000} /></Field>
        ))}
      </div>
      <Toggle checked={shared} onChange={setShared} label="Share this reflection with my partner" />
      {existing?.completed_at && <Notice>Completed {fmtDate(existing.completed_at.slice(0, 10))}. You can still edit it.</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" busy={busy} onClick={() => save(false)}>Save draft</Button>
        <Button busy={busy} onClick={() => save(true)}>{existing?.completed_at ? "Save" : "Complete review"}</Button>
      </div>
    </Card>
  );
}

function History() {
  const { data } = useStore();
  const done = data.reviews.filter((r) => r.completed_at).sort((a, b) => (a.period_start < b.period_start ? 1 : -1));
  if (!done.length) return null;
  return (
    <Card>
      <h2 className="mb-3 text-[22px] leading-none">Past reviews</h2>
      <ul className="divide-y divide-hair">
        {done.map((r) => (
          <li key={r.id} className="py-2.5">
            <Link to={`/reviews?period=${r.period}&${r.period}=${r.period_start}`} className="flex items-center justify-between gap-3 text-[13.5px]">
              <span className="text-bone">{r.period === "week" ? `Week of ${fmtWeekRange(r.period_start)}` : fmtMonth(r.period_start)}</span>
              <span className="truncate text-[12px] text-mute">{r.proud || r.went_well || ""}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

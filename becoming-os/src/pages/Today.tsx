import { Award, Check, Dumbbell, NotebookPen, Plus, Receipt, Scale, Utensils, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AthleticCard, AudienceCard, BusinessCard, FitnessCard, PartnerFitnessCard } from "@/components/cards";
import { useFeedback } from "@/components/feedback";
import { Card, cx, Eyebrow, Meter, Notice, Ring } from "@/components/ui";
import { useStore } from "@/data/store";
import { isSession } from "@/lib/calc/athletic";
import { periodFinance } from "@/lib/calc/business";
import { dayScore, habitStreak, indexHabits, isScheduled, periodScore } from "@/lib/calc/habits";
import { closestMilestones, nextMilestone } from "@/lib/calc/milestones";
import { currentChapter } from "@/lib/calc/roadmap";
import { xpBetween } from "@/lib/calc/xp";
import { addDays, countdown, fmtDate, fmtLongDate, fmtShort, weekStart } from "@/lib/dates";
import { errorMessage, money, pct, plural } from "@/lib/format";

export function Today() {
  const s = useStore();
  const { data, today } = s;
  const c = countdown(today);
  const partner = s.partners[0];
  const chapter = currentChapter(today);

  const missing: { label: string; to: string }[] = [];
  if (!data.goals?.start_weight) missing.push({ label: "starting weight", to: "/settings#body" });
  if (!data.athletic?.readiness) missing.push({ label: "training readiness", to: "/settings#training" });
  if (data.profile.business_enabled && data.businessSettings?.baseline_revenue == null) missing.push({ label: "current business revenue", to: "/settings#business" });

  return (
    <div className="space-y-6">
      {/* 1 — how much time remains */}
      <section className="relative overflow-hidden rounded-3xl border border-hair bg-panel px-6 py-7 sm:px-9 sm:py-9 animate-rise">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold/10 blur-3xl" />
        <Eyebrow className="text-gold">
          {c.status === "active" ? `Day ${c.dayNumber} of ${c.calendarDays}` : c.status === "before" ? `Begins in ${plural(c.daysUntilStart, "day")}` : "Mission complete"}
          {" · "}{fmtLongDate(today)}
        </Eyebrow>
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div data-testid="days-remaining" className="display-num text-[84px] leading-[0.85] text-bone sm:text-[112px]">{c.remaining}</div>
            <div className="mt-2 text-[14px] text-mute">days remain until {fmtDate(c.end)}</div>
          </div>
          <div className="grid w-full grid-cols-3 gap-4 pb-1 sm:w-auto sm:min-w-[300px]">
            <div><div className="eyebrow mb-1">Elapsed</div><div className="num text-[20px] font-semibold">{c.elapsed}</div></div>
            <div><div className="eyebrow mb-1">Complete</div><div className="num text-[20px] font-semibold">{pct(c.pct, 1)}</div></div>
            <div><div className="eyebrow mb-1">Total</div><div className="num text-[20px] font-semibold">{c.spanDays}</div></div>
          </div>
        </div>
        <Meter className="mt-6" thin value={c.pct} />
        <div className="mt-2 flex justify-between text-[11px] text-faint">
          <span>{fmtDate(c.start)}</span>
          {chapter && <Link to="/roadmap" className="hidden text-mute hover:text-gold sm:inline">Chapter: {chapter.title}</Link>}
          <span>{fmtDate(c.end)}</span>
        </div>
      </section>

      {missing.length > 0 && (
        <Notice tone="gold" title="Finish setting up when you're ready">
          Still needed for accurate targets: {missing.map((m, i) => (
            <span key={m.label}>{i > 0 && ", "}<Link to={m.to} className="link">{m.label}</Link></span>
          ))}. Nothing is estimated in the meantime.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        {/* 4 — what to do today */}
        <TodayList />
        {/* 5 — next milestone */}
        <NextMilestoneCard />
      </div>

      {/* 2 — how far we've progressed */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-[28px]">Progress</h2>
          <Link to="/charts" className="text-[12.5px] text-mute hover:text-gold">All charts →</Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FitnessCard />
          {partner && <PartnerFitnessCard o={partner} />}
          {data.profile.business_enabled && <BusinessCard />}
          <AudienceCard compact />
          <AthleticCard />
        </div>
      </section>

      {/* 3 — what we accomplished this week */}
      <ThisWeek />
      <p className="pb-2 pt-4 text-center font-display text-[15px] italic text-faint">Build the body. Build the business. Build the man.</p>
    </div>
  );
}

function TodayList() {
  const { data, today, toggleHabit, insert, update, remove } = useStore();
  const { toast } = useFeedback();
  const [task, setTask] = useState("");
  const idx = indexHabits(data.completions, data.restDays);
  const score = dayScore(data.habits, idx, data.tasks, today);
  const scheduled = data.habits.filter((h) => isScheduled(h, today, idx.rest));
  const tasks = data.tasks.filter((t) => t.due_date === today);
  const overdue = data.tasks.filter((t) => t.due_date < today && !t.completed_on && t.due_date >= addDays(today, -14));
  const isRest = idx.rest.has(today);

  const addTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!task.trim()) return;
    try {
      await insert("tasks", { title: task.trim(), due_date: today });
      setTask("");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };
  const toggle = (id: string) => toggleHabit(id, today).catch((e) => toast(errorMessage(e), "error"));
  const toggleTask = (id: string, done: boolean) =>
    update("tasks", id, { completed_on: done ? null : today }).catch((e) => toast(errorMessage(e), "error"));

  return (
    <Card className="p-6">
      <div className="flex items-start gap-5">
        <Ring value={score.completed} max={score.total || 1} size={92}>
          <span className="num text-[22px] font-semibold">{score.total ? Math.round((score.completed / score.total) * 100) : 0}%</span>
          <span className="text-[10px] text-mute">{score.completed}/{score.total}</span>
        </Ring>
        <div className="min-w-0 flex-1">
          <Eyebrow className="mb-1">Daily execution</Eyebrow>
          <h2 className="text-[28px] leading-none">Today</h2>
          <p className="mt-1.5 text-[12.5px] text-mute">
            {isRest ? "Rest day — training habits are paused." : score.total ? `${score.total - score.completed} left of ${score.total} scheduled` : "Nothing scheduled today."}
          </p>
        </div>
      </div>

      <ul className="mt-5 divide-y divide-hair">
        {scheduled.map((h) => {
          const done = idx.done.has(`${h.id}|${today}`);
          const streak = habitStreak(h, idx, today);
          return (
            <li key={h.id}>
              <button onClick={() => toggle(h.id)} aria-pressed={done}
                className="flex w-full items-center gap-3 py-3 text-left">
                <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition",
                  done ? "border-gold bg-gold text-ink" : "border-line")}>{done && <Check className="h-3.5 w-3.5" />}</span>
                <span className={cx("flex-1 text-[14.5px]", done ? "text-mute line-through decoration-faint" : "text-bone")}>{h.name}</span>
                {streak > 1 && <span className="num text-[11px] text-gold">{streak}× streak</span>}
                <span className="num text-[11px] text-faint">+{h.xp}</span>
              </button>
            </li>
          );
        })}
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-3">
            <button onClick={() => toggleTask(t.id, !!t.completed_on)} aria-pressed={!!t.completed_on}
              className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition",
                t.completed_on ? "border-gold bg-gold text-ink" : "border-line")} aria-label={`Toggle ${t.title}`}>
              {t.completed_on && <Check className="h-3.5 w-3.5" />}
            </button>
            <span className={cx("flex-1 text-[14.5px]", t.completed_on ? "text-mute line-through" : "text-bone")}>{t.title}</span>
            <button className="p-1 text-faint hover:text-alert" aria-label={`Delete task ${t.title}`} onClick={() => remove("tasks", t.id).catch((e) => toast(errorMessage(e), "error"))}><X className="h-3.5 w-3.5" /></button>
          </li>
        ))}
        {!scheduled.length && !tasks.length && (
          <li className="py-4 text-[13px] text-mute">No habits scheduled. <Link to="/habits" className="link">Set up habits</Link></li>
        )}
      </ul>
      {overdue.length > 0 && (
        <p className="mt-2 text-[12px] text-faint">{plural(overdue.length, "open task")} from earlier days — <Link to="/habits#tasks" className="link">review</Link></p>
      )}
      <form onSubmit={addTask} className="mt-3 flex gap-2">
        <input value={task} onChange={(e) => setTask(e.target.value)} placeholder="Add a task for today" maxLength={160}
          className="input py-2.5 text-[14px]" aria-label="New task" />
        <button type="submit" className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border border-line text-gold" aria-label="Add task"><Plus className="h-4 w-4" /></button>
      </form>

      <div className="mt-5 grid grid-cols-5 gap-2 border-t border-hair pt-4">
        {[
          { to: "/log?tab=body", label: "Weight", icon: <Scale className="h-4 w-4" /> },
          { to: "/log?tab=training", label: "Workout", icon: <Dumbbell className="h-4 w-4" /> },
          { to: "/log?tab=nutrition", label: "Meal", icon: <Utensils className="h-4 w-4" /> },
          ...(data.profile.business_enabled ? [{ to: "/log?tab=business", label: "Sale", icon: <Receipt className="h-4 w-4" /> }] : []),
          { to: "/log?tab=mind", label: "Journal", icon: <NotebookPen className="h-4 w-4" /> },
        ].map((q) => (
          <Link key={q.to} to={q.to} className="flex flex-col items-center gap-1.5 rounded-xl py-2 text-[11px] text-mute hover:bg-raised hover:text-bone">
            <span className="text-gold">{q.icon}</span>{q.label}
          </Link>
        ))}
      </div>
    </Card>
  );
}

function NextMilestoneCard() {
  const { ev } = useStore();
  const m = nextMilestone(ev.milestones);
  const recent = ev.unlocked.filter((u) => u.category !== "level").slice(-1)[0];
  return (
    <Card className="flex flex-col p-6">
      <Eyebrow className="mb-1 text-gold">Next milestone</Eyebrow>
      {m ? (
        <>
          <h2 className="text-[32px] leading-[1.02]">{m.title}</h2>
          <p className="mt-2 text-[13px] text-mute">{m.requirement}</p>
          {m.progress && (
            <Meter className="mt-5" value={m.progress.current} max={m.progress.target}
              label="Progress" right={`${fmtProgress(m.progress.current, m.progress.unit)} / ${fmtProgress(m.progress.target, m.progress.unit)}`}
              sub={`${fmtProgress(Math.max(0, m.progress.target - m.progress.current), m.progress.unit)} to go`} />
          )}
        </>
      ) : (
        <p className="mt-2 text-[13px] text-mute">Log your first records to see what's next.</p>
      )}
      {m && closestMilestones(ev.milestones, 4).filter((x) => x.key !== m.key).length > 0 && (
        <div className="mt-6">
          <div className="eyebrow mb-2">Also within reach</div>
          <ul className="space-y-3">
            {closestMilestones(ev.milestones, 4).filter((x) => x.key !== m.key).slice(0, 3).map((x) => (
              <li key={x.key}>
                <Meter thin value={x.progress!.current} max={x.progress!.target} label={<span className="text-bone/90">{x.title}</span>}
                  right={<span className="text-[11.5px] font-normal text-mute">{fmtProgress(x.progress!.current, x.progress!.unit)} / {fmtProgress(x.progress!.target, x.progress!.unit)}</span>} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-auto pt-5">
        <div className="flex items-center justify-between border-t border-hair pt-4 text-[12.5px]">
          <span className="flex items-center gap-2 text-mute"><Award className="h-4 w-4 text-gold" />Level {ev.level.current.level} · {ev.level.current.name}</span>
          <Link to="/achievements" className="text-mute hover:text-gold">{ev.xp.total.toLocaleString()} XP →</Link>
        </div>
        {recent && <p className="mt-2 text-[12px] text-faint">Latest: {recent.title} · {fmtShort(recent.achievedOn)}</p>}
      </div>
    </Card>
  );
}

function fmtProgress(n: number, unit: string): string {
  if (unit === "$") return money(n);
  if (unit === "lb" || unit === "mi") return `${n.toFixed(1)} ${unit}`;
  return `${Math.round(n).toLocaleString("en-US")} ${unit}`;
}

function ThisWeek() {
  const { data, today, ev } = useStore();
  const ws = weekStart(today);
  const idx = indexHabits(data.completions, data.restDays);
  const habits = periodScore(data.habits, idx, ws, today);
  const sessions = data.workouts.filter((w) => isSession(w) && w.workout_date >= ws && w.workout_date <= today);
  const weighIns = data.weights.filter((w) => w.weight !== null && w.entry_date >= ws && w.entry_date <= today).length;
  const fin = periodFinance({ transactions: data.transactions, payments: data.payments }, ws, today);
  const outreach = data.activityLogs.filter((a) => a.log_date >= ws && a.log_date <= today &&
    data.metrics.find((m) => m.id === a.metric_id)?.kind === "outreach").reduce((x, a) => x + a.count, 0);
  const unlocked = ev.unlocked.filter((m) => m.achievedOn! >= ws && m.achievedOn! <= today);
  const xp = xpBetween(ev.xp.byDay, ws, today);
  const items = [
    { k: "Workouts", v: String(sessions.length) },
    { k: "Weigh-ins", v: String(weighIns) },
    { k: "Habits", v: habits.pct === null ? "—" : pct(habits.pct) },
    ...(data.profile.business_enabled ? [{ k: "Revenue", v: money(fin.revenue) }, { k: "Outreach", v: String(outreach) }] : []),
    { k: "XP earned", v: `+${xp}` },
  ];
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-[28px]">This week</h2>
        <Link to="/reviews" className="text-[12.5px] text-mute hover:text-gold">Weekly review →</Link>
      </div>
      <Card>
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
          {items.map((i) => (
            <div key={i.k}><div className="eyebrow mb-1">{i.k}</div><div className="num text-[20px] font-semibold">{i.v}</div></div>
          ))}
        </div>
        <div className="mt-5 border-t border-hair pt-4">
          <div className="eyebrow mb-2">Milestones unlocked</div>
          {unlocked.length ? (
            <ul className="flex flex-wrap gap-2">
              {unlocked.map((m) => <li key={m.key} className="rounded-full border border-gold/40 bg-gold-wash px-3 py-1 text-[12px] text-gold">{m.title}</li>)}
            </ul>
          ) : <p className="text-[13px] text-faint">None yet this week — the next one is above.</p>}
        </div>
      </Card>
    </section>
  );
}

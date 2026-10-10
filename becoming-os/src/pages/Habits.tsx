import { Check, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Chart, ChartCard, GOLD } from "@/components/charts";
import { useFeedback } from "@/components/feedback";
import { useSubmit } from "@/components/forms/body";
import { RecordList } from "@/components/RecordList";
import { Button, Card, cx, DayPicker, Field, Input, PageHeader, Pill, Select, Sheet, Stat, Toggle } from "@/components/ui";
import { useStore } from "@/data/store";
import { bestStreak, dayScore, habitStreak, indexHabits, periodScore, weeklyScores } from "@/lib/calc/habits";
import { addDays, DAY_LETTERS, fmtDate, fmtShort, monthStart, weekStart } from "@/lib/dates";
import { errorMessage, pct } from "@/lib/format";
import type { Habit, HabitCategory } from "@/lib/types";

const CATEGORIES: HabitCategory[] = ["body", "training", "nutrition", "recovery", "business", "mind", "relationship", "other"];

export default function Habits() {
  const { data, today, update, remove, insert } = useStore();
  const { confirm, toast } = useFeedback();
  const [edit, setEdit] = useState<Habit | "new" | null>(null);
  const idx = indexHabits(data.completions, data.restDays);
  const active = data.habits.filter((h) => !h.archived_on || h.archived_on > today);
  const archived = data.habits.filter((h) => h.archived_on && h.archived_on <= today);
  const day = dayScore(data.habits, idx, data.tasks, today);
  const week = periodScore(data.habits, idx, weekStart(today), today);
  const month = periodScore(data.habits, idx, monthStart(today), today);
  const weeks = weeklyScores(data.habits, idx, addDays(weekStart(today), -7 * 11), today).map((w) => ({ date: w.from, pct: w.pct }));
  const last28 = (h: Habit) => periodScore([h], idx, addDays(today, -27), today);

  const archive = async (h: Habit) => {
    if (!(await confirm({ title: `Archive “${h.name}”?`, body: "It stops being scheduled from today. Its history, streaks and XP are kept.", confirmLabel: "Archive" }))) return;
    update("habits", h.id, { archived_on: today < h.start_date ? h.start_date : today }).then(() => toast("Archived.")).catch((e) => toast(errorMessage(e), "error"));
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Discipline" title="Habits & routine" sub="Only scheduled days count. Rest days pause habits set to pause, and nothing you've earned is taken away for a missed day."
        action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit("new")}>New habit</Button>} />

      <div className="grid grid-cols-3 gap-4">
        <Card><Stat label="Today" value={day.pct === null ? "—" : pct(day.pct)} sub={`${day.completed}/${day.total} incl. tasks`} accent /></Card>
        <Card><Stat label="This week" value={week.pct === null ? "—" : pct(week.pct)} sub={`${week.done}/${week.scheduled} scheduled`} /></Card>
        <Card><Stat label="This month" value={month.pct === null ? "—" : pct(month.pct)} sub={`${month.done}/${month.scheduled} scheduled`} /></Card>
      </div>

      <Card>
        <h2 className="mb-4 text-[24px] leading-none">Active habits</h2>
        {active.length ? (
          <ul className="divide-y divide-hair">
            {active.map((h) => {
              const s28 = last28(h);
              return (
                <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[15px] text-bone">{h.name}<Pill>{h.category}</Pill>{h.skip_on_rest_days && <Pill>pauses on rest days</Pill>}</div>
                    <div className="mt-1 flex gap-1">
                      {DAY_LETTERS.map((l, d) => (
                        <span key={d} className={cx("flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold", h.schedule_days.includes(d) ? "bg-gold/90 text-ink" : "bg-raised text-faint")}>{l}</span>
                      ))}
                      {h.start_date > today && <span className="ml-2 text-[11px] text-faint">starts {fmtShort(h.start_date)}</span>}
                    </div>
                  </div>
                  <div className="num flex gap-5 text-[12px] text-mute">
                    <span><span className="text-bone">{habitStreak(h, idx, today)}</span> streak</span>
                    <span><span className="text-bone">{bestStreak(h, idx, today)}</span> best</span>
                    <span><span className="text-bone">{s28.pct === null ? "—" : pct(s28.pct)}</span> 28d</span>
                    <span className="text-gold">+{h.xp} XP</span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEdit(h)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => archive(h)}>Archive</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <p className="text-[13px] text-faint">No habits yet. Add a few — fewer, well-scheduled habits beat a long list.</p>}
      </Card>

      <ChartCard title="Weekly completion" sub="Scheduled habits completed, by week" empty={weeks.some((w) => w.pct !== null) ? false : "Completion history builds as you check habits off."}>
        <Chart data={weeks} x="date" height={200} fmt={(v) => `${Math.round(v)}%`} yDomain={[0, 100]} series={[{ key: "pct", label: "Completion", color: GOLD, type: "bar" }]} refs={[{ y: 80, label: "80%" }]} />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tasks />
        <RestDays />
      </div>

      {archived.length > 0 && (
        <Card>
          <h2 className="mb-2 text-[22px] leading-none">Archived</h2>
          <RecordList items={archived.map((h) => ({
            id: h.id, primary: h.name, secondary: `archived ${fmtDate(h.archived_on)} · history kept`,
            right: <button className="text-[12px] text-gold" onClick={() => update("habits", h.id, { archived_on: null }).catch((e) => toast(errorMessage(e), "error"))}>Restore</button>,
            onDelete: () => remove("habits", h.id), deleteLabel: `“${h.name}” permanently`,
            deleteWarning: "This deletes the habit and every completion recorded for it, including the XP those completions earned. Archiving keeps them.",
          }))} />
        </Card>
      )}

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "New habit" : "Edit habit"}>
        {edit && <HabitForm initial={edit === "new" ? undefined : edit} onDone={() => setEdit(null)}
          save={async (row, id) => { if (id) await update("habits", id, row); else await insert("habits", { ...row, sort_order: data.habits.length }); }} />}
      </Sheet>
    </div>
  );
}

function HabitForm({ initial, onDone, save }: { initial?: Habit; onDone: () => void; save: (row: Record<string, unknown>, id?: string) => Promise<void> }) {
  const { today } = useStore();
  const { busy, run } = useSubmit();
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<HabitCategory>(initial?.category ?? "other");
  const [days, setDays] = useState<number[]>(initial?.schedule_days ?? [0, 1, 2, 3, 4, 5, 6]);
  const [skip, setSkip] = useState(initial?.skip_on_rest_days ?? false);
  const [xp, setXp] = useState(String(initial?.xp ?? 10));
  const [start, setStart] = useState(initial?.start_date ?? today);
  return (
    <div className="space-y-4">
      <Field label="Habit"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. 10-minute evening walk" autoFocus /></Field>
      <Field label="Category">
        <Select value={category} onChange={(e) => setCategory(e.target.value as HabitCategory)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
        </Select>
      </Field>
      <Field group label="Scheduled days">
        <DayPicker value={days} onChange={setDays} />
        <div className="mt-2 flex gap-3 text-[12px]">
          <button type="button" className="link" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}>Every day</button>
          <button type="button" className="link" onClick={() => setDays([1, 2, 3, 4, 5])}>Weekdays</button>
          <button type="button" className="link" onClick={() => setDays([0, 6])}>Weekends</button>
        </div>
      </Field>
      <Toggle checked={skip} onChange={setSkip} label="Pause on rest days" sub="Good for training habits." />
      <div className="grid grid-cols-2 gap-3">
        <Field label="XP per completion">
          <Select value={xp} onChange={(e) => setXp(e.target.value)}>{[5, 10, 15, 20, 25].map((n) => <option key={n} value={n}>{n}</option>)}</Select>
        </Field>
        <Field label="Starts" hint={initial ? "Days before this don't count." : undefined}><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      </div>
      <Button busy={busy} className="w-full" onClick={() => run(async () => {
        if (!name.trim()) throw new Error("Name the habit.");
        if (!days.length) throw new Error("Choose at least one day.");
        await save({ name: name.trim(), category, schedule_days: days, skip_on_rest_days: skip, xp: Number(xp), start_date: start }, initial?.id);
        onDone();
        return initial ? "Habit updated." : "Habit added.";
      })}>{initial ? "Save" : "Add habit"}</Button>
    </div>
  );
}

function Tasks() {
  const { data, today, insert, update, remove } = useStore();
  const { toast } = useFeedback();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(today);
  const open = data.tasks.filter((t) => !t.completed_on).sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  const done = data.tasks.filter((t) => t.completed_on).slice(-5).reverse();
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await insert("tasks", { title: title.trim(), due_date: due });
      setTitle("");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };
  return (
    <Card id="tasks">
      <h2 className="mb-4 text-[24px] leading-none">Tasks</h2>
      <form onSubmit={add} className="mb-3 flex gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task" maxLength={160} aria-label="Task" />
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-[150px] shrink-0" aria-label="Due date" />
        <Button type="submit" className="shrink-0" aria-label="Add task"><Plus className="h-4 w-4" /></Button>
      </form>
      <ul className="divide-y divide-hair">
        {open.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-2.5">
            <button className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line" aria-label={`Complete ${t.title}`}
              onClick={() => update("tasks", t.id, { completed_on: today }).catch((e) => toast(errorMessage(e), "error"))} />
            <span className="flex-1 text-[14px] text-bone">{t.title}</span>
            <span className={cx("num text-[11.5px]", t.due_date < today ? "text-alert" : "text-faint")}>{t.due_date === today ? "today" : fmtShort(t.due_date)}</span>
            <button className="text-[11px] text-faint hover:text-alert" onClick={() => remove("tasks", t.id).catch((e) => toast(errorMessage(e), "error"))}>delete</button>
          </li>
        ))}
        {done.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-2.5 opacity-60">
            <button className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-gold bg-gold text-ink" aria-label={`Reopen ${t.title}`}
              onClick={() => update("tasks", t.id, { completed_on: null }).catch((e) => toast(errorMessage(e), "error"))}><Check className="h-3.5 w-3.5" /></button>
            <span className="flex-1 text-[14px] text-mute line-through">{t.title}</span>
            <span className="num text-[11.5px] text-faint">{fmtShort(t.completed_on)}</span>
          </li>
        ))}
      </ul>
      {!open.length && !done.length && <p className="text-[13px] text-faint">Tasks due today count toward the daily execution score.</p>}
    </Card>
  );
}

function RestDays() {
  const { data, today, upsert, remove } = useStore();
  const { toast } = useFeedback();
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const upcoming = data.restDays.filter((r) => r.rest_date >= addDays(today, -14)).sort((a, b) => (a.rest_date < b.rest_date ? -1 : 1));
  return (
    <Card>
      <h2 className="mb-1 text-[24px] leading-none">Rest days</h2>
      <p className="mb-4 text-[12.5px] text-mute">Plan them ahead. Habits set to pause aren't scheduled on rest days, so streaks hold.</p>
      <div className="mb-3 flex gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[150px] shrink-0" aria-label="Rest date" />
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" maxLength={300} />
        <Button className="shrink-0" onClick={() => upsert("restDays", { rest_date: date, note: note.trim() || null }, "user_id,rest_date").then(() => { setNote(""); toast("Rest day scheduled."); }).catch((e) => toast(errorMessage(e), "error"))}>Add</Button>
      </div>
      <RecordList items={upcoming.map((r) => ({
        id: r.id, primary: fmtDate(r.rest_date), secondary: r.note ?? (r.rest_date > today ? "scheduled" : r.rest_date === today ? "today" : "taken"),
        onDelete: () => remove("restDays", r.id), deleteLabel: "this rest day",
      }))} empty="No rest days in the last two weeks or planned." />
    </Card>
  );
}

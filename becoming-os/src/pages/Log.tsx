import { Check } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckinForm, PhotoUpload, SymptomForm, WeightForm } from "@/components/forms/body";
import { AudienceForm } from "@/components/forms/audience";
import { ActivityLogger, DealForm, KIND_LABEL, TransactionForm } from "@/components/forms/business";
import { JournalForm, MealForm } from "@/components/forms/misc";
import { WorkoutForm } from "@/components/forms/training";
import { useFeedback } from "@/components/feedback";
import { AudienceCard } from "@/components/cards";
import { Chart, ChartCard, SERIES } from "@/components/charts";
import { RecordList } from "@/components/RecordList";
import { Button, Card, cx, Input, PageHeader, Segmented, Sheet } from "@/components/ui";
import { useStore } from "@/data/store";
import { ACTIVITY_LABEL } from "@/lib/calc/athletic";
import { fmtCount, platformInfo, PLATFORMS, platformSeries } from "@/lib/calc/audience";
import { paidAmount } from "@/lib/calc/business";
import { indexHabits, isScheduled } from "@/lib/calc/habits";
import { fmtDate, fmtShort } from "@/lib/dates";
import { errorMessage, money, num, pace } from "@/lib/format";
import type { AudienceEntry, AudiencePlatform, DailyCheckin, JournalEntry, NutritionLog, SymptomLog, Transaction, WeightEntry, Workout } from "@/lib/types";

type Tab = "body" | "training" | "nutrition" | "business" | "audience" | "mind";

export default function Log() {
  const { data } = useStore();
  const [params, setParams] = useSearchParams();
  const tabs: { value: Tab; label: string }[] = [
    { value: "body", label: "Body" },
    { value: "training", label: "Training" },
    { value: "nutrition", label: "Nutrition" },
    ...(data.profile.business_enabled ? [{ value: "business" as Tab, label: "Business" }] : []),
    { value: "audience", label: "Audience" },
    { value: "mind", label: "Habits & mind" },
  ];
  const tab = (tabs.find((t) => t.value === params.get("tab"))?.value ?? "body") as Tab;
  return (
    <div>
      <PageHeader eyebrow="Logging centre" title="Record it" sub="Quick entries for everything. Every record is editable later, and every total recalculates." />
      <div className="-mx-4 mb-6 overflow-x-auto px-4">
        <Segmented value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} options={tabs} />
      </div>
      {tab === "body" && <BodyTab />}
      {tab === "training" && <TrainingTab />}
      {tab === "nutrition" && <NutritionTab />}
      {tab === "business" && <BusinessTab />}
      {tab === "audience" && <AudienceTab />}
      {tab === "mind" && <MindTab />}
    </div>
  );
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <h2 className="mb-4 text-[24px] leading-none">{title}</h2>
      {children}
    </Card>
  );
}

function BodyTab() {
  const { data, remove } = useStore();
  const [editW, setEditW] = useState<WeightEntry | null>(null);
  const [editC, setEditC] = useState<DailyCheckin | null>(null);
  const [editS, setEditS] = useState<SymptomLog | null>(null);
  const weights = [...data.weights].reverse();
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Weigh-in"><WeightForm /></Panel>
      <Panel title="Daily check-in"><CheckinForm /></Panel>
      <Panel title="Pain & symptoms"><SymptomForm /></Panel>
      <Panel title="Progress photo"><PhotoUpload /></Panel>
      <Panel title="Recent weigh-ins">
        <RecordList limit={10} items={weights.map((w) => ({
          id: w.id, primary: w.weight !== null ? `${w.weight} lb` : `Waist ${w.waist_in} in`,
          secondary: [fmtDate(w.entry_date), w.waist_in && w.weight !== null ? `waist ${w.waist_in} in` : null, w.flagged ? "confirmed unusual change" : null, w.note].filter(Boolean).join(" · "),
          onEdit: () => setEditW(w), onDelete: () => remove("weights", w.id), deleteLabel: "this weigh-in",
        }))} />
        {weights.length > 10 && <Link to="/progress" className="link mt-2 inline-block text-[13px]">Full history →</Link>}
      </Panel>
      <Panel title="Recent check-ins & symptoms">
        <RecordList limit={6} items={[...data.checkins].reverse().map((c) => ({
          id: c.id, primary: fmtDate(c.checkin_date),
          secondary: [c.sleep_hours != null && `${c.sleep_hours} h sleep`, c.energy && `energy ${c.energy}/5`, c.soreness && `soreness ${c.soreness}/5`, c.water_oz && `${c.water_oz} oz water`].filter(Boolean).join(" · "),
          onEdit: () => setEditC(c), onDelete: () => remove("checkins", c.id),
        }))} empty="No check-ins yet." />
        <div className="mt-4 border-t border-hair pt-3">
          <RecordList limit={6} items={[...data.symptoms].reverse().map((s) => ({
            id: s.id, primary: `${s.body_area}${s.side && s.side !== "n/a" ? ` (${s.side})` : ""} · ${s.pain_level}/10`,
            secondary: [fmtDate(s.log_date), s.pain_type, s.during].filter(Boolean).join(" · "),
            onEdit: () => setEditS(s), onDelete: () => remove("symptoms", s.id),
          }))} empty="No symptoms logged." />
        </div>
      </Panel>
      <Sheet open={!!editW} onClose={() => setEditW(null)} title="Edit weigh-in">{editW && <WeightForm initial={editW} onDone={() => setEditW(null)} />}</Sheet>
      <Sheet open={!!editC} onClose={() => setEditC(null)} title="Edit check-in">{editC && <CheckinForm initial={editC} onDone={() => setEditC(null)} />}</Sheet>
      <Sheet open={!!editS} onClose={() => setEditS(null)} title="Edit symptoms">{editS && <SymptomForm initial={editS} onDone={() => setEditS(null)} />}</Sheet>
    </div>
  );
}

function TrainingTab() {
  const { data, today, upsert, remove } = useStore();
  const { toast } = useFeedback();
  const [edit, setEdit] = useState<Workout | null>(null);
  const rest = data.restDays.find((r) => r.rest_date === today);
  const toggleRest = async () => {
    try {
      if (rest) await remove("restDays", rest.id);
      else await upsert("restDays", { rest_date: today }, "user_id,rest_date");
      toast(rest ? "Rest day removed." : "Rest day marked. Training habits are paused today.");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <Panel title="Log a workout"><WorkoutForm /></Panel>
      <div className="space-y-5">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[22px] leading-none">Rest day</h2>
              <p className="mt-1 text-[12.5px] text-mute">Scheduled recovery counts. Rest days pause training habits and never break streaks.</p>
            </div>
            <Button variant={rest ? "secondary" : "primary"} size="sm" onClick={toggleRest} icon={rest ? <Check className="h-4 w-4" /> : undefined}>
              {rest ? "Rest day" : "Mark today"}
            </Button>
          </div>
        </Card>
        <Panel title="Recent workouts">
          <RecordList limit={12} items={[...data.workouts].reverse().map((w) => ({
            id: w.id,
            primary: `${ACTIVITY_LABEL[w.activity]}${w.title ? ` · ${w.title}` : ""}${w.is_race ? " · Race" : ""}`,
            secondary: [fmtDate(w.workout_date), w.duration_min && `${w.duration_min} min`, w.distance_mi && `${w.distance_mi} mi`,
              w.distance_mi && w.duration_min && (w.activity === "run" || w.activity === "run_walk") ? pace(num(w.duration_min) / num(w.distance_mi)) : null,
              w.pain_level !== null && `pain ${w.pain_level}/10`].filter(Boolean).join(" · "),
            onEdit: () => setEdit(w), onDelete: () => remove("workouts", w.id), deleteLabel: "this workout",
          }))} empty="No workouts yet." />
        </Panel>
      </div>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title="Edit workout" wide>{edit && <WorkoutForm initial={edit} onDone={() => setEdit(null)} />}</Sheet>
    </div>
  );
}

function NutritionTab() {
  const { data, today, remove } = useStore();
  const [date, setDate] = useState(today);
  const [edit, setEdit] = useState<NutritionLog | null>(null);
  const meals = data.nutrition.filter((n) => n.log_date === date);
  const sum = (k: "calories" | "protein_g" | "carbs_g" | "fat_g") => meals.reduce((s, m) => s + num(m[k]), 0);
  const water = data.checkins.find((c) => c.checkin_date === date)?.water_oz;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Log a meal"><MealForm key={date} date={date} /></Panel>
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[24px] leading-none">Day total</h2>
          <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="w-auto py-2" aria-label="Day" />
        </div>
        <div className="grid grid-cols-5 gap-2 text-center">
          {[["Calories", Math.round(sum("calories"))], ["Protein", `${Math.round(sum("protein_g"))}g`], ["Carbs", `${Math.round(sum("carbs_g"))}g`], ["Fat", `${Math.round(sum("fat_g"))}g`], ["Water", water != null ? `${water}oz` : "—"]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-raised px-1 py-3"><div className="eyebrow mb-1 text-[9px]">{k}</div><div className="num text-[16px] font-semibold">{v}</div></div>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] text-faint">Water is logged in the daily check-in.</p>
        <div className="mt-4">
          <RecordList items={meals.map((m) => ({
            id: m.id, primary: `${m.meal[0].toUpperCase() + m.meal.slice(1)}${m.description ? ` · ${m.description}` : ""}`,
            secondary: [m.calories != null && `${m.calories} kcal`, m.protein_g != null && `${m.protein_g} g protein`].filter(Boolean).join(" · "),
            onEdit: () => setEdit(m), onDelete: () => remove("nutrition", m.id), deleteLabel: "this meal",
          }))} empty="No meals logged for this day." />
        </div>
      </Card>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title="Edit meal">{edit && <MealForm initial={edit} onDone={() => setEdit(null)} />}</Sheet>
    </div>
  );
}

export function TransactionList({ items, limit }: { items: Transaction[]; limit?: number }) {
  const { data, remove } = useStore();
  const [edit, setEdit] = useState<Transaction | null>(null);
  const bizName = (id: string | null) => data.businesses.find((b) => b.id === id)?.name;
  return (
    <>
      <RecordList limit={limit} items={items.map((t) => {
        const paid = t.kind === "sale" ? paidAmount(data.payments, t.id) : null;
        return {
          id: t.id,
          primary: `${KIND_LABEL[t.kind].replace(/ \(.*\)/, "")}${t.description ? ` · ${t.description}` : ""}`,
          secondary: [fmtShort(t.txn_date), bizName(t.business_id), t.recurring && "recurring",
            paid !== null && (paid >= num(t.amount) - 0.004 ? "paid" : `collected ${money(paid)}`),
            t.customer_id && data.customers.find((c) => c.id === t.customer_id)?.name].filter(Boolean).join(" · "),
          right: <span className={cx(t.kind === "expense" || t.kind === "refund" ? "text-mute" : t.kind === "transfer" ? "text-faint" : "text-bone")}>
            {t.kind === "expense" || t.kind === "refund" ? "−" : ""}{money(t.amount, true)}</span>,
          onEdit: () => setEdit(t),
          onDelete: () => remove("transactions", t.id),
          deleteLabel: "this transaction",
          deleteWarning: t.kind === "sale" ? "This also deletes the payments recorded against it. Revenue, cash, profit and milestones recalculate." : undefined,
        };
      })} empty="No transactions yet." />
      <Sheet open={!!edit} onClose={() => setEdit(null)} title="Edit transaction" wide>{edit && <TransactionForm initial={edit} onDone={() => setEdit(null)} />}</Sheet>
    </>
  );
}

function BusinessTab() {
  const { data, today } = useStore();
  const [deal, setDeal] = useState(false);
  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <Panel title="Record a transaction"><TransactionForm /></Panel>
      <div className="space-y-5">
        <Panel title={`Activity · ${fmtShort(today)}`}><ActivityLogger date={today} /></Panel>
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-[22px] leading-none">Pipeline</h2>
            <Button size="sm" variant="secondary" onClick={() => setDeal(true)}>Add lead</Button>
          </div>
        </Card>
        <Panel title="Recent transactions">
          <TransactionList items={[...data.transactions].reverse()} limit={10} />
        </Panel>
      </div>
      <Sheet open={deal} onClose={() => setDeal(false)} title="Add to pipeline"><DealForm onDone={() => setDeal(false)} /></Sheet>
    </div>
  );
}

function AudienceTab() {
  const { data, remove } = useStore();
  const [edit, setEdit] = useState<AudienceEntry | null>(null);
  const [platform, setPlatform] = useState<AudiencePlatform>(
    () => PLATFORMS.find((p) => data.audience.some((e) => e.platform === p.key))?.key ?? "instagram");
  const info = platformInfo(platform);
  const series = platformSeries(data.audience, platform);
  const recent = [...data.audience].sort((a, b) =>
    a.recorded_on !== b.recorded_on ? (a.recorded_on < b.recorded_on ? 1 : -1) : PLATFORMS.findIndex((p) => p.key === a.platform) - PLATFORMS.findIndex((p) => p.key === b.platform));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Record audience"><AudienceForm /></Panel>
      <div className="space-y-5">
        <AudienceCard />
        <ChartCard title={`${info.name} ${info.unit}`}
          action={<Segmented size="sm" value={platform} onChange={setPlatform} options={PLATFORMS.map((p) => ({ value: p.key, label: p.name }))} />}
          empty={series.length ? false : `No ${info.name} readings yet.`}>
          <Chart data={series.map((r) => ({ date: r.date, count: r.count }))} x="date" height={220} fmt={fmtCount} yWidth={56}
            series={[{ key: "count", label: info.unit, color: SERIES[PLATFORMS.indexOf(info)] }]} />
        </ChartCard>
      </div>
      <Panel title="Recent readings" className="lg:col-span-2">
        <RecordList limit={12} items={recent.map((e) => {
          const p = platformInfo(e.platform);
          return {
            id: e.id, primary: `${p.name} · ${fmtCount(e.count)} ${p.unit}`,
            secondary: [fmtDate(e.recorded_on), e.note].filter(Boolean).join(" · "),
            onEdit: () => setEdit(e), onDelete: () => remove("audience", e.id), deleteLabel: "this reading",
          };
        })} empty="No readings yet. Enter today's totals above." />
      </Panel>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title="Edit reading">{edit && <AudienceForm initial={edit} onDone={() => setEdit(null)} />}</Sheet>
    </div>
  );
}

function MindTab() {
  const { data, today, toggleHabit, remove } = useStore();
  const { toast } = useFeedback();
  const [edit, setEdit] = useState<JournalEntry | null>(null);
  const [date, setDate] = useState(today);
  const idx = indexHabits(data.completions, data.restDays);
  const scheduled = data.habits.filter((h) => isScheduled(h, date, idx.rest));
  const extra = data.habits.filter((h) => !h.archived_on && !scheduled.includes(h) && date >= h.start_date);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[24px] leading-none">Habits</h2>
          <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="w-auto py-2" aria-label="Habit date" />
        </div>
        <ul className="divide-y divide-hair">
          {[...scheduled, ...extra].map((h) => {
            const done = idx.done.has(`${h.id}|${date}`);
            return (
              <li key={h.id}>
                <button className="flex w-full items-center gap-3 py-3 text-left" aria-pressed={done}
                  onClick={() => toggleHabit(h.id, date).catch((e) => toast(errorMessage(e), "error"))}>
                  <span className={cx("flex h-6 w-6 items-center justify-center rounded-full border", done ? "border-gold bg-gold text-ink" : "border-line")}>{done && <Check className="h-3.5 w-3.5" />}</span>
                  <span className={cx("flex-1 text-[14.5px]", done ? "text-mute" : "text-bone")}>{h.name}</span>
                  {!scheduled.includes(h) && <span className="text-[11px] text-faint">not scheduled</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {!data.habits.length && <p className="text-[13px] text-mute">No habits yet. <Link className="link" to="/habits">Create habits</Link></p>}
        <p className="mt-3 text-[12px] text-faint">Completing an unscheduled habit still counts — it just isn't required that day.</p>
      </Card>
      <Panel title="Journal & learning"><JournalForm /></Panel>
      <Panel title="Recent entries" className="lg:col-span-2">
        <RecordList limit={10} items={[...data.journal].reverse().map((j) => ({
          id: j.id, primary: j.title || j.body.slice(0, 80),
          secondary: [fmtDate(j.entry_date), j.kind, j.minutes && `${j.minutes} min`, j.shared ? "shared with partner" : "private"].filter(Boolean).join(" · "),
          onEdit: () => setEdit(j), onDelete: () => remove("journal", j.id), deleteLabel: "this entry",
        }))} empty="No entries yet." />
        <Link to="/reviews" className="link mt-3 inline-block text-[13px]">Weekly reflection →</Link>
      </Panel>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title="Edit entry">{edit && <JournalForm initial={edit} onDone={() => setEdit(null)} />}</Sheet>
    </div>
  );
}

import { AlertTriangle, Lock } from "lucide-react";
import { useState } from "react";
import { Chart, ChartCard, GOLD, RangePicker, rangeFor, type RangeKey } from "@/components/charts";
import { useFeedback } from "@/components/feedback";
import { SymptomForm } from "@/components/forms/body";
import { WorkoutForm } from "@/components/forms/training";
import { RecordList } from "@/components/RecordList";
import { Button, Card, cx, DayPicker, Eyebrow, Field, Input, Meter, Notice, NumberInput, PageHeader, Select, Sheet, Stat, Table, Textarea } from "@/components/ui";
import { useStore } from "@/data/store";
import {
  ACTIVITY_LABEL, injuryAlert, longestRun, longestRunProgression, PHASES, READINESS_LABEL, runningUnlocked, strengthPRs,
  symptomSummary, trainingWeek, trainingWeeks,
} from "@/lib/calc/athletic";
import { addDays, diffDays, fmtDate, fmtShort } from "@/lib/dates";
import { errorMessage, num, pace, round } from "@/lib/format";
import type { Activity, Phase, Readiness, Workout } from "@/lib/types";

export default function Train() {
  const { data, today, ev, remove } = useStore();
  const [range, setRange] = useState<RangeKey>("90d");
  const [log, setLog] = useState(false);
  const [symptom, setSymptom] = useState(false);
  const [settings, setSettings] = useState(false);
  const [edit, setEdit] = useState<Workout | null>(null);
  const [filter, setFilter] = useState<Activity | "all">("all");
  const ap = data.athletic;
  const target = ap?.weekly_session_target ?? 3;
  const week = trainingWeek(data.workouts, today, target, today);
  const lr = longestRun(data.workouts);
  const sym = symptomSummary(data.symptoms, today);
  const alert = injuryAlert(ap, sym);
  const unlocked = runningUnlocked(ap?.readiness ?? null);
  // Newest first by date (records are kept in the order they were entered, so a backfilled one would otherwise sit on top).
  const byDate = [...data.workouts].reverse().sort((a, b) => (a.workout_date < b.workout_date ? 1 : a.workout_date > b.workout_date ? -1 : 0));
  const { from, to } = rangeFor(range, today, byDate[byDate.length - 1]?.workout_date);
  const weeks = trainingWeeks(data.workouts, from, to, target).map((w) => ({ ...w, date: w.weekStart }));
  const progression = longestRunProgression(data.workouts).filter((p) => p.date >= from);
  const prs = strengthPRs(data.sets, data.workouts);
  const recent = data.checkins.filter((c) => c.checkin_date > addDays(today, -14));
  const avg = (k: "sleep_hours" | "soreness" | "fatigue" | "energy") => {
    const xs = recent.filter((c) => c[k] !== null).map((c) => num(c[k]));
    return xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length, 1) : null;
  };
  const athletic = ev.milestones.filter((m) => m.category === "athletic");
  const painSeries = data.symptoms.filter((s) => s.log_date >= from && s.log_date <= to)
    .sort((a, b) => (a.log_date < b.log_date ? -1 : a.log_date > b.log_date ? 1 : 0)).map((s) => ({ date: s.log_date, pain: s.pain_level }));
  const raceIn = ap?.race_date ? diffDays(today, ap.race_date) : null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Hybrid athlete" title={ap?.goal_text || "Training"}
        sub={ap?.race_date ? `${ap.race_name || "Race"} · ${fmtDate(ap.race_date)}${raceIn !== null && raceIn >= 0 ? ` · ${raceIn} days` : ""}` : "Complete a 10K — finishing, not chasing a pace."}
        action={<div className="flex gap-2"><Button variant="secondary" onClick={() => setSettings(true)}>Plan settings</Button><Button onClick={() => setLog(true)}>Log workout</Button></div>} />

      {/* injury awareness */}
      <Card className={cx(alert.level === "assess" && "border-alert/40")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <Eyebrow className={cx("mb-2", alert.level === "assess" ? "text-alert" : "")}>Injury awareness</Eyebrow>
            <h2 className="flex items-center gap-2 text-[26px] leading-none">
              {alert.level === "assess" && <AlertTriangle className="h-5 w-5 text-alert" />}
              {alert.title || "No recent symptoms"}
            </h2>
            <p className="mt-2 text-[13.5px] text-mute">{alert.message || "Nothing logged in the last two weeks. Keep logging any pain, even mild, so the history is accurate."}</p>
            <p className="mt-3 text-[12px] text-faint">
              Status: <span className="text-bone">{ap?.readiness ? READINESS_LABEL[ap.readiness] : "not set"}</span>
              {ap?.assessed_on && ` · assessed ${fmtDate(ap.assessed_on)}`} · {sym.logs} symptom log{sym.logs === 1 ? "" : "s"} in 14 days{sym.maxPain ? `, max ${sym.maxPain}/10` : ""}
            </p>
          </div>
          <Button variant={alert.level === "assess" ? "danger" : "secondary"} onClick={() => setSymptom(true)}>Log pain / symptoms</Button>
        </div>
        <p className="mt-4 border-t border-hair pt-3 text-[11.5px] text-faint">
          BECOMING OS can't diagnose injuries or clear you to run. If pain persists, is sharp, or changes how you walk, see a doctor or physical therapist.
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="md:col-span-2">
          <Meter value={week.sessions} max={target} label="This week" right={`${week.sessions} / ${target} sessions`} />
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat label="Run miles" value={week.runMiles.toFixed(1)} />
            <Stat label="Strength" value={week.strength} />
            <Stat label="Minutes" value={week.minutes} />
          </div>
        </Card>
        <Card><Stat label="Longest run" value={lr.distance ? `${lr.distance} mi` : "—"} sub={lr.date ? fmtDate(lr.date) : "No runs yet"} accent /></Card>
        <Card>
          <Stat label="Recovery (14 days)" value={avg("sleep_hours") !== null ? `${avg("sleep_hours")} h sleep` : "—"}
            sub={[avg("soreness") !== null && `soreness ${avg("soreness")}/5`, avg("fatigue") !== null && `fatigue ${avg("fatigue")}/5`].filter(Boolean).join(" · ") || "Log check-ins to see this"} />
        </Card>
      </div>

      {/* phased roadmap */}
      <Card>
        <h2 className="mb-1 text-[26px] leading-none">Phased roadmap</h2>
        <p className="mb-5 text-[13px] text-mute">You choose when to move on. Signals are suggestions — progress only when you're recovering well and, for running phases, after clearance.</p>
        <ol className="grid gap-3 lg:grid-cols-5">
          {PHASES.map((p, i) => {
            const current = (ap?.phase ?? "foundation") === p.key;
            const locked = p.requiresClearance && !unlocked;
            return (
              <li key={p.key} className={cx("rounded-2xl border p-4", current ? "border-gold bg-gold-wash" : "border-hair")}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="eyebrow">{`Phase ${i + 1}`}</span>
                  {locked ? <Lock className="h-3.5 w-3.5 text-faint" /> : current && <span className="text-[10.5px] font-semibold text-gold">CURRENT</span>}
                </div>
                <div className="font-display text-[20px] leading-tight text-bone">{p.name}</div>
                <p className="mt-2 text-[12px] leading-relaxed text-mute">{locked ? "Paused until the ankle is assessed and a clinician agrees you can run." : p.focus}</p>
                {!locked && <p className="mt-2 text-[11.5px] text-faint">Signals: {p.signals}</p>}
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="flex justify-end"><RangePicker value={range} onChange={setRange} /></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Sessions per week" sub={`Target ${target}`} empty={weeks.some((w) => w.sessions) ? false : "No sessions in this range."}>
          <Chart data={weeks} x="date" height={220} fmt={(v) => String(Math.round(v))} series={[{ key: "sessions", label: "Sessions", color: GOLD, type: "bar" }]} refs={[{ y: target, label: "Target" }]} />
        </ChartCard>
        <ChartCard title="Running distance per week" sub="Run + run-walk miles" empty={weeks.some((w) => w.runMiles) ? false : "No runs in this range."}>
          <Chart data={weeks} x="date" height={220} fmt={(v) => `${round(v, 1)}`} series={[{ key: "runMiles", label: "Miles", color: GOLD, type: "bar" }]} />
        </ChartCard>
        <ChartCard title="Longest run progression" empty={progression.length ? false : "Your longest-run records appear here."}>
          <Chart data={progression} x="date" height={220} fmt={(v) => `${round(v, 1)}`} series={[{ key: "distance", label: "Longest run (mi)", color: GOLD }]} refs={[{ y: 6.2, label: "10K" }]} />
        </ChartCard>
        <ChartCard title="Pain log" sub="0–10, from symptom entries" empty={painSeries.length ? false : "No symptoms logged in this range."}>
          <Chart data={painSeries} x="date" height={220} fmt={(v) => String(Math.round(v))} yDomain={[0, 10]} series={[{ key: "pain", label: "Pain", color: "#d55181", type: "dots" }]} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-[24px] leading-none">Athletic milestones</h2>
          <ul className="space-y-1.5">
            {athletic.map((m) => (
              <li key={m.key} className={cx("flex items-center justify-between gap-3 rounded-xl px-3 py-2", m.achievedOn && "bg-gold-wash")}>
                <div className="min-w-0">
                  <div className={cx("text-[13.5px]", m.achievedOn ? "text-bone" : "text-mute")}>{m.title}</div>
                  <div className="truncate text-[11.5px] text-faint">{m.achievedOn ? fmtDate(m.achievedOn) : m.requirement}</div>
                </div>
                {m.progress && !m.achievedOn && <span className="num shrink-0 text-[12px] text-faint">{round(m.progress.current, 1)}/{m.progress.target}</span>}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-4 text-[24px] leading-none">Strength records</h2>
          <Table head={["Exercise", "Heaviest", "Est. 1RM", "Date"]} rows={prs.slice(0, 10).map((p) => [
            p.exercise, `${p.bestWeight > 0 ? `${p.bestWeight} lb` : "Bodyweight"}${p.bestWeightReps > 0 ? ` × ${p.bestWeightReps}` : ""}`,
            p.bestWeight > 0 ? `${p.est1RM} lb` : "—", fmtShort(p.date),
          ])} empty="Log a strength workout with exercises to see records." />
          <p className="mt-2 text-[11px] text-faint">Estimated 1RM uses the Epley formula — an estimate, not a target to test.</p>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[24px] leading-none">Workout history</h2>
          <Select value={filter} onChange={(e) => setFilter(e.target.value as Activity | "all")} className="w-auto py-2" aria-label="Filter by activity">
            <option value="all">All activities</option>
            {(Object.keys(ACTIVITY_LABEL) as Activity[]).map((a) => <option key={a} value={a}>{ACTIVITY_LABEL[a]}</option>)}
          </Select>
        </div>
        <RecordList limit={40} items={byDate.filter((w) => filter === "all" || w.activity === filter).map((w) => ({
          id: w.id,
          primary: `${ACTIVITY_LABEL[w.activity]}${w.title ? ` · ${w.title}` : ""}${w.is_race ? " · Race" : ""}`,
          secondary: [fmtDate(w.workout_date), w.duration_min && `${w.duration_min} min`, w.distance_mi && `${w.distance_mi} mi`,
            (w.activity === "run" || w.activity === "run_walk") && w.distance_mi && w.duration_min ? pace(num(w.duration_min) / num(w.distance_mi)) : null,
            w.rpe && `RPE ${w.rpe}`, w.pain_level !== null && `pain ${w.pain_level}/10`,
            w.activity === "strength" && `${data.sets.filter((s) => s.workout_id === w.id).length} sets`].filter(Boolean).join(" · "),
          onEdit: () => setEdit(w), onDelete: () => remove("workouts", w.id), deleteLabel: "this workout",
        }))} empty={filter === "all" ? "No workouts yet." : `No ${ACTIVITY_LABEL[filter].toLowerCase()} workouts logged.`} />
      </Card>

      <Sheet open={log} onClose={() => setLog(false)} title="Log workout" wide><WorkoutForm onDone={() => setLog(false)} /></Sheet>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title="Edit workout" wide>{edit && <WorkoutForm initial={edit} onDone={() => setEdit(null)} />}</Sheet>
      <Sheet open={symptom} onClose={() => setSymptom(false)} title="Pain & symptoms"><SymptomForm onDone={() => setSymptom(false)} /></Sheet>
      <Sheet open={settings} onClose={() => setSettings(false)} title="Training plan" wide><TrainingSettings onDone={() => setSettings(false)} /></Sheet>
    </div>
  );
}

export function TrainingSettings({ onDone }: { onDone?: () => void }) {
  const { data, saveSingle, today } = useStore();
  const { toast } = useFeedback();
  const ap = data.athletic;
  const [readiness, setReadiness] = useState<Readiness | "">(ap?.readiness ?? "");
  const [assessed, setAssessed] = useState(ap?.assessed_on ?? "");
  const [notes, setNotes] = useState(ap?.injury_notes ?? "");
  const [phase, setPhase] = useState<Phase>(ap?.phase ?? "foundation");
  const [target, setTarget] = useState(String(ap?.weekly_session_target ?? 3));
  const [days, setDays] = useState<number[]>(ap?.training_days ?? [1, 3, 5]);
  const [goal, setGoal] = useState(ap?.goal_text ?? "Complete a 10K");
  const [race, setRace] = useState(ap?.race_name ?? "");
  const [raceDate, setRaceDate] = useState(ap?.race_date ?? "");
  const [busy, setBusy] = useState(false);
  const unlocked = runningUnlocked(readiness || null);
  const phaseInfo = PHASES.find((p) => p.key === phase)!;

  const dated = readiness === "under_care" || readiness === "cleared_by_clinician";
  const chooseReadiness = (r: Readiness | "") => {
    setReadiness(r);
    // Running phases need clearance: don't leave one chosen that can no longer be picked.
    if (!runningUnlocked(r || null) && PHASES.find((p) => p.key === phase)?.requiresClearance) setPhase("foundation");
  };

  const save = async () => {
    const sessions = Number(target);
    if (!target.trim() || !Number.isInteger(sessions) || sessions < 1 || sessions > 14) {
      toast("Sessions per week must be a whole number from 1 to 14.", "error");
      return;
    }
    if (dated && assessed && assessed > today) {
      toast("The assessment date can't be in the future.", "error");
      return;
    }
    setBusy(true);
    try {
      await saveSingle("athletic", {
        // The assessment date only applies while you're under care or cleared.
        readiness: readiness || null, assessed_on: dated && assessed ? assessed : null, injury_notes: notes.trim() || null, phase,
        weekly_session_target: sessions, training_days: days,
        goal_text: goal.trim() || "Complete a 10K", race_name: race.trim() || null, race_date: raceDate || null,
      });
      toast("Training plan saved.");
      onDone?.();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Readiness">
        <Select value={readiness} onChange={(e) => chooseReadiness(e.target.value as Readiness | "")}>
          <option value="">Not set</option>
          {(Object.keys(READINESS_LABEL) as Readiness[]).map((r) => <option key={r} value={r}>{READINESS_LABEL[r]}</option>)}
        </Select>
      </Field>
      {dated && (
        <Field label="Date assessed"><Input type="date" value={assessed} max={today} onChange={(e) => setAssessed(e.target.value)} /></Field>
      )}
      <Field label="Injury notes (private)"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} className="min-h-[64px]" /></Field>
      <Field label="Current phase">
        <Select value={phase} onChange={(e) => setPhase(e.target.value as Phase)}>
          {PHASES.map((p) => <option key={p.key} value={p.key} disabled={p.requiresClearance && !unlocked}>{p.name}{p.requiresClearance && !unlocked ? " — needs clearance" : ""}</option>)}
        </Select>
      </Field>
      {!unlocked && <Notice>Running phases unlock when readiness is “No current injury” or “Assessed — clinician OK'd running”. That's your report of your clinician's advice; the app doesn't judge readiness.</Notice>}
      <p className="text-[12px] text-faint">{phaseInfo.focus}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sessions per week"><NumberInput value={target} onChange={setTarget} step="1" min={1} max={14} /></Field>
        <Field label="Goal"><Input value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={120} /></Field>
        <Field label="Race name"><Input value={race} onChange={(e) => setRace(e.target.value)} maxLength={120} placeholder="optional" /></Field>
        <Field label="Race date"><Input type="date" value={raceDate} onChange={(e) => setRaceDate(e.target.value)} /></Field>
      </div>
      <Field group label="Training days"><DayPicker value={days} onChange={setDays} /></Field>
      <Button busy={busy} className="w-full" onClick={save}>Save plan</Button>
    </div>
  );
}

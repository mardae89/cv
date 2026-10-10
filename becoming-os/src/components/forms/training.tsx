import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useStore } from "@/data/store";
import { supabase } from "@/data/supabase";
import { ACTIVITY_LABEL, runningUnlocked } from "@/lib/calc/athletic";
import { checkWorkout } from "@/lib/calc/validation";
import { errorMessage, num, pace } from "@/lib/format";
import type { Activity, StrengthSet, Workout } from "@/lib/types";
import { useFeedback } from "../feedback";
import { Button, Field, IconButton, Input, Notice, NumberInput, Scale, Segmented, Select, Textarea, Toggle } from "../ui";
import { useSubmit } from "./body";

interface ExerciseRow {
  exercise: string;
  sets: string;
  reps: string;
  weight: string;
}

function groupSets(sets: StrengthSet[]): ExerciseRow[] {
  const m = new Map<string, StrengthSet[]>();
  for (const s of sets) m.set(s.exercise, [...(m.get(s.exercise) ?? []), s]);
  return [...m.entries()].map(([exercise, ss]) => ({
    exercise,
    sets: String(ss.length),
    reps: String(ss[0].reps ?? ""),
    weight: String(ss[0].weight_lb ?? ""),
  }));
}

const DISTANCE: Activity[] = ["run", "run_walk", "walk", "swim", "cycle"];

export function WorkoutForm({ initial, onDone }: { initial?: Workout; onDone?: () => void }) {
  const { data, today, uid, insert, update, invalidate } = useStore();
  const { confirm } = useFeedback();
  const { busy, run } = useSubmit();
  const [date, setDate] = useState(initial?.workout_date ?? today);
  const [activity, setActivity] = useState<Activity>(initial?.activity ?? "strength");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [duration, setDuration] = useState(initial?.duration_min != null ? String(initial.duration_min) : "");
  const [distance, setDistance] = useState(initial?.distance_mi != null ? String(initial.distance_mi) : "");
  const [yards, setYards] = useState(false);
  const [hr, setHr] = useState(initial?.avg_hr != null ? String(initial.avg_hr) : "");
  const [rpe, setRpe] = useState<number | null>(initial?.rpe ?? null);
  const [intensity, setIntensity] = useState<Workout["intensity"]>(initial?.intensity ?? "moderate");
  const [painLevel, setPainLevel] = useState<number | null>(initial?.pain_level ?? null);
  const [isRace, setIsRace] = useState(initial?.is_race ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [recovery, setRecovery] = useState(initial?.recovery_notes ?? "");
  const [rows, setRows] = useState<ExerciseRow[]>(
    initial ? groupSets(data.sets.filter((s) => s.workout_id === initial.id)) : [{ exercise: "", sets: "3", reps: "10", weight: "" }]);

  const running = activity === "run" || activity === "run_walk";
  const distMi = distance ? (activity === "swim" && yards ? num(distance) / 1760 : num(distance)) : null;
  const paceVal = distMi && duration ? num(duration) / distMi : null;
  const readiness = data.athletic?.readiness ?? null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (date > today) throw new Error("You can't log a workout for a future date.");
      const dur = duration ? num(duration) : null;
      if (activity !== "recovery" && !dur) throw new Error("Enter how long the session lasted.");
      const c = checkWorkout(activity, distMi, dur);
      if (!c.ok && !(await confirm({ title: "Double-check this workout", body: c.reasons.join(" "), confirmLabel: "It's correct — save" }))) return;
      const dup = data.workouts.find((w) => w.id !== initial?.id && w.workout_date === date && w.activity === activity &&
        num(w.duration_min) === num(dur) && num(w.distance_mi) === num(distMi));
      if (dup && !initial && !(await confirm({ title: "Possible duplicate", body: "An identical workout is already logged for this date.", confirmLabel: "Log it again" }))) return;

      const row = {
        workout_date: date, activity, title: title.trim() || null, duration_min: dur,
        distance_mi: DISTANCE.includes(activity) && distMi ? Math.round(distMi * 100) / 100 : null,
        avg_hr: hr ? Math.round(num(hr)) : null, rpe, intensity: activity === "recovery" ? null : intensity,
        pain_level: running || activity === "walk" ? painLevel : null, is_race: running && isRace,
        notes: notes.trim() || null, recovery_notes: recovery.trim() || null,
      };
      let id = initial?.id;
      if (initial) await update("workouts", initial.id, row);
      else id = (await insert<Workout>("workouts", row))[0].id;

      if (activity === "strength") {
        const sets = rows.filter((r) => r.exercise.trim()).flatMap((r) =>
          Array.from({ length: Math.max(1, Math.min(20, Math.round(num(r.sets) || 1))) }, (_, k) => ({
            user_id: uid, workout_id: id, exercise: r.exercise.trim(), set_no: k + 1,
            reps: r.reps ? Math.round(num(r.reps)) : null, weight_lb: r.weight ? num(r.weight) : null,
          })));
        if (initial) {
          const { error } = await supabase.from("strength_sets").delete().eq("workout_id", initial.id);
          if (error) throw new Error(errorMessage(error));
        }
        if (sets.length) {
          const { error } = await supabase.from("strength_sets").insert(sets);
          if (error) throw new Error(errorMessage(error));
        }
        await invalidate("sets");
      }
      if (!initial) {
        setTitle("");
        setDuration("");
        setDistance("");
        setNotes("");
        setRecovery("");
        setPainLevel(null);
        setIsRace(false);
      }
      onDone?.();
      return initial ? "Workout updated." : "Workout logged.";
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Workout form">
      <Field label="Activity">
        <Select value={activity} onChange={(e) => setActivity(e.target.value as Activity)}>
          {(Object.keys(ACTIVITY_LABEL) as Activity[]).map((a) => <option key={a} value={a}>{ACTIVITY_LABEL[a]}</option>)}
        </Select>
      </Field>
      {running && !runningUnlocked(readiness) && (
        <Notice tone="alert" title="Running with unassessed symptoms">
          You've reported ankle symptoms that haven't been assessed. You can still log what you did, but consider getting it checked before running more. Stop if pain is sharp or worsening.
        </Notice>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Duration"><NumberInput value={duration} onChange={setDuration} suffix="min" /></Field>
        {DISTANCE.includes(activity) && (
          <Field label={activity === "swim" ? (yards ? "Distance (yards)" : "Distance (miles)") : "Distance"}
            hint={paceVal && (running || activity === "walk") ? `Pace ${pace(paceVal)}` : activity === "swim" ? <button type="button" className="link" onClick={() => setYards(!yards)}>Use {yards ? "miles" : "yards"}</button> : undefined}>
            <NumberInput value={distance} onChange={setDistance} suffix={activity === "swim" && yards ? "yd" : "mi"} />
          </Field>
        )}
        <Field label="Avg heart rate"><NumberInput value={hr} onChange={setHr} suffix="bpm" placeholder="optional" /></Field>
      </div>
      <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="optional, e.g. Upper body" /></Field>

      {activity === "strength" && (
        <div>
          <div className="mb-2 text-[12px] font-medium text-mute">Exercises</div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_52px_52px_70px_36px] items-center gap-1.5">
                <input className="input px-2.5 py-2 text-[13.5px]" placeholder="Exercise" value={r.exercise} aria-label="Exercise"
                  onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, exercise: e.target.value } : x)))} />
                <input className="input num px-2 py-2 text-center text-[13.5px]" inputMode="numeric" aria-label="Sets" value={r.sets}
                  onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, sets: e.target.value } : x)))} />
                <input className="input num px-2 py-2 text-center text-[13.5px]" inputMode="numeric" aria-label="Reps" value={r.reps}
                  onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, reps: e.target.value } : x)))} />
                <input className="input num px-2 py-2 text-center text-[13.5px]" inputMode="decimal" aria-label="Weight (lb)" placeholder="lb" value={r.weight}
                  onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, weight: e.target.value } : x)))} />
                <IconButton label="Remove exercise" type="button" className="h-9 w-9" onClick={() => setRows(rows.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></IconButton>
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-[1fr_52px_52px_70px_36px] gap-1.5 text-center text-[10.5px] text-faint"><span /><span>sets</span><span>reps</span><span>lb</span><span /></div>
          <Button type="button" variant="ghost" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setRows([...rows, { exercise: "", sets: "3", reps: "10", weight: "" }])}>Add exercise</Button>
        </div>
      )}

      {activity !== "recovery" && (
        <>
          <Field group label="Intensity">
            <Segmented value={intensity ?? "moderate"} onChange={(v) => setIntensity(v)} className="w-full" options={[
              { value: "easy", label: "Easy" }, { value: "moderate", label: "Moderate" }, { value: "hard", label: "Hard" }]} />
          </Field>
          <Scale label="Perceived effort (RPE)" value={rpe} onChange={setRpe} min={1} max={10} />
        </>
      )}
      {(running || activity === "walk") && (
        <>
          <Scale label="Pain during the session (0 = none)" value={painLevel} onChange={setPainLevel} min={0} max={10} />
          {running && <Toggle checked={isRace} onChange={setIsRace} label="This was a race" />}
        </>
      )}
      <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="optional" className="min-h-[70px]" /></Field>
      <Field label="Recovery notes"><Input value={recovery} onChange={(e) => setRecovery(e.target.value)} maxLength={1000} placeholder="How did you feel after?" /></Field>
      <Button type="submit" busy={busy} className="w-full">{initial ? "Save changes" : "Log workout"}</Button>
    </form>
  );
}

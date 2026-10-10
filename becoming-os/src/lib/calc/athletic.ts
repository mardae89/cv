// Training summaries, records and the injury-awareness rules. Nothing here
// prescribes running volume or decides whether someone is fit to run — the
// app only reports what was logged and points to a clinician when symptoms
// warrant it.
import { addDays, weekStart } from "../dates";
import { num, round } from "../format";
import type { Activity, AthleticProfile, ISODate, Phase, Readiness, StrengthSet, SymptomLog, Workout } from "../types";

export const ACTIVITY_LABEL: Record<Activity, string> = {
  run: "Run",
  run_walk: "Run-walk",
  walk: "Walk",
  swim: "Swim",
  cycle: "Cycle",
  strength: "Strength",
  mobility: "Mobility",
  recovery: "Recovery day",
  other: "Other",
};

export const isSession = (w: Workout) => w.activity !== "recovery";
export const isRun = (w: Workout) => w.activity === "run" || w.activity === "run_walk";

export function paceOf(w: Workout): number | null {
  const d = num(w.distance_mi);
  const t = num(w.duration_min);
  return d > 0 && t > 0 ? t / d : null;
}

export interface TrainingWeek {
  weekStart: ISODate;
  sessions: number;
  target: number;
  pct: number;
  runMiles: number;
  longestRun: number;
  strength: number;
  minutes: number;
  recoveryDays: number;
}

export function trainingWeek(workouts: Workout[], anyDayInWeek: ISODate, target: number, upTo?: ISODate): TrainingWeek {
  const ws = weekStart(anyDayInWeek);
  const we = addDays(ws, 6);
  const end = upTo && upTo < we ? upTo : we;
  let sessions = 0, runMiles = 0, longestRun = 0, strength = 0, minutes = 0, recoveryDays = 0;
  for (const w of workouts) {
    if (w.workout_date < ws || w.workout_date > end) continue;
    if (w.activity === "recovery") {
      recoveryDays += 1;
      continue;
    }
    sessions += 1;
    minutes += num(w.duration_min);
    if (w.activity === "strength") strength += 1;
    if (isRun(w)) {
      runMiles += num(w.distance_mi);
      longestRun = Math.max(longestRun, num(w.distance_mi));
    }
  }
  return {
    weekStart: ws, sessions, target,
    pct: target > 0 ? Math.min(100, (sessions / target) * 100) : 0,
    runMiles: round(runMiles, 2), longestRun: round(longestRun, 2), strength,
    minutes: Math.round(minutes), recoveryDays,
  };
}

export function trainingWeeks(workouts: Workout[], from: ISODate, to: ISODate, target: number): TrainingWeek[] {
  const out: TrainingWeek[] = [];
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) out.push(trainingWeek(workouts, w, target, to));
  return out;
}

export function longestRun(workouts: Workout[]): { distance: number; date: ISODate | null } {
  let best = 0;
  let date: ISODate | null = null;
  for (const w of workouts) {
    if (isRun(w) && num(w.distance_mi) > best) {
      best = num(w.distance_mi);
      date = w.workout_date;
    }
  }
  return { distance: round(best, 2), date };
}

/** Longest-run progression: each run that set a new distance record. */
export function longestRunProgression(workouts: Workout[]): { date: ISODate; distance: number }[] {
  const runs = workouts.filter(isRun).sort((a, b) => (a.workout_date < b.workout_date ? -1 : 1));
  const out: { date: ISODate; distance: number }[] = [];
  let best = 0;
  for (const r of runs) {
    if (num(r.distance_mi) > best) {
      best = num(r.distance_mi);
      out.push({ date: r.workout_date, distance: round(best, 2) });
    }
  }
  return out;
}

export interface StrengthPR {
  exercise: string;
  bestWeight: number;
  bestWeightReps: number;
  est1RM: number;
  date: ISODate;
  sets: number;
}

/** Heaviest set and best estimated 1-rep max (Epley) per exercise. */
export function strengthPRs(sets: StrengthSet[], workouts: Workout[]): StrengthPR[] {
  const dateOf = new Map(workouts.map((w) => [w.id, w.workout_date]));
  const m = new Map<string, StrengthPR>();
  for (const s of sets) {
    const name = s.exercise.trim();
    const key = name.toLowerCase();
    const wt = num(s.weight_lb);
    const reps = num(s.reps);
    const e1rm = reps > 0 ? wt * (1 + Math.min(reps, 12) / 30) : wt;
    const prev = m.get(key);
    const date = dateOf.get(s.workout_id) ?? "";
    if (!prev) {
      m.set(key, { exercise: name, bestWeight: wt, bestWeightReps: reps, est1RM: round(e1rm, 1), date, sets: 1 });
      continue;
    }
    prev.sets += 1;
    if (wt > prev.bestWeight || (wt === prev.bestWeight && reps > prev.bestWeightReps)) {
      prev.bestWeight = wt;
      prev.bestWeightReps = reps;
      prev.date = date;
    }
    prev.est1RM = Math.max(prev.est1RM, round(e1rm, 1));
  }
  return [...m.values()].sort((a, b) => b.sets - a.sets);
}

// ───────────────────────────────────────────────────── injury awareness ──

export interface SymptomSummary {
  windowDays: number;
  logs: number;
  daysWithSymptoms: number;
  maxPain: number;
  sharp: number;
  latest: SymptomLog | null;
}

export function symptomSummary(symptoms: SymptomLog[], today: ISODate, windowDays = 14): SymptomSummary {
  const from = addDays(today, -(windowDays - 1));
  const recent = symptoms.filter((s) => s.log_date >= from && s.log_date <= today && s.pain_level > 0);
  const sorted = [...symptoms].sort((a, b) => (a.log_date < b.log_date ? 1 : -1));
  return {
    windowDays,
    logs: recent.length,
    daysWithSymptoms: new Set(recent.map((s) => s.log_date)).size,
    maxPain: recent.reduce((m, s) => Math.max(m, s.pain_level), 0),
    sharp: recent.filter((s) => s.pain_type === "sharp").length,
    latest: sorted[0] ?? null,
  };
}

export type InjuryAlertLevel = "none" | "monitor" | "assess";

export interface InjuryAlert {
  level: InjuryAlertLevel;
  title: string;
  message: string;
}

/**
 * Flags symptoms that deserve a professional look. Thresholds are
 * conservative prompts to seek care, not a diagnosis or a clearance.
 */
export function injuryAlert(profile: AthleticProfile | null, s: SymptomSummary): InjuryAlert {
  const readiness = profile?.readiness ?? null;
  if (s.sharp > 0 || s.maxPain >= 5 || s.daysWithSymptoms >= 3) {
    return {
      level: "assess",
      title: "Symptoms worth getting checked",
      message:
        `You've logged ${s.sharp > 0 ? "sharp pain" : `pain up to ${s.maxPain}/10`} on ${s.daysWithSymptoms} ` +
        `day${s.daysWithSymptoms === 1 ? "" : "s"} in the last ${s.windowDays}. Persistent or sharp pain should be ` +
        "assessed by a doctor or physical therapist. Consider pausing anything that provokes it until then.",
    };
  }
  if (readiness === "symptoms_not_assessed") {
    return {
      level: "assess",
      title: "Ankle not yet assessed",
      message:
        "You reported ankle pain that hasn't been assessed. If it persists, have it checked by a doctor or " +
        "physical therapist before returning to running. BECOMING OS can't clear you to run.",
    };
  }
  if (s.logs > 0 || readiness === "under_care") {
    return {
      level: "monitor",
      title: readiness === "under_care" ? "Follow your clinician's plan" : "Keep an eye on it",
      message:
        "Keep logging symptoms so you can share an accurate history with your clinician. Stop and get it checked " +
        "if pain becomes sharp, worsens, or lasts.",
    };
  }
  return { level: "none", title: "", message: "" };
}

/** Running phases are shown only when the user reports no injury or clinician clearance. */
export function runningUnlocked(readiness: Readiness | null): boolean {
  return readiness === "no_injury" || readiness === "cleared_by_clinician";
}

export interface PhaseInfo {
  key: Phase;
  name: string;
  focus: string;
  signals: string;
  requiresClearance: boolean;
}

export const PHASES: PhaseInfo[] = [
  {
    key: "foundation",
    name: "Foundation",
    focus:
      "Build the training habit without aggravating symptoms: strength work, mobility, and low-impact cardio " +
      "such as cycling, swimming or walking as tolerated.",
    signals: "Several weeks of planned sessions completed, and symptoms settled or assessed.",
    requiresClearance: false,
  },
  {
    key: "return_to_running",
    name: "Return to running",
    focus:
      "Reintroduce running gradually — often as run-walk intervals — once the ankle has been assessed and your " +
      "clinician agrees. Pain during or after a session is a signal to step back.",
    signals: "Run-walk sessions completed with no pain during or the morning after.",
    requiresClearance: true,
  },
  {
    key: "aerobic_base",
    name: "Aerobic base",
    focus:
      "Build consistent, mostly easy running at a conversational effort. Consistency matters more than pace.",
    signals: "Running continuously for longer stretches, and recovering well between sessions.",
    requiresClearance: true,
  },
  {
    key: "10k_specific",
    name: "10K preparation",
    focus:
      "Longer runs that build toward the 10K distance, with recovery protected. Adjust whenever readiness dips.",
    signals: "Long runs approaching race distance feel controlled; sleep and soreness are stable.",
    requiresClearance: true,
  },
  {
    key: "race_ready",
    name: "Race readiness",
    focus: "Ease the load before race day, rehearse logistics, and arrive rested.",
    signals: "Race day.",
    requiresClearance: true,
  },
];

export const READINESS_LABEL: Record<Readiness, string> = {
  no_injury: "No current injury",
  symptoms_not_assessed: "Symptoms, not yet assessed",
  under_care: "Under a clinician's care",
  cleared_by_clinician: "Assessed — clinician OK'd running",
};

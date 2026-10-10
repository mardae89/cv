// Experience points. XP is earned for logging and completing planned actions,
// with per-day caps so more volume never means more points — there is no XP
// for extra workouts beyond two a day, for eating less, or for weight change.
// Missed days, weight gain or a slow month never subtract XP. Deleting a
// record removes the XP that record earned (that's a correction, not a penalty).
import { addDays, monthEnd, todayIn, weekStart } from "../dates";
import type { ISODate, UserData } from "../types";

export const XP = {
  weighIn: 5,
  checkin: 5,
  symptomLog: 5,
  workout: 25,
  lightSession: 15, // mobility, recovery, walk
  workoutsPerDay: 2,
  meal: 3,
  mealCap: 15,
  task: 5,
  taskCap: 25,
  restDay: 10,
  journal: 10,
  learning: 10,
  transaction: 10,
  transactionCap: 50,
  activityLog: 5,
  activityCap: 40,
  weeklyReview: 50,
  monthlyReview: 100,
  minorAchievement: 50,
  majorAchievement: 200,
} as const;

export type XpCategory = "body" | "training" | "habits" | "business" | "mind" | "reviews" | "milestones";

export interface XpResult {
  total: number;
  byCategory: Record<XpCategory, number>;
  byDay: Map<ISODate, number>;
}

export function computeXP(
  data: Pick<UserData, "weights" | "checkins" | "symptoms" | "workouts" | "nutrition" | "habits" | "completions" |
    "tasks" | "restDays" | "journal" | "transactions" | "activityLogs" | "reviews" | "profile">,
  achievements: { achievedOn: ISODate | null; tier: "minor" | "major"; category: string }[],
): XpResult {
  const byDay = new Map<ISODate, number>();
  const byCategory: Record<XpCategory, number> = {
    body: 0, training: 0, habits: 0, business: 0, mind: 0, reviews: 0, milestones: 0,
  };
  const add = (d: ISODate, cat: XpCategory, v: number) => {
    if (v <= 0) return;
    byDay.set(d, (byDay.get(d) ?? 0) + v);
    byCategory[cat] += v;
  };
  const capped = <T,>(items: T[], dateOf: (t: T) => ISODate, cap: number, each: (t: T) => number, cat: XpCategory) => {
    const used = new Map<ISODate, number>();
    for (const it of items) {
      const d = dateOf(it);
      const room = cap - (used.get(d) ?? 0);
      const v = Math.min(room, each(it));
      if (v > 0) {
        used.set(d, (used.get(d) ?? 0) + v);
        add(d, cat, v);
      }
    }
  };

  for (const w of data.weights) if (w.weight !== null) add(w.entry_date, "body", XP.weighIn);
  for (const c of data.checkins) add(c.checkin_date, "body", XP.checkin);
  capped(data.symptoms, (s) => s.log_date, XP.symptomLog, () => XP.symptomLog, "body");
  capped(data.nutrition, (n) => n.log_date, XP.mealCap, () => XP.meal, "body");

  // Workouts: at most two count per day, so extra volume earns nothing.
  const perDay = new Map<ISODate, number>();
  const sorted = [...data.workouts].sort((a, b) => {
    const wa = a.activity === "recovery" || a.activity === "mobility" || a.activity === "walk" ? 1 : 0;
    const wb = b.activity === "recovery" || b.activity === "mobility" || b.activity === "walk" ? 1 : 0;
    return wa - wb;
  });
  for (const w of sorted) {
    const n = perDay.get(w.workout_date) ?? 0;
    if (n >= XP.workoutsPerDay) continue;
    perDay.set(w.workout_date, n + 1);
    const light = w.activity === "recovery" || w.activity === "mobility" || w.activity === "walk";
    add(w.workout_date, "training", light ? XP.lightSession : XP.workout);
  }

  const xpOf = new Map(data.habits.map((h) => [h.id, h.xp]));
  for (const c of data.completions) add(c.completed_on, "habits", xpOf.get(c.habit_id) ?? 10);
  capped(data.tasks.filter((t) => t.completed_on), (t) => t.completed_on!, XP.taskCap, () => XP.task, "habits");
  for (const r of data.restDays) add(r.rest_date, "habits", XP.restDay);

  capped(data.journal.filter((j) => j.kind !== "learning"), (j) => j.entry_date, XP.journal, () => XP.journal, "mind");
  capped(data.journal.filter((j) => j.kind === "learning"), (j) => j.entry_date, XP.learning, () => XP.learning, "mind");

  capped(data.transactions.filter((t) => t.kind === "sale" || t.kind === "expense" || t.kind === "refund"),
    (t) => t.txn_date, XP.transactionCap, () => XP.transaction, "business");
  capped(data.activityLogs.filter((a) => a.count > 0), (a) => a.log_date, XP.activityCap, () => XP.activityLog, "business");

  for (const r of data.reviews) {
    if (!r.completed_at) continue;
    const end = r.period === "week" ? addDays(weekStart(r.period_start), 6) : monthEnd(r.period_start);
    const done = todayIn(data.profile.timezone, new Date(r.completed_at));
    add(done < end ? done : end, "reviews", r.period === "week" ? XP.weeklyReview : XP.monthlyReview);
  }

  for (const a of achievements) {
    if (!a.achievedOn || a.category === "level") continue;
    add(a.achievedOn, "milestones", a.tier === "major" ? XP.majorAchievement : XP.minorAchievement);
  }

  const total = Object.values(byCategory).reduce((s, v) => s + v, 0);
  return { total, byCategory, byDay };
}

export function xpBetween(byDay: Map<ISODate, number>, from: ISODate, to: ISODate): number {
  let s = 0;
  for (const [d, v] of byDay) if (d >= from && d <= to) s += v;
  return s;
}

// ──────────────────────────────────────────────────────────────── levels ──

export interface LevelDef {
  level: number;
  name: string;
  xp: number;
  achievements: number;
}

/** Levels need both XP and earned milestones, so no single metric (like weight) drives them. */
export const LEVELS: LevelDef[] = [
  { level: 1, name: "The Beginner", xp: 0, achievements: 0 },
  { level: 2, name: "The Builder", xp: 400, achievements: 1 },
  { level: 3, name: "The Disciplined", xp: 1500, achievements: 4 },
  { level: 4, name: "The Competitor", xp: 3500, achievements: 7 },
  { level: 5, name: "The Operator", xp: 6500, achievements: 11 },
  { level: 6, name: "The Finisher", xp: 10000, achievements: 15 },
  { level: 7, name: "The Transformed", xp: 14000, achievements: 20 },
];

export interface LevelState {
  current: LevelDef;
  next: LevelDef | null;
  xp: number;
  achievements: number;
  xpToNext: number;
  achievementsToNext: number;
  /** 0–100 toward the next level (the slower of the two requirements). */
  progress: number;
}

export function levelState(xp: number, achievements: number): LevelState {
  let current = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp && achievements >= l.achievements) current = l;
  const next = LEVELS.find((l) => l.level === current.level + 1) ?? null;
  if (!next) return { current, next, xp, achievements, xpToNext: 0, achievementsToNext: 0, progress: 100 };
  const xpPart = Math.min(1, (xp - current.xp) / (next.xp - current.xp));
  const achPart = next.achievements === current.achievements
    ? 1
    : Math.min(1, Math.max(0, (achievements - current.achievements) / (next.achievements - current.achievements)));
  return {
    current, next, xp, achievements,
    xpToNext: Math.max(0, next.xp - xp),
    achievementsToNext: Math.max(0, next.achievements - achievements),
    progress: Math.round(Math.min(xpPart, achPart) * 100),
  };
}

/** Date each level was first reached, from the XP timeline and milestone dates. */
export function levelDates(byDay: Map<ISODate, number>, achievementDates: ISODate[]): Map<number, ISODate> {
  const days = new Set<ISODate>([...byDay.keys(), ...achievementDates]);
  const sortedDays = [...days].sort();
  const achSorted = [...achievementDates].sort();
  const out = new Map<number, ISODate>();
  let xp = 0;
  let ai = 0;
  for (const d of sortedDays) {
    xp += byDay.get(d) ?? 0;
    while (ai < achSorted.length && achSorted[ai] <= d) ai++;
    for (const l of LEVELS) {
      if (l.level === 1 || out.has(l.level)) continue;
      if (xp >= l.xp && ai >= l.achievements) out.set(l.level, d);
    }
  }
  return out;
}

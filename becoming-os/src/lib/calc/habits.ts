// Habit scheduling and execution scores. Only habits scheduled for a day count
// toward that day: unscheduled days, days before a habit existed, days after
// it was archived, and rest days (for habits that pause on rest days) are
// excluded from both the numerator and the denominator.
import { addDays, dateRange, dow, weekStart } from "../dates";
import { round } from "../format";
import type { Habit, HabitCompletion, ISODate, RestDay, Task } from "../types";

export interface HabitIndex {
  done: Set<string>; // `${habitId}|${date}`
  rest: Set<ISODate>;
}

export function indexHabits(completions: HabitCompletion[], restDays: RestDay[]): HabitIndex {
  return {
    done: new Set(completions.map((c) => `${c.habit_id}|${c.completed_on}`)),
    rest: new Set(restDays.map((r) => r.rest_date)),
  };
}

export function isScheduled(h: Habit, date: ISODate, rest: Set<ISODate>): boolean {
  if (date < h.start_date) return false;
  if (h.archived_on && date >= h.archived_on) return false;
  if (!h.schedule_days.includes(dow(date))) return false;
  if (h.skip_on_rest_days && rest.has(date)) return false;
  return true;
}

export function isDone(idx: HabitIndex, habitId: string, date: ISODate): boolean {
  return idx.done.has(`${habitId}|${date}`);
}

export interface DayScore {
  date: ISODate;
  habitsScheduled: number;
  habitsDone: number;
  tasksDue: number;
  tasksDone: number;
  total: number;
  completed: number;
  pct: number | null;
  isRestDay: boolean;
}

export function dayScore(habits: Habit[], idx: HabitIndex, tasks: Task[], date: ISODate): DayScore {
  let habitsScheduled = 0, habitsDone = 0;
  for (const h of habits) {
    if (!isScheduled(h, date, idx.rest)) continue;
    habitsScheduled += 1;
    if (isDone(idx, h.id, date)) habitsDone += 1;
  }
  const due = tasks.filter((t) => t.due_date === date);
  const tasksDone = due.filter((t) => t.completed_on !== null).length;
  const total = habitsScheduled + due.length;
  const completed = habitsDone + tasksDone;
  return {
    date, habitsScheduled, habitsDone, tasksDue: due.length, tasksDone, total, completed,
    pct: total ? round((completed / total) * 100, 1) : null,
    isRestDay: idx.rest.has(date),
  };
}

export interface PeriodScore {
  from: ISODate;
  to: ISODate;
  scheduled: number;
  done: number;
  pct: number | null;
}

/** Scheduled-habit completion between two dates (inclusive). */
export function periodScore(habits: Habit[], idx: HabitIndex, from: ISODate, to: ISODate): PeriodScore {
  let scheduled = 0, done = 0;
  for (const d of dateRange(from, to)) {
    for (const h of habits) {
      if (!isScheduled(h, d, idx.rest)) continue;
      scheduled += 1;
      if (isDone(idx, h.id, d)) done += 1;
    }
  }
  return { from, to, scheduled, done, pct: scheduled ? round((done / scheduled) * 100, 1) : null };
}

/**
 * Consecutive scheduled days completed, counting back from today. A habit
 * that is scheduled today but not yet done does not break the streak — the
 * day isn't over.
 */
export function habitStreak(h: Habit, idx: HabitIndex, today: ISODate): number {
  let streak = 0;
  let d = today;
  if (isScheduled(h, d, idx.rest) && !isDone(idx, h.id, d)) d = addDays(d, -1);
  for (let guard = 0; guard < 800 && d >= h.start_date; guard++, d = addDays(d, -1)) {
    if (!isScheduled(h, d, idx.rest)) continue;
    if (!isDone(idx, h.id, d)) break;
    streak += 1;
  }
  return streak;
}

export function bestStreak(h: Habit, idx: HabitIndex, today: ISODate): number {
  let best = 0, run = 0;
  for (const d of dateRange(h.start_date, today)) {
    if (!isScheduled(h, d, idx.rest)) continue;
    if (isDone(idx, h.id, d)) best = Math.max(best, ++run);
    else if (d !== today) run = 0;
  }
  return best;
}

/** Monday-start weeks between two dates with their habit completion. */
export function weeklyScores(habits: Habit[], idx: HabitIndex, from: ISODate, to: ISODate): PeriodScore[] {
  const out: PeriodScore[] = [];
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) {
    const end = addDays(w, 6);
    out.push(periodScore(habits, idx, w < from ? from : w, end > to ? to : end));
  }
  return out;
}

/** Longest run of consecutive dates present in a set, and the run ending at `today` (or yesterday). */
export function dateStreak(dates: Set<ISODate>, today: ISODate): { current: number; firstReached: (n: number) => ISODate | null } {
  let current = 0;
  let d = dates.has(today) ? today : addDays(today, -1);
  while (dates.has(d)) {
    current += 1;
    d = addDays(d, -1);
  }
  const sorted = [...dates].sort();
  return {
    current,
    firstReached(n: number) {
      let run = 0;
      let prev: ISODate | null = null;
      for (const x of sorted) {
        run = prev && addDays(prev, 1) === x ? run + 1 : 1;
        prev = x;
        if (run >= n) return x;
      }
      return null;
    },
  };
}

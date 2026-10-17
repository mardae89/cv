// Weight progress. Pounds lost, goal progress and milestones count from your
// weigh-ins (start weight minus the latest weigh-in). The 7-day average — the
// mean of every weigh-in in the seven calendar days ending on a date — is kept
// alongside as a smoother view of the direction.
import { addDays, diffDays, weekStart } from "../dates";
import { clamp, num, round } from "../format";
import type { BodyGoals, ISODate, WeightEntry } from "../types";

export interface WeightPoint {
  date: ISODate;
  weight: number;
  trend: number;
}

export function weighIns(entries: WeightEntry[]): { date: ISODate; weight: number }[] {
  return entries
    .filter((e) => e.weight !== null && e.weight !== undefined)
    .map((e) => ({ date: e.entry_date, weight: num(e.weight) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 7-day average for each weigh-in date. Input must be sorted by date. */
export function trendSeries(sorted: { date: ISODate; weight: number }[]): WeightPoint[] {
  const out: WeightPoint[] = [];
  let lo = 0;
  let sum = 0;
  for (let i = 0; i < sorted.length; i++) {
    sum += sorted[i].weight;
    const windowStart = addDays(sorted[i].date, -6);
    while (sorted[lo].date < windowStart) sum -= sorted[lo++].weight;
    out.push({ date: sorted[i].date, weight: sorted[i].weight, trend: round(sum / (i - lo + 1), 2) });
  }
  return out;
}

/** Trend value as of a date (the last trend point on or before it). */
export function trendAsOf(series: WeightPoint[], date: ISODate): number | null {
  let v: number | null = null;
  for (const p of series) {
    if (p.date > date) break;
    v = p.trend;
  }
  return v;
}

export interface WeightGoalView {
  start: number;
  startDate: ISODate | null;
  targetLoss: number;
  stretchLoss: number | null;
  targetWeight: number;
  stretchWeight: number | null;
}

export function goalView(goals: BodyGoals | null): WeightGoalView | null {
  if (!goals || goals.start_weight === null || goals.target_loss === null) return null;
  const start = num(goals.start_weight);
  const targetLoss = num(goals.target_loss);
  const stretchLoss = goals.stretch_loss === null ? null : num(goals.stretch_loss);
  return {
    start,
    startDate: goals.start_date,
    targetLoss,
    stretchLoss,
    targetWeight: round(start - targetLoss, 1),
    stretchWeight: stretchLoss === null ? null : round(start - stretchLoss, 1),
  };
}

export interface WeightProgress {
  goal: WeightGoalView;
  series: WeightPoint[];
  latest: WeightPoint | null;
  /** Current 7-day average, or the start weight before any weigh-ins. */
  trend: number;
  /** Pounds lost: start minus the latest weigh-in (negative if above the start). */
  lost: number;
  /** Pounds lost on the latest single weigh-in. */
  lostScale: number | null;
  pctPrimary: number;
  pctStretch: number | null;
  /** Uncapped percentages, for showing that a goal was exceeded. */
  pctPrimaryRaw: number;
  remaining: number;
  remainingStretch: number | null;
  nextMilestone: number;
  toNextMilestone: number;
  /** Change in the 7-day average versus 7 days earlier (negative = loss). */
  weekChange: number | null;
  daysTracked: number;
}

export function weightProgress(goals: BodyGoals | null, entries: WeightEntry[]): WeightProgress | null {
  const goal = goalView(goals);
  if (!goal) return null;
  const series = trendSeries(weighIns(entries));
  const latest = series.length ? series[series.length - 1] : null;
  const trend = latest ? latest.trend : goal.start;
  // Progress counts from your latest weigh-in — what the scale actually said.
  // The 7-day average is kept alongside as a smoother view of the direction.
  const current = latest ? latest.weight : goal.start;
  const lost = round(goal.start - current, 1);
  const pctPrimaryRaw = (lost / goal.targetLoss) * 100;
  const pctStretchRaw = goal.stretchLoss ? (lost / goal.stretchLoss) * 100 : null;
  // Keeps counting in 5 lb steps past the goal.
  const nextMilestone = Math.floor(Math.max(lost, 0) / 5 + 1e-9) * 5 + 5;
  let weekChange: number | null = null;
  if (latest) {
    const prior = trendAsOf(series, addDays(latest.date, -7));
    if (prior !== null) weekChange = round(latest.trend - prior, 2);
  }
  return {
    goal,
    series,
    latest,
    trend,
    lost,
    lostScale: latest ? round(goal.start - latest.weight, 1) : null,
    pctPrimary: clamp(pctPrimaryRaw, 0, 100),
    pctStretch: pctStretchRaw === null ? null : clamp(pctStretchRaw, 0, 100),
    pctPrimaryRaw,
    remaining: Math.max(0, round(goal.targetLoss - lost, 1)),
    remainingStretch: goal.stretchLoss === null ? null : Math.max(0, round(goal.stretchLoss - lost, 1)),
    nextMilestone,
    toNextMilestone: round(nextMilestone - lost, 1),
    weekChange,
    daysTracked: series.length,
  };
}

export interface WeeklyWeight {
  weekStart: ISODate;
  average: number;
  count: number;
  change: number | null;
}

/** Average weigh-in per Monday-start week, with the change from the prior week. */
export function weeklyWeights(entries: WeightEntry[]): WeeklyWeight[] {
  const byWeek = new Map<ISODate, number[]>();
  for (const w of weighIns(entries)) {
    const k = weekStart(w.date);
    const arr = byWeek.get(k) ?? [];
    arr.push(w.weight);
    byWeek.set(k, arr);
  }
  const weeks = [...byWeek.keys()].sort();
  let prev: number | null = null;
  return weeks.map((k) => {
    const arr = byWeek.get(k)!;
    const average = round(arr.reduce((a, b) => a + b, 0) / arr.length, 1);
    const change = prev === null ? null : round(average - prev, 1);
    prev = average;
    return { weekStart: k, average, count: arr.length, change };
  });
}

/** Milestone thresholds: every 5 lb up to the larger goal, plus exact goals. */
export function weightSteps(goal: WeightGoalView): number[] {
  const top = Math.max(goal.targetLoss, goal.stretchLoss ?? 0);
  const steps = new Set<number>();
  for (let k = 5; k <= top + 1e-9; k += 5) steps.add(k);
  steps.add(round(goal.targetLoss, 1));
  if (goal.stretchLoss) steps.add(round(goal.stretchLoss, 1));
  return [...steps].sort((a, b) => a - b);
}

/** First weigh-in at least `loss` pounds below the start. */
export function firstDateLost(series: WeightPoint[], start: number, loss: number): ISODate | null {
  for (const p of series) if (round(start - p.weight, 2) >= loss - 1e-9) return p.date;
  return null;
}

/**
 * Planned weekly loss for a pace preference. Capped at 1% of body weight and
 * 2 lb per week; the app never plans faster than that to fit a calendar.
 */
export function paceRate(pace: BodyGoals["pace"], weight: number): number {
  const pctOfWeight = pace === "gentle" ? 0.005 : pace === "ambitious" ? 0.01 : 0.0075;
  return round(Math.min(2, weight * pctOfWeight, weight * 0.01), 2);
}

export interface WeightPlan {
  requiredPerWeek: number;
  plannedPerWeek: number;
  onPaceForDeadline: boolean;
  /** Projected 7-day average on the deadline at the planned rate. */
  projectedAtDeadline: number;
  /** Date the primary goal is reached at the planned rate. */
  projectedGoalDate: ISODate | null;
}

export function weightPlan(
  goal: WeightGoalView, currentTrend: number, from: ISODate, deadline: ISODate, pace: BodyGoals["pace"],
): WeightPlan {
  const weeksLeft = Math.max(diffDays(from, deadline) / 7, 0);
  const remaining = Math.max(0, currentTrend - goal.targetWeight);
  const requiredPerWeek = weeksLeft > 0 ? remaining / weeksLeft : remaining > 0 ? Infinity : 0;
  const cap = paceRate(pace, currentTrend);
  const plannedPerWeek = Math.min(cap, requiredPerWeek);
  const projectedAtDeadline = Math.max(goal.targetWeight, currentTrend - plannedPerWeek * weeksLeft);
  // Earliest date at the chosen pace (not a promise — a planning estimate).
  const projectedGoalDate = remaining === 0
    ? from
    : cap > 0 ? addDays(from, Math.ceil((remaining / cap) * 7)) : null;
  return {
    requiredPerWeek: round(requiredPerWeek, 2),
    plannedPerWeek: round(plannedPerWeek, 2),
    onPaceForDeadline: requiredPerWeek <= cap + 1e-9,
    projectedAtDeadline: round(projectedAtDeadline, 1),
    projectedGoalDate,
  };
}

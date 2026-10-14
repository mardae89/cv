// The Power List engine. Every number here is recomputed from saved records:
// which items were due on a day, which were completed, and the Power List
// Completion Rate (PCR) for any day, week or month.
//
// PCR = items completed ÷ items due, over the period. A day is "green" at 75%
// or more. Ratings: 75%+ good, 80%+ great, 90%+ exceptional.
import { addDays, addMonths, dow, monthEnd, monthStart, weekStart } from "../dates";
import { num } from "../format";
import type { ContentIdea, ISODate, PowerItem, PowerLog, PowerSettings, UserData } from "../types";
import { isSession } from "./athletic";

export const GREEN_AT = 75;

export type RatingKey = "exceptional" | "great" | "good" | "below";

export interface Rating {
  key: RatingKey;
  label: string;
  /** Short line used under scores. */
  line: string;
}

export const RATINGS: Record<RatingKey, Rating> = {
  exceptional: { key: "exceptional", label: "Exceptional", line: "90% or more. This is the standard." },
  great: { key: "great", label: "Great", line: "80% or more. Strong execution." },
  good: { key: "good", label: "Good", line: "75% or more. The line held." },
  below: { key: "below", label: "Below standard", line: "Under 75%. Reset and go again." },
};

export function rating(pct: number): Rating {
  if (pct >= 90) return RATINGS.exceptional;
  if (pct >= 80) return RATINGS.great;
  if (pct >= GREEN_AT) return RATINGS.good;
  return RATINGS.below;
}

/** Default reasons shown until you write your own. */
export const DEFAULT_SETTINGS: Omit<PowerSettings, "user_id"> = {
  reasons: ["Travel the world", "Financial freedom", "Freedom with my time", "Help my family", "Live life fully", "Health"],
  identity: null,
  shorts_per_day: 2,
  longs_per_week: 4,
  reach_per_day: 10,
  long_release_days: [1, 2, 3, 4],
  short_release_days: [0, 1, 2, 3, 4, 5, 6],
  strategy: null,
};

export const settingsOf = (data: Pick<UserData, "powerSettings">): Omit<PowerSettings, "user_id"> =>
  ({ ...DEFAULT_SETTINGS, ...(data.powerSettings ?? {}) });

const WEEKDAYS = [1, 2, 3, 4, 5];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/**
 * Your standard Power List: the things done every day, no matter what. Every
 * item stays editable. Day-specific work (filming, editing) lives in Daily
 * execution instead — see PRODUCTION_HABITS.
 */
export function standardPowerList(startDate: ISODate): Omit<PowerItem, "id" | "user_id">[] {
  const base = { start_date: startDate, archived_on: null, target: null, unit: null, auto: null } as const;
  return [
    { ...base, name: "Wake up by 5:45am", kind: "check", days: EVERY_DAY, sort_order: 0 },
    { ...base, name: "Morning cardio", kind: "check", days: EVERY_DAY, sort_order: 1 },
    { ...base, name: "Both exercise sessions", kind: "count", target: 2, unit: "sessions", auto: "workouts", days: EVERY_DAY, sort_order: 2 },
    { ...base, name: "Log food", kind: "check", auto: "food", days: EVERY_DAY, sort_order: 3 },
    { ...base, name: "Instagram stories", kind: "count", target: 6, unit: "stories", days: EVERY_DAY, sort_order: 4 },
    { ...base, name: "Short-form videos posted", kind: "count", target: 2, unit: "shorts", auto: "shorts", days: EVERY_DAY, sort_order: 5 },
    { ...base, name: "Read 5 pages", kind: "count", target: 5, unit: "pages", days: EVERY_DAY, sort_order: 6 },
    { ...base, name: "No impulsive purchases", kind: "check", days: EVERY_DAY, sort_order: 7 },
    { ...base, name: "In bed by 10:30pm", kind: "check", days: EVERY_DAY, sort_order: 8 },
  ];
}

/** Your filming and editing schedule, as Daily execution habits (they're due on set days, not every day). */
export const PRODUCTION_HABITS: { name: string; schedule_days: number[]; xp: number }[] = [
  { name: "Film short-form", schedule_days: [1, 2], xp: 15 },
  { name: "Film long-form", schedule_days: [3, 4, 5], xp: 15 },
  { name: "Edit for 90 minutes", schedule_days: WEEKDAYS, xp: 15 },
];

// ─────────────────────────────────────────────────────────────── index ──
export interface PowerIndex {
  logs: Map<string, PowerLog>;
  workouts: Map<ISODate, number>;
  food: Set<ISODate>;
  shorts: Map<ISODate, number>;
  longs: Map<ISODate, number>;
  reached: Map<ISODate, number>;
}

const key = (itemId: string, date: ISODate) => `${itemId}|${date}`;
const bump = (m: Map<ISODate, number>, d: ISODate) => m.set(d, (m.get(d) ?? 0) + 1);

export function indexPower(data: Pick<UserData, "powerLogs" | "workouts" | "nutrition" | "contentIdeas"> & { traffic?: UserData["traffic"] }): PowerIndex {
  const idx: PowerIndex = { logs: new Map(), workouts: new Map(), food: new Set(), shorts: new Map(), longs: new Map(), reached: new Map() };
  for (const t of data.traffic ?? []) idx.reached.set(t.log_date, (idx.reached.get(t.log_date) ?? 0) + num(t.reached));
  for (const l of data.powerLogs) idx.logs.set(key(l.item_id, l.log_date), l);
  for (const w of data.workouts) if (isSession(w)) bump(idx.workouts, w.workout_date);
  for (const n of data.nutrition) idx.food.add(n.log_date);
  for (const c of data.contentIdeas) {
    if (c.status !== "done" || !c.completed_on) continue;
    bump(c.format === "short" ? idx.shorts : idx.longs, c.completed_on);
  }
  return idx;
}

/** Progress recorded elsewhere in the app for that day (workouts logged, meals logged, videos completed). */
export function autoValue(item: PowerItem, date: ISODate, idx: PowerIndex): number | null {
  switch (item.auto) {
    case "workouts": return idx.workouts.get(date) ?? 0;
    case "food": return idx.food.has(date) ? 1 : 0;
    case "shorts": return idx.shorts.get(date) ?? 0;
    case "longs": return idx.longs.get(date) ?? 0;
    case "reached": return idx.reached.get(date) ?? 0;
    default: return null;
  }
}

export const isDue = (item: PowerItem, date: ISODate) =>
  item.start_date <= date && !(item.archived_on && item.archived_on <= date) && item.days.includes(dow(date));

export interface ItemState {
  item: PowerItem;
  log: PowerLog | undefined;
  /** For counted items: the best of what you entered and what was logged elsewhere. */
  value: number;
  target: number;
  auto: number | null;
  done: boolean;
}

export function itemState(item: PowerItem, date: ISODate, idx: PowerIndex): ItemState {
  const log = idx.logs.get(key(item.id, date));
  const auto = autoValue(item, date, idx);
  if (item.kind === "count") {
    const target = Math.max(1, num(item.target));
    const value = Math.max(num(log?.value), auto ?? 0);
    return { item, log, value, target, auto, done: value >= target };
  }
  const done = !!log?.done || (auto ?? 0) >= 1;
  return { item, log, value: done ? 1 : 0, target: 1, auto, done };
}

// ─────────────────────────────────────────────────────────────── days ──
export interface DayResult {
  date: ISODate;
  due: number;
  done: number;
  /** null when nothing was due. */
  pct: number | null;
  items: ItemState[];
}

export function dayResult(items: PowerItem[], date: ISODate, idx: PowerIndex): DayResult {
  const states = items.filter((i) => isDue(i, date)).sort((a, b) => a.sort_order - b.sort_order).map((i) => itemState(i, date, idx));
  const done = states.filter((s) => s.done).length;
  return { date, due: states.length, done, pct: states.length ? (done / states.length) * 100 : null, items: states };
}

/** Above this a day under 75% shows orange rather than red. */
export const ORANGE_ABOVE = 50;
export const BEST_AT = 90;

export type DayStatus = "best" | "green" | "orange" | "red" | "in-progress" | "future" | "none";

/**
 * Calendar colour. 90%+ bright green, 75%+ green, over 50% orange, 50% or
 * under red. Today stays "in progress" until it reaches green; it's only
 * judged orange or red once it's over. Neutral before the list existed.
 */
export function dayStatus(r: DayResult, today: ISODate): DayStatus {
  if (r.date > today) return "future";
  if (r.pct === null) return "none";
  if (r.pct >= BEST_AT) return "best";
  if (r.pct >= GREEN_AT) return "green";
  if (r.date === today) return "in-progress";
  return r.pct > ORANGE_ABOVE ? "orange" : "red";
}

/** The first date any item counts from. */
export function firstStart(items: PowerItem[]): ISODate | null {
  return items.reduce<ISODate | null>((m, i) => (m === null || i.start_date < m ? i.start_date : m), null);
}

// ──────────────────────────────────────────────────────────── periods ──
export interface ItemRate {
  item: PowerItem;
  due: number;
  done: number;
  pct: number;
}

export interface PeriodResult {
  from: ISODate;
  to: ISODate;
  /** Days that counted (from the list's start through today). */
  days: DayResult[];
  due: number;
  done: number;
  pct: number | null;
  /** Days at 75% or more (bright green included). */
  greenDays: number;
  /** Finished days over 50% but under 75%. */
  orangeDays: number;
  /** Finished days at 50% or under. */
  redDays: number;
  perfectDays: number;
  perItem: ItemRate[];
  /** The period is over (its last day is before today). */
  complete: boolean;
}

export function periodResult(items: PowerItem[], from: ISODate, to: ISODate, idx: PowerIndex, today: ISODate): PeriodResult {
  const start = firstStart(items);
  const days: DayResult[] = [];
  if (start) {
    const end = to < today ? to : today;
    for (let d = from < start ? start : from; d <= end; d = addDays(d, 1)) {
      const r = dayResult(items, d, idx);
      if (r.due) days.push(r);
    }
  }
  const due = days.reduce((s, d) => s + d.due, 0);
  const done = days.reduce((s, d) => s + d.done, 0);
  const byItem = new Map<string, ItemRate>();
  for (const d of days) {
    for (const s of d.items) {
      const r = byItem.get(s.item.id) ?? { item: s.item, due: 0, done: 0, pct: 0 };
      r.due++;
      if (s.done) r.done++;
      byItem.set(s.item.id, r);
    }
  }
  const perItem = [...byItem.values()].map((r) => ({ ...r, pct: r.due ? (r.done / r.due) * 100 : 0 }))
    .sort((a, b) => a.item.sort_order - b.item.sort_order);
  const finished = days.filter((d) => d.date < today || (d.pct ?? 0) >= GREEN_AT);
  return {
    from, to, days, due, done, pct: due ? (done / due) * 100 : null,
    greenDays: days.filter((d) => (d.pct ?? 0) >= GREEN_AT).length,
    orangeDays: finished.filter((d) => (d.pct ?? 0) < GREEN_AT && (d.pct ?? 0) > ORANGE_ABOVE).length,
    redDays: finished.filter((d) => (d.pct ?? 0) <= ORANGE_ABOVE).length,
    perfectDays: days.filter((d) => d.pct === 100).length,
    perItem, complete: to < today,
  };
}

export const weekOf = (d: ISODate) => ({ from: weekStart(d), to: addDays(weekStart(d), 6) });
export const monthOf = (d: ISODate) => ({ from: monthStart(d), to: monthEnd(d) });

/** Every week (Monday–Sunday) or month since the list started, oldest first. */
export function periods(items: PowerItem[], grain: "week" | "month", idx: PowerIndex, today: ISODate): PeriodResult[] {
  const start = firstStart(items);
  if (!start || start > today) return [];
  const out: PeriodResult[] = [];
  if (grain === "week") {
    for (let w = weekStart(start); w <= today; w = addDays(w, 7)) out.push(periodResult(items, w, addDays(w, 6), idx, today));
  } else {
    for (let m = monthStart(start); m <= today; m = addMonths(m, 1)) out.push(periodResult(items, m, monthEnd(m), idx, today));
  }
  return out.filter((p) => p.due > 0);
}

/** Consecutive green days. Today only extends the streak once it's green; it never breaks it while in progress. */
export function greenStreak(items: PowerItem[], idx: PowerIndex, today: ISODate): { current: number; best: number } {
  const start = firstStart(items);
  if (!start) return { current: 0, best: 0 };
  let run = 0, best = 0, current = 0;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const r = dayResult(items, d, idx);
    if (!r.due) continue; // a day with nothing due neither extends nor breaks a streak
    if ((r.pct ?? 0) >= GREEN_AT) run++;
    else if (d !== today) run = 0;
    best = Math.max(best, run);
  }
  current = run;
  return { current, best };
}

// ─────────────────────────────────────────────────────────── content ──
export interface ContentTally {
  shorts: number;
  longs: number;
  shortTarget: number;
  longTarget: number;
}

/** Content completed from `from` to `to`, against targets for `counted` (the days the list was running). Short-form counts only release days. */
export function contentTally(ideas: ContentIdea[], from: ISODate, to: ISODate, settings: Omit<PowerSettings, "user_id">, counted: ISODate[]): ContentTally {
  const done = ideas.filter((c) => c.status === "done" && c.completed_on && c.completed_on >= from && c.completed_on <= to);
  const weeks = Math.max(1, Math.round(counted.length / 7));
  const shortDays = counted.filter((d) => settings.short_release_days.includes(dow(d))).length;
  return {
    shorts: done.filter((c) => c.format === "short").length,
    longs: done.filter((c) => c.format === "long").length,
    shortTarget: settings.shorts_per_day * shortDays,
    longTarget: settings.longs_per_week * weeks,
  };
}

// ─────────────────────────────────────────────────────────── analysis ──
export interface Analysis {
  headline: string;
  points: string[];
}

const pctText = (n: number) => `${Math.round(n)}%`;

/** A plain-language review of a week or month, written only from what was logged. */
export function analyse(p: PeriodResult, prev: PeriodResult | null, tally: ContentTally, label: "week" | "month"): Analysis {
  if (p.pct === null) return { headline: `Nothing was due this ${label}.`, points: [] };
  const r = rating(p.pct);
  const points: string[] = [];
  const headline = p.complete
    ? `${r.label} ${label}: ${pctText(p.pct)} PCR across ${p.due} scheduled items.`
    : `${pctText(p.pct)} PCR so far this ${label} (${p.done} of ${p.due} items).`;
  points.push(`${p.greenDays} green day${p.greenDays === 1 ? "" : "s"}, ${p.orangeDays} orange, ${p.redDays} red${p.perfectDays ? `, ${p.perfectDays} perfect` : ""}.`);
  if (prev?.pct != null) {
    const diff = p.pct - prev.pct;
    points.push(Math.abs(diff) < 0.5 ? `Level with last ${label} (${pctText(prev.pct)}).`
      : `${diff > 0 ? "Up" : "Down"} ${Math.abs(Math.round(diff))} points on last ${label} (${pctText(prev.pct)}).`);
  }
  const ranked = [...p.perItem].filter((i) => i.due > 0).sort((a, b) => b.pct - a.pct);
  const strongest = ranked.filter((i) => i.pct === 100);
  if (strongest.length) points.push(`Never missed: ${strongest.map((i) => i.item.name).join(", ")}.`);
  const weakest = ranked.filter((i) => i.pct < GREEN_AT).slice(-2).reverse();
  if (weakest.length) points.push(`Weakest: ${weakest.map((i) => `${i.item.name} (${i.done}/${i.due})`).join(", ")}. Fix this first.`);
  points.push(`Content: ${tally.shorts}/${tally.shortTarget} short-form and ${tally.longs}/${tally.longTarget} long-form completed.`);
  if (!p.complete && p.pct < GREEN_AT) {
    points.push(`Getting this ${label} to ${GREEN_AT}% means completing ${Math.max(0, Math.ceil(p.due * GREEN_AT / 100) - p.done)} more of the items already due.`);
  }
  return { headline, points };
}

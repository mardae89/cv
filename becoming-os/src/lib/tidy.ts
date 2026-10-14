// A one-time tidy-up between the two lists. The Power List is what you do
// every day; Daily execution (habits and tasks) is what's scheduled for a
// given day. This proposes the changes that bring older records in line —
// nothing changes until you apply them, and removed habits are archived, so
// their history and XP stay.
import type { Habit, ISODate, PowerItem, UserData } from "./types";
import { PRODUCTION_HABITS } from "./calc/power";

export type TidyStep =
  | { kind: "archive-habit"; id: string; name: string; because: string }
  | { kind: "rename-habit"; id: string; from: string; to: string }
  | { kind: "add-power"; name: string }
  | { kind: "move-to-habits"; id: string; name: string; days: number[] };

const active = <T extends { archived_on: ISODate | null }>(r: T, today: ISODate) => !(r.archived_on && r.archived_on <= today);
const norm = (s: string) => s.trim().toLowerCase();

/** Daily habits that repeat a Power List item, with the Power List item that covers each. */
const COVERED: { habit: RegExp; power: (i: PowerItem) => boolean }[] = [
  { habit: /^wake up on time$/i, power: (i) => /\bwake\b/i.test(i.name) },
  { habit: /^lights out on time$/i, power: (i) => /\b(bed|sleep|lights out)\b/i.test(i.name) },
  { habit: /^log (nutrition|food)$/i, power: (i) => i.auto === "food" || /\bfood\b/i.test(i.name) },
];

export const LEARN_NAME = "Learn for 20 minutes";

export function planTidy(data: Pick<UserData, "habits" | "powerItems">, today: ISODate): TidyStep[] {
  const power = data.powerItems.filter((i) => active(i, today));
  if (!power.length) return [];
  const habits = data.habits.filter((h) => active(h, today));
  const steps: TidyStep[] = [];
  for (const h of habits) {
    const c = COVERED.find((x) => x.habit.test(h.name.trim()));
    const by = c && power.find(c.power);
    if (by) steps.push({ kind: "archive-habit", id: h.id, name: h.name, because: by.name });
  }
  const read = habits.find((h) => /^read or learn\b/i.test(h.name.trim()));
  if (read && power.some((i) => /\bread\b/i.test(i.name))) steps.push({ kind: "rename-habit", id: read.id, from: read.name, to: LEARN_NAME });
  if (!power.some((i) => /\bcardio\b/i.test(i.name))) steps.push({ kind: "add-power", name: "Morning cardio" });
  for (const i of power) {
    if (i.days.length < 7) steps.push({ kind: "move-to-habits", id: i.id, name: i.name, days: i.days });
  }
  return steps;
}

export function describeStep(s: TidyStep): string {
  switch (s.kind) {
    case "archive-habit": return `Remove “${s.name}” from Daily execution — the Power List has “${s.because}”.`;
    case "rename-habit": return `Rename “${s.from}” to “${s.to}” — reading is on the Power List.`;
    case "add-power": return `Add “${s.name}” to the Power List, every day.`;
    case "move-to-habits": return `Move “${s.name}” to Daily execution — it's only due on certain days.`;
  }
}

/** The habit row to create when a Power List item moves to Daily execution. */
export function habitFromPowerItem(s: Extract<TidyStep, { kind: "move-to-habits" }>, today: ISODate, sortOrder: number): Partial<Habit> {
  const known = PRODUCTION_HABITS.find((p) => norm(p.name) === norm(s.name));
  return {
    name: s.name, category: "business", schedule_days: s.days, skip_on_rest_days: false,
    xp: known?.xp ?? 15, start_date: today, sort_order: sortOrder,
  };
}

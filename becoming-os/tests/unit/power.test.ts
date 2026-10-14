import { describe, expect, it } from "vitest";
import { SINGLE_DEFAULTS, validateSingle } from "../../src/data/schema";
import { evaluate } from "../../src/lib/calc/milestones";
import {
  analyse, contentTally, dayResult, dayStatus, DEFAULT_SETTINGS, greenStreak, indexPower, isDue, periodResult, periods, rating,
  PRODUCTION_HABITS, standardPowerList,
} from "../../src/lib/calc/power";
import type { ContentIdea, Habit, PowerItem, PowerLog, UserData } from "../../src/lib/types";
import { describeStep, LEARN_NAME, planTidy } from "../../src/lib/tidy";
import { id, makeData } from "./fixtures";

// 2026-10-12 is a Monday.
const MON = "2026-10-12";
const items = (start = MON): PowerItem[] => standardPowerList(start).map((i) => ({ ...i, id: id(), user_id: "u1" }) as PowerItem);
const log = (item: PowerItem, date: string, v: Partial<PowerLog>): PowerLog =>
  ({ id: id(), user_id: "u1", item_id: item.id, log_date: date, value: null, done: false, ...v });
const byName = (list: PowerItem[], name: string) => list.find((i) => i.name.startsWith(name))!;

/** Logs that complete every item due on `date` except those named in `skip`. */
function complete(list: PowerItem[], date: string, skip: string[] = []): PowerLog[] {
  const r = dayResult(list, date, indexPower(makeData()));
  return r.items.filter((s) => !skip.some((n) => s.item.name.startsWith(n)))
    .map((s) => log(s.item, date, s.item.kind === "count" ? { value: s.target } : { done: true }));
}

describe("ratings", () => {
  it("uses the 75 / 80 / 90 thresholds", () => {
    expect(rating(74.9).key).toBe("below");
    expect(rating(75).key).toBe("good");
    expect(rating(80).key).toBe("great");
    expect(rating(90).key).toBe("exceptional");
    expect(rating(100).key).toBe("exceptional");
  });
});

describe("the standard list", () => {
  const list = items();
  it("holds only every-day items, with morning cardio; filming and editing are day-specific habits", () => {
    const due = (d: string) => list.filter((i) => isDue(i, d)).map((i) => i.name);
    expect(list.every((i) => i.days.length === 7)).toBe(true);
    expect(due(MON)).toHaveLength(9);
    expect(due("2026-10-17")).toHaveLength(9);
    expect(due(MON)).toContain("Morning cardio");
    expect(due(MON).some((n) => /^(film|edit)\b/i.test(n))).toBe(false);
    const days = Object.fromEntries(PRODUCTION_HABITS.map((p) => [p.name, p.schedule_days]));
    expect(days).toEqual({ "Film short-form": [1, 2], "Film long-form": [3, 4, 5], "Edit for 90 minutes": [1, 2, 3, 4, 5] });
  });
  it("counts nothing before the list's start date", () => {
    expect(dayResult(list, "2026-10-11", indexPower(makeData())).due).toBe(0);
  });
});

describe("day results", () => {
  const list = items();
  it("needs a counted item's full target", () => {
    const stories = byName(list, "Instagram stories");
    const idx = indexPower(makeData({ powerLogs: [log(stories, MON, { value: 5 })] }));
    expect(dayResult(list, MON, idx).items.find((s) => s.item.id === stories.id)!.done).toBe(false);
    const idx2 = indexPower(makeData({ powerLogs: [log(stories, MON, { value: 6 })] }));
    expect(dayResult(list, MON, idx2).items.find((s) => s.item.id === stories.id)!.done).toBe(true);
  });
  it("fills items from records logged elsewhere (workouts, meals, finished videos)", () => {
    const data = makeData({
      workouts: [{ id: id(), workout_date: MON, activity: "run" }, { id: id(), workout_date: MON, activity: "strength" }] as UserData["workouts"],
      nutrition: [{ id: id(), log_date: MON }] as UserData["nutrition"],
      contentIdeas: [1, 2].map((n) => ({ id: id(), num: n, format: "short", status: "done", completed_on: MON }) as ContentIdea),
    });
    const r = dayResult(list, MON, indexPower(data));
    const done = r.items.filter((s) => s.done).map((s) => s.item.name);
    expect(done).toEqual(["Both exercise sessions", "Log food", "Short-form videos posted"]);
  });
  it("colours days: 90%+ bright green, 75%+ green, over 50% orange, 50% or under red", () => {
    const today = "2026-10-14";
    // Monday: 9 due, 7 done = 78% → green. Tuesday: 9 due, 6 done = 67% → orange.
    const data = makeData({ powerLogs: [...complete(list, MON, ["Read", "In bed"]), ...complete(list, "2026-10-13", ["Read", "In bed", "No impulsive"])] });
    const idx = indexPower(data);
    expect(dayStatus(dayResult(list, MON, idx), today)).toBe("green");
    expect(dayStatus(dayResult(list, "2026-10-13", idx), today)).toBe("orange");
    expect(dayStatus(dayResult(list, today, idx), today)).toBe("in-progress");
    expect(dayStatus(dayResult(list, "2026-10-20", idx), today)).toBe("future");
    const at = (pct: number, date = "2026-10-13") => dayStatus({ date, due: 100, done: pct, pct, items: [] }, today);
    expect(at(100)).toBe("best");
    expect(at(90)).toBe("best");
    expect(at(89)).toBe("green");
    expect(at(75)).toBe("green");
    expect(at(74)).toBe("orange");
    expect(at(51)).toBe("orange");
    expect(at(50)).toBe("red");
    expect(at(0)).toBe("red");
    // Today is only judged once it's over — unless it's already green.
    expect(at(60, today)).toBe("in-progress");
    expect(at(92, today)).toBe("best");
  });
});

describe("weekly and monthly PCR", () => {
  const list = items();
  // Full week Mon 12 – Sun 18: Mon–Sat perfect, Sunday nothing → 54 of 63 items.
  const logs = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"].flatMap((d) => complete(list, d));
  const data = makeData({ powerLogs: logs });
  const idx = indexPower(data);

  it("is completed items over items due, for the whole week", () => {
    const w = periodResult(list, MON, "2026-10-18", idx, "2026-10-20");
    expect(w.due).toBe(7 * 9);
    expect(w.done).toBe(6 * 9);
    expect(w.pct).toBeCloseTo((54 / 63) * 100, 5);
    expect(rating(w.pct!).key).toBe("great");
    expect(w.greenDays).toBe(6);
    expect(w.redDays).toBe(1);
    expect(w.perfectDays).toBe(6);
    expect(w.complete).toBe(true);
  });
  it("only counts days up to today for the current week", () => {
    const w = periodResult(list, MON, "2026-10-18", idx, "2026-10-13");
    expect(w.days.map((d) => d.date)).toEqual([MON, "2026-10-13"]);
    expect(w.pct).toBe(100);
    expect(w.complete).toBe(false);
  });
  it("lists weeks and months since the start", () => {
    expect(periods(list, "week", idx, "2026-10-27").map((p) => p.from)).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(periods(list, "month", idx, "2026-11-02").map((p) => p.from)).toEqual(["2026-10-01", "2026-11-01"]);
  });
  it("tracks the green streak without breaking it on an unfinished today", () => {
    expect(greenStreak(list, idx, "2026-10-17")).toEqual({ current: 6, best: 6 });
    expect(greenStreak(list, idx, "2026-10-19")).toEqual({ current: 0, best: 6 });
  });
  it("writes the analysis only from what was logged", () => {
    const w = periodResult(list, MON, "2026-10-18", idx, "2026-10-20");
    const t = contentTally(data.contentIdeas, MON, "2026-10-18", DEFAULT_SETTINGS, w.days.map((d) => d.date));
    expect(t.shortTarget).toBe(14);
    expect(t.longTarget).toBe(4);
    const a = analyse(w, null, t, "week");
    expect(a.headline).toMatch(/^Great week: 86% PCR/);
    expect(a.points.join(" ")).toContain("6 green days, 0 orange, 1 red, 6 perfect");
  });
  it("counts the short-form target only on short-form release days", () => {
    const days = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
    const weekdays = contentTally([], MON, "2026-10-18", { ...DEFAULT_SETTINGS, short_release_days: [1, 2, 3, 4, 5] }, days);
    expect(weekdays.shortTarget).toBe(10);
    expect(weekdays.longTarget).toBe(4);
    const twoDays = contentTally([], MON, "2026-10-18", { ...DEFAULT_SETTINGS, short_release_days: [1, 3] }, days.slice(0, 2));
    expect(twoDays.shortTarget).toBe(2);
  });
});

describe("power milestones and XP", () => {
  it("awards the green-day, perfect-day and streak milestones from the logs", () => {
    const list = items();
    const logs = ["2026-10-12", "2026-10-13", "2026-10-14"].flatMap((d) => complete(list, d));
    const ev = evaluate(makeData({ powerItems: list, powerLogs: logs }), "2026-10-14");
    const got = (k: string) => ev.milestones.find((m) => m.key === k)?.achievedOn;
    expect(got("power.first_green")).toBe(MON);
    expect(got("power.first_perfect")).toBe(MON);
    expect(got("power.streak_3")).toBe("2026-10-14");
    expect(got("power.streak_7")).toBeNull();
    expect(ev.xp.byCategory.habits).toBeGreaterThanOrEqual(3 * (9 * 5 + 25 + 50));
  });
  it("scores a week only once it is over", () => {
    const list = items();
    const logs = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"].flatMap((d) => complete(list, d));
    const during = evaluate(makeData({ powerItems: list, powerLogs: logs }), "2026-10-18");
    expect(during.milestones.find((m) => m.key === "power.week_exceptional")?.achievedOn).toBeNull();
    const after = evaluate(makeData({ powerItems: list, powerLogs: logs }), "2026-10-19");
    expect(after.milestones.find((m) => m.key === "power.week_exceptional")?.achievedOn).toBe("2026-10-18");
  });
});

describe("power settings validation", () => {
  const base = { ...SINGLE_DEFAULTS.powerSettings } as Record<string, unknown>;
  const strategy = { positioning: "P", tone: "T", goal: "G", changed: "", rules: ["One rule"] };
  it("accepts the defaults, release days and a written strategy", () => {
    expect(() => validateSingle("powerSettings", base)).not.toThrow();
    expect(() => validateSingle("powerSettings", { ...base, short_release_days: [1, 2, 3, 4, 5], strategy })).not.toThrow();
  });
  it("rejects bad release days and empty strategy rules", () => {
    expect(() => validateSingle("powerSettings", { ...base, short_release_days: [7] })).toThrow(/Short-form release days/);
    expect(() => validateSingle("powerSettings", { ...base, long_release_days: ["Mon"] })).toThrow(/Long-form release days/);
    expect(() => validateSingle("powerSettings", { ...base, strategy: { ...strategy, rules: ["  "] } })).toThrow(/rule/);
    expect(() => validateSingle("powerSettings", { ...base, strategy: { ...strategy, tone: 5 } })).toThrow(/Tone/);
  });
});

describe("tidying the two lists", () => {
  const habit = (name: string, extra: Partial<Habit> = {}): Habit => ({
    id: id(), user_id: "u1", name, category: "mind", schedule_days: [0, 1, 2, 3, 4, 5, 6], skip_on_rest_days: false,
    xp: 10, start_date: MON, archived_on: null, sort_order: 0, ...extra,
  });
  const oldList = (): PowerItem[] => [
    ...items(),
    { id: id(), user_id: "u1", name: "Film short-form", kind: "check", days: [1, 2], start_date: MON, archived_on: null, target: null, unit: null, auto: null, sort_order: 20 },
  ];
  it("proposes removing habits the Power List covers, renaming read, adding cardio and moving day-specific items", () => {
    const power = oldList().filter((i) => i.name !== "Morning cardio");
    const habits = [habit("Wake up on time"), habit("Lights out on time"), habit("Log nutrition"), habit("Read or learn (20 min)"), habit("Plan tomorrow")];
    const steps = planTidy({ habits, powerItems: power }, "2026-10-14");
    expect(steps.map(describeStep)).toEqual([
      "Remove “Wake up on time” from Daily execution — the Power List has “Wake up by 5:45am”.",
      "Remove “Lights out on time” from Daily execution — the Power List has “In bed by 10:30pm”.",
      "Remove “Log nutrition” from Daily execution — the Power List has “Log food”.",
      "Rename “Read or learn (20 min)” to “Learn for 20 minutes” — reading is on the Power List.",
      "Add “Morning cardio” to the Power List, every day.",
      "Move “Film short-form” to Daily execution — it's only due on certain days.",
    ]);
  });
  it("proposes nothing once tidy, or without a Power List", () => {
    expect(planTidy({ habits: [habit("Plan tomorrow"), habit(LEARN_NAME)], powerItems: items() }, "2026-10-14")).toEqual([]);
    expect(planTidy({ habits: [habit("Wake up on time")], powerItems: [] }, "2026-10-14")).toEqual([]);
    const archived = habit("Wake up on time", { archived_on: "2026-10-13" });
    expect(planTidy({ habits: [archived], powerItems: items() }, "2026-10-14")).toEqual([]);
  });
});

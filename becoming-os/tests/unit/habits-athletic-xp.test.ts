import { describe, expect, it } from "vitest";
import { injuryAlert, longestRun, strengthPRs, symptomSummary, trainingWeek } from "../../src/lib/calc/athletic";
import { dayScore, habitStreak, indexHabits, isScheduled, periodScore } from "../../src/lib/calc/habits";
import { diffAchievements, evaluate, nextMilestone } from "../../src/lib/calc/milestones";
import { buildReview } from "../../src/lib/calc/reviews";
import { buildRoadmap, CHAPTERS } from "../../src/lib/calc/roadmap";
import { checkWorkout } from "../../src/lib/calc/validation";
import { computeXP, levelState, LEVELS } from "../../src/lib/calc/xp";
import type { AchievementRow, HabitCompletion, RestDay, SymptomLog } from "../../src/lib/types";
import { goals, habit, id, makeData, w, workout } from "./fixtures";

const done = (habit_id: string, completed_on: string): HabitCompletion => ({ id: id(), user_id: "u1", habit_id, completed_on, note: null });
const rest = (rest_date: string): RestDay => ({ id: id(), user_id: "u1", rest_date, note: null });

describe("habit scheduling", () => {
  const weekdays = habit("Outreach", [1, 2, 3, 4, 5]);
  const gym = habit("Strength", [1, 3, 5], { skip_on_rest_days: true });
  const weekend = habit("Long walk", [0, 6]);

  it("respects weekday/weekend schedules, start dates, archives and rest days", () => {
    const r = new Set(["2026-10-14"]);
    expect(isScheduled(weekdays, "2026-10-12", r)).toBe(true); // Mon
    expect(isScheduled(weekdays, "2026-10-17", r)).toBe(false); // Sat
    expect(isScheduled(weekend, "2026-10-17", r)).toBe(true);
    expect(isScheduled(gym, "2026-10-14", r)).toBe(false); // rest day
    expect(isScheduled(weekdays, "2026-10-14", r)).toBe(true); // doesn't pause on rest days
    expect(isScheduled(weekdays, "2026-10-09", r)).toBe(false); // before start
    expect(isScheduled({ ...weekdays, archived_on: "2026-10-13" }, "2026-10-13", r)).toBe(false);
  });

  it("scores only scheduled habits and today's tasks", () => {
    const idx = indexHabits([done(weekdays.id, "2026-10-12")], []);
    const s = dayScore([weekdays, gym, weekend], idx, [
      { id: "t1", user_id: "u1", title: "Plan week", due_date: "2026-10-12", completed_on: "2026-10-12", category: "mind" },
      { id: "t2", user_id: "u1", title: "Other day", due_date: "2026-10-13", completed_on: null, category: "mind" },
    ], "2026-10-12");
    expect(s).toMatchObject({ habitsScheduled: 2, habitsDone: 1, tasksDue: 1, tasksDone: 1, total: 3, completed: 2 });
    expect(s.pct).toBeCloseTo(66.7, 1);
  });

  it("excludes rest days from weekly percentages", () => {
    const idx = indexHabits([done(gym.id, "2026-10-12"), done(gym.id, "2026-10-16")], [rest("2026-10-14")]);
    expect(periodScore([gym], idx, "2026-10-12", "2026-10-18")).toMatchObject({ scheduled: 2, done: 2, pct: 100 });
  });

  it("keeps streaks through unscheduled days, rest days and an unfinished today", () => {
    const idx = indexHabits(
      [done(gym.id, "2026-10-12"), done(gym.id, "2026-10-16"), done(gym.id, "2026-10-19")],
      [rest("2026-10-14")],
    );
    expect(habitStreak(gym, idx, "2026-10-21")).toBe(3); // Wed 21 not done yet
    expect(habitStreak(gym, idx, "2026-10-22")).toBe(0); // Wed 21 missed
  });
});

describe("training", () => {
  it("summarises a week and ignores recovery days as sessions", () => {
    const ws = [
      workout("2026-10-12", "strength"),
      workout("2026-10-13", "run_walk", { distance_mi: 1.5 }),
      workout("2026-10-15", "run", { distance_mi: 2.2 }),
      workout("2026-10-16", "recovery"),
    ];
    expect(trainingWeek(ws, "2026-10-14", 3)).toMatchObject({ sessions: 3, pct: 100, runMiles: 3.7, longestRun: 2.2, strength: 1, recoveryDays: 1 });
    expect(longestRun(ws)).toEqual({ distance: 2.2, date: "2026-10-15" });
  });

  it("finds strength PRs", () => {
    const wk = workout("2026-10-12", "strength");
    const prs = strengthPRs([
      { id: "s1", user_id: "u1", workout_id: wk.id, exercise: "Squat", set_no: 1, reps: 5, weight_lb: 185 },
      { id: "s2", user_id: "u1", workout_id: wk.id, exercise: "squat", set_no: 2, reps: 3, weight_lb: 205 },
    ], [wk]);
    expect(prs[0]).toMatchObject({ exercise: "Squat", bestWeight: 205, bestWeightReps: 3, sets: 2 });
  });

  it("unlocks distance milestones from logged workouts only", () => {
    const data = makeData({
      workouts: [
        workout("2026-11-01", "run_walk", { distance_mi: 1.2, pain_level: 0 }),
        workout("2026-11-08", "run", { distance_mi: 1.0 }),
        workout("2026-12-20", "run_walk", { distance_mi: 3.2 }),
      ],
    });
    const ms = evaluate(data, "2026-12-31").milestones;
    expect(ms.find((m) => m.key === "ath.pain_free_run")!.achievedOn).toBe("2026-11-01");
    expect(ms.find((m) => m.key === "ath.mile")!.achievedOn).toBe("2026-11-08"); // run-walk doesn't count as continuous
    expect(ms.find((m) => m.key === "ath.5k")!.achievedOn).toBe("2026-12-20");
    expect(ms.find((m) => m.key === "ath.10k")!.achievedOn).toBeNull();
  });

  it("asks for assessment on sharp or persistent pain, without clearing anyone", () => {
    const sym = (log_date: string, pain_level: number, pain_type: SymptomLog["pain_type"] = "aching"): SymptomLog => ({
      id: id(), user_id: "u1", log_date, body_area: "Ankle", side: "right", pain_level, pain_type, during: "walking", note: null,
    });
    const profile = { user_id: "u1", readiness: "no_injury" as const, assessed_on: null, injury_notes: null, phase: "foundation" as const, weekly_session_target: 3, training_days: [1], goal_text: "", race_name: null, race_date: null };
    expect(injuryAlert(profile, symptomSummary([sym("2026-10-10", 3, "sharp")], "2026-10-12")).level).toBe("assess");
    expect(injuryAlert(profile, symptomSummary([sym("2026-10-10", 2)], "2026-10-12")).level).toBe("monitor");
    expect(injuryAlert(profile, symptomSummary([sym("2026-09-01", 8)], "2026-10-12")).level).toBe("none");
    expect(injuryAlert({ ...profile, readiness: "symptoms_not_assessed" }, symptomSummary([], "2026-10-12")).level).toBe("assess");
  });

  it("asks to confirm implausible workouts", () => {
    expect(checkWorkout("run", 3.1, 12).ok).toBe(false);
    expect(checkWorkout("run", 3.1, 36).ok).toBe(true);
  });
});

describe("XP and levels", () => {
  it("caps workouts at two per day so extra volume earns nothing", () => {
    const base = makeData({ workouts: [workout("2026-10-12", "run"), workout("2026-10-12", "strength")] });
    const more = makeData({ workouts: [...base.workouts, workout("2026-10-12", "cycle"), workout("2026-10-12", "swim")] });
    expect(computeXP(base, []).total).toBe(50);
    expect(computeXP(more, []).total).toBe(50);
  });

  it("never subtracts XP for setbacks", () => {
    const data = makeData({ weights: [w("2026-10-10", 267), w("2026-10-11", 270)] });
    expect(computeXP(data, []).total).toBe(10);
  });

  it("needs both XP and milestones to level up", () => {
    expect(levelState(5000, 0).current.level).toBe(1);
    expect(levelState(400, 1).current.level).toBe(2);
    expect(levelState(14000, 20).current.name).toBe("The Transformed");
    expect(LEVELS).toHaveLength(7);
  });

  it("diffs stored achievements against evaluated rules", () => {
    const data = makeData({ goals: goals(267, 50), weights: [w("2026-10-20", 261)] });
    const ev = evaluate(data, "2026-10-20");
    const stale: AchievementRow = { id: "a1", user_id: "u1", key: "weight.10", category: "weight", tier: "minor", title: "10 pounds lost", detail: null, value: 10, achieved_on: "2026-10-19", celebrated_at: null, photo_id: null, created_at: "" };
    const d = diffAchievements(ev.unlocked, [stale]);
    expect(d.insert.map((m) => m.key)).toContain("weight.5");
    expect(d.remove.map((r) => r.key)).toEqual(["weight.10"]);
  });

  it("points at the closest locked milestone", () => {
    const data = makeData({ goals: goals(267, 50), weights: [w("2026-10-20", 263)] });
    expect(nextMilestone(evaluate(data, "2026-10-20").milestones, "weight")!.key).toBe("weight.5");
  });
});

describe("roadmap and reviews", () => {
  it("has eight chapters covering the mission exactly", () => {
    expect(CHAPTERS).toHaveLength(8);
    expect(CHAPTERS[0].start).toBe("2026-10-10");
    expect(CHAPTERS[7].end).toBe("2027-05-24");
  });

  it("plans weight targets that never exceed a sustainable pace", () => {
    const data = makeData({ goals: goals(267, 50, 60), weights: [w("2026-10-10", 267)] });
    const r = buildRoadmap(data, "2026-10-10", []);
    expect(r[7].weightPlanned).toBe(217);
    const perWeek = (267 - r[0].weightPlanned!) / (21 / 7);
    expect(perWeek).toBeLessThanOrEqual(2);
  });

  it("pauses running phases in the roadmap until cleared", () => {
    const data = makeData({ athletic: { user_id: "u1", readiness: "symptoms_not_assessed", assessed_on: null, injury_notes: null, phase: "foundation", weekly_session_target: 3, training_days: [1], goal_text: "", race_name: null, race_date: null } });
    expect(buildRoadmap(data, "2026-10-10", [])[5].athletic).toMatch(/paused/);
  });

  it("builds a weekly review from saved records", () => {
    const data = makeData({
      goals: goals(267, 50),
      weights: [w("2026-10-10", 267), w("2026-10-14", 265), w("2026-10-16", 264)],
      workouts: [workout("2026-10-13", "strength"), workout("2026-10-15", "run_walk", { distance_mi: 1 })],
    });
    const r = buildReview(data, "2026-10-12", "2026-10-18", "2026-10-18", []);
    expect(r.weight).toMatchObject({ weighIns: 2, startTrend: 267 });
    expect(r.training).toMatchObject({ sessions: 2, target: 3, runMiles: 1 });
    expect(r.setbacks.join(" ")).toMatch(/2 of 3/);
    expect(r.priorities.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { buildSummary, DEFAULT_SHARE, summaryFingerprint } from "../../src/data/partner";
import type { Evaluation, Milestone } from "../../src/lib/calc/milestones";
import type { DailyCheckin, JournalEntry, Review, ShareSettings, SymptomLog, UserData } from "../../src/lib/types";
import { goals, habit, id, makeData, sale, w, workout } from "./fixtures";

const TODAY = "2026-10-14";

const share = (over: Partial<ShareSettings> = {}): ShareSettings => ({ ...DEFAULT_SHARE, user_id: "u1", ...over });

const ms = (key: string, category: Milestone["category"]): Milestone => ({
  key, category, group: "g", tier: "minor", title: `Title ${key}`, requirement: "REQ-SECRET", detail: "DETAIL-SECRET",
  achievedOn: "2026-10-12", progress: null, order: 0,
});

const ALL_MILESTONES = [
  ms("weight.5", "weight"), ms("biz.revenue.1000", "business"), ms("ath.first_week", "athletic"),
  ms("habit.log_7", "habit"), ms("habit.workouts_30", "habit"), ms("habit.biz_30", "habit"),
  ms("habit.sleep_recovery", "habit"), ms("habit.first_review", "habit"), ms("level.2", "level"),
];
const ev = (unlocked: Milestone[] = ALL_MILESTONES) => ({ milestones: unlocked, unlocked }) as unknown as Evaluation;

const journal = (date: string, shared: boolean, body: string, extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id: id(), user_id: "u1", entry_date: date, kind: "journal", title: null, body, minutes: null, shared, created_at: `${date}T12:00:00Z`, ...extra,
});
const review = (start: string, shared: boolean, completed: boolean, text: string): Review => ({
  id: id(), user_id: "u1", period: "week", period_start: start, went_well: text, difficult: null, learned: null, change_next: null,
  proud: null, shared, completed_at: completed ? `${start}T20:00:00Z` : null,
});

/** One of everything, including private notes that must never appear in a summary. */
function richData(over: Partial<UserData> = {}): UserData {
  const h = habit("Walk", [0, 1, 2, 3, 4, 5, 6], { start_date: "2026-10-01" });
  const checkin: DailyCheckin = {
    id: id(), user_id: "u1", checkin_date: TODAY, sleep_hours: 6.5, sleep_quality: 2, energy: 2, soreness: 4, fatigue: 4, water_oz: 40,
    note: "CHECKIN-SECRET",
  };
  const symptom: SymptomLog = {
    id: id(), user_id: "u1", log_date: TODAY, body_area: "Ankle", side: "left", pain_level: 6, pain_type: "sharp", during: null,
    note: "SYMPTOM-SECRET",
  } as SymptomLog;
  return makeData({
    goals: goals(267, 50, 60),
    weights: [w("2026-10-10", 267.2), w("2026-10-12", 264.6), w("2026-10-14", 262.4)],
    athletic: {
      user_id: "u1", readiness: null, assessed_on: null, injury_notes: "INJURY-SECRET", phase: "build", weekly_session_target: 4,
      training_days: [1, 3, 5], goal_text: "Run a 10K", race_name: "Turkey Trot", race_date: "2026-11-26",
    } as unknown as UserData["athletic"],
    workouts: [
      workout("2026-10-13", "run", { distance_mi: 3.1, notes: "WORKOUT-SECRET", title: "Easy run" }),
      workout("2026-10-14", "strength", { recovery_notes: "RECOVERY-SECRET" }),
      workout("2026-10-14", "recovery"),
      workout("2026-09-01", "run_walk", { distance_mi: 4 }),
    ],
    habits: [h],
    completions: [{ id: id(), user_id: "u1", habit_id: h.id, completed_on: TODAY, note: "COMPLETION-SECRET" }],
    checkins: [checkin],
    symptoms: [symptom],
    photos: [{ id: "photo-1", user_id: "u1", taken_on: TODAY, storage_path: "PHOTO-SECRET", pose: null, caption: "CAPTION-SECRET" } as UserData["photos"][number]],
    transactions: [sale("2026-10-05", 1200, { notes: "TXN-SECRET", description: "Client Ada" })],
    businessSettings: {
      user_id: "u1", goal_metric: "revenue", goal_amount: 5000, goal_deadline: "2027-05-24", baseline_revenue: null,
      baseline_expenses: null, baseline_confirmed_on: null, forecast: {},
    } as UserData["businessSettings"],
    journal: [journal("2026-10-13", false, "JOURNAL-SECRET"), journal("2026-10-12", true, "Shared thought")],
    reviews: [review("2026-10-05", false, true, "REVIEW-SECRET"), review("2026-09-28", true, false, "DRAFT-SECRET"), review("2026-09-21", true, true, "Good week")],
    ...over,
  });
}

const SECRETS = [
  "CHECKIN-SECRET", "SYMPTOM-SECRET", "INJURY-SECRET", "WORKOUT-SECRET", "RECOVERY-SECRET", "COMPLETION-SECRET", "PHOTO-SECRET",
  "CAPTION-SECRET", "TXN-SECRET", "Client Ada", "JOURNAL-SECRET", "REVIEW-SECRET", "DRAFT-SECRET", "REQ-SECRET", "DETAIL-SECRET",
];

const FULL: Partial<ShareSettings> = { weight: "full", training: "full", habits: "full", health: "full", photos: "full", milestones: "full", business: "full" };
const NONE: Partial<ShareSettings> = { weight: "none", training: "none", habits: "none", health: "none", photos: "none", milestones: "none", business: "none" };

describe("partner summary: basics", () => {
  it("names the owner, the day and the levels it was built with", () => {
    const s = buildSummary(richData(), ev(), TODAY, share({ weight: "pounds" }), "u1");
    expect(s).toMatchObject({ partner_id: "u1", display_name: "Test", today: TODAY, demo_mode: false });
    expect(s.levels).toEqual({ weight: "pounds", training: "summary", habits: "summary", health: "none", photos: "none", milestones: "full", business: "none" });
    expect(typeof s.updated_at).toBe("string");
  });

  it("uses the default levels when nothing is saved", () => {
    const s = buildSummary(richData(), ev(), TODAY, null, "u1");
    expect(s.levels).toMatchObject({ weight: "percent", training: "summary", habits: "summary", health: "none", business: "none" });
    expect(s.weight).toBeDefined();
    expect(s.weight!.lost).toBeUndefined();
    expect(s.business).toBeUndefined();
  });

  it("shares only the record kinds it lists, and never private notes, even with everything on", () => {
    const s = buildSummary(richData(), ev(), TODAY, share(FULL), "u1");
    const json = JSON.stringify(s);
    for (const secret of SECRETS) expect(json, secret).not.toContain(secret);
    expect(Object.keys(s).sort()).toEqual([
      "achievements", "business", "demo_mode", "display_name", "habits", "journal", "levels", "partner_id", "reviews", "today",
      "training", "updated_at", "weight", "weights", "workouts",
    ]);
  });

  it("shares nothing but the name and levels when everything is off", () => {
    const data = richData({ journal: [], reviews: [] });
    const s = buildSummary(data, ev(), TODAY, share(NONE), "u1");
    expect(s.weight).toBeUndefined();
    expect(s.training).toBeUndefined();
    expect(s.habits).toBeUndefined();
    expect(s.business).toBeUndefined();
    expect(s.achievements).toEqual([]);
    expect(s.weights).toEqual([]);
    expect(s.workouts).toEqual([]);
    expect(JSON.stringify(s)).not.toMatch(/26[0-9]\.\d/); // no weights anywhere
  });

  it("fingerprints ignore the timestamp", () => {
    const a = buildSummary(richData(), ev(), TODAY, share(), "u1");
    const b = { ...a, updated_at: "2000-01-01T00:00:00Z" };
    expect(summaryFingerprint(a)).toBe(summaryFingerprint(b));
    expect(summaryFingerprint(a)).not.toBe(summaryFingerprint({ ...a, display_name: "Other" }));
  });
});

describe("partner summary: weight", () => {
  const data = richData();

  it("percent shares progress percentages only", () => {
    const s = buildSummary(data, ev(), TODAY, share({ weight: "percent" }), "u1");
    expect(Object.keys(s.weight!).sort()).toEqual(["has_goal", "pct_primary", "pct_stretch"]);
    expect(s.weight!.pct_primary).toBeGreaterThan(0);
    expect(s.weights).toEqual([]);
    const json = JSON.stringify(s);
    for (const n of ["267", "264.6", "262.4", "217"]) expect(json).not.toContain(n);
  });

  it("pounds adds pounds lost and the goal, but no body weight", () => {
    const s = buildSummary(data, ev(), TODAY, share({ weight: "pounds" }), "u1");
    expect(s.weight).toMatchObject({ has_goal: true, target_loss: 50, stretch_loss: 60 });
    expect(typeof s.weight!.lost).toBe("number");
    expect(typeof s.weight!.remaining).toBe("number");
    expect(typeof s.weight!.next_milestone).toBe("number");
    expect(s.weight!.start_weight).toBeUndefined();
    expect(s.weight!.current_trend).toBeUndefined();
    expect(s.weight!.target_weight).toBeUndefined();
    expect(s.weights).toEqual([]);
    const json = JSON.stringify(s);
    for (const n of ["267", "264.6", "262.4", "217"]) expect(json).not.toContain(n);
  });

  it("full adds the actual weights and the trend line", () => {
    const s = buildSummary(data, ev(), TODAY, share({ weight: "full" }), "u1");
    expect(s.weight).toMatchObject({ start_weight: 267, target_weight: 217, latest_entry: TODAY });
    expect(typeof s.weight!.current_trend).toBe("number");
    expect(s.weights.map((p) => p.date)).toEqual(["2026-10-10", "2026-10-12", "2026-10-14"]);
    expect(s.weights[2].weight).toBe(262.4);
  });

  it("none shares nothing about weight", () => {
    const s = buildSummary(data, ev(), TODAY, share({ weight: "none" }), "u1");
    expect(s.weight).toBeUndefined();
    expect(s.weights).toEqual([]);
  });

  it("says there's no goal yet rather than inventing numbers", () => {
    const s = buildSummary(richData({ goals: null }), ev([]), TODAY, share({ weight: "full" }), "u1");
    expect(s.weight).toEqual({ has_goal: false });
    expect(s.weights).toEqual([]);
  });
});

describe("partner summary: training", () => {
  const data = richData();

  it("summary shares this week's counts and the plan, not the sessions", () => {
    const s = buildSummary(data, ev(), TODAY, share({ training: "summary" }), "u1");
    expect(s.training).toMatchObject({
      session_target: 4, phase: "build", goal_text: "Run a 10K", race_name: "Turkey Trot", race_date: "2026-11-26",
      total_workouts: 3, longest_run: 4, strength_week: 1,
    });
    expect(s.training!.sessions_week).toBe(2); // recovery doesn't count as a session
    expect(s.training!.run_miles_week).toBe(3.1);
    expect(s.workouts).toEqual([]);
  });

  it("full adds recent sessions with only their basic fields", () => {
    const s = buildSummary(data, ev(), TODAY, share({ training: "full" }), "u1");
    expect(s.workouts).toHaveLength(4);
    expect(s.workouts[0].workout_date).toBe(TODAY);
    expect(s.workouts[s.workouts.length - 1].workout_date).toBe("2026-09-01");
    for (const wk of s.workouts) expect(Object.keys(wk).sort()).toEqual(["activity", "distance_mi", "duration_min", "id", "title", "workout_date"]);
  });

  it("caps the session list at 40", () => {
    const many = Array.from({ length: 50 }, (_, i) => workout(`2026-08-${String((i % 28) + 1).padStart(2, "0")}`, "walk"));
    const s = buildSummary(richData({ workouts: many }), ev(), TODAY, share({ training: "full" }), "u1");
    expect(s.workouts).toHaveLength(40);
  });

  it("none shares nothing about training", () => {
    const s = buildSummary(data, ev(), TODAY, share({ training: "none" }), "u1");
    expect(s.training).toBeUndefined();
    expect(s.workouts).toEqual([]);
    expect(JSON.stringify(s)).not.toContain("Turkey Trot");
  });
});

describe("partner summary: habits and business", () => {
  it("habits shares today's and this week's completion counts", () => {
    const s = buildSummary(richData(), ev(), TODAY, share({ habits: "summary" }), "u1");
    expect(s.habits).toMatchObject({ today_scheduled: 1, today_done: 1 });
    expect(s.habits!.week_done).toBe(1);
    expect(s.habits!.week_scheduled).toBeGreaterThanOrEqual(1);
    expect(buildSummary(richData(), ev(), TODAY, share({ habits: "none" }), "u1").habits).toBeUndefined();
  });

  it("business shares this month's goal progress only when turned on and enabled", () => {
    const s = buildSummary(richData(), ev(), TODAY, share({ business: "summary" }), "u1");
    expect(s.business).toEqual({ month: "2026-10-01", metric: "revenue", goal: 5000, value: 1200 });
    expect(buildSummary(richData(), ev(), TODAY, share({ business: "full" }), "u1").business).toBeDefined();
    expect(buildSummary(richData(), ev(), TODAY, share({ business: "none" }), "u1").business).toBeUndefined();
    const off = richData();
    off.profile = { ...off.profile, business_enabled: false };
    expect(buildSummary(off, ev(), TODAY, share({ business: "full" }), "u1").business).toBeUndefined();
  });
});

describe("partner summary: milestones", () => {
  const keys = (over: Partial<ShareSettings>, data = richData()) =>
    buildSummary(data, ev(), TODAY, share(over), "u1").achievements.map((a) => a.key).sort();

  it("shares nothing when milestones are off", () => {
    expect(keys({ ...FULL, milestones: "none" })).toEqual([]);
  });

  it("shares every category when everything is on, with only safe fields", () => {
    const s = buildSummary(richData(), ev(), TODAY, share(FULL), "u1");
    expect(s.achievements.map((a) => a.key).sort()).toEqual(ALL_MILESTONES.map((m) => m.key).sort());
    for (const a of s.achievements) expect(Object.keys(a).sort()).toEqual(["achieved_on", "category", "id", "key", "tier", "title"]);
  });

  it("weight milestones need pounds or full, since their titles are in pounds", () => {
    expect(keys({ ...FULL, weight: "percent" })).not.toContain("weight.5");
    expect(keys({ ...FULL, weight: "none" })).not.toContain("weight.5");
    expect(keys({ ...FULL, weight: "pounds" })).toContain("weight.5");
  });

  it("training off hides athletic milestones and the workout-count habit milestone", () => {
    const k = keys({ ...FULL, training: "none" });
    expect(k).not.toContain("ath.first_week");
    expect(k).not.toContain("habit.workouts_30");
    expect(k).toContain("habit.log_7");
    expect(keys({ ...FULL, training: "summary" })).toContain("habit.workouts_30");
  });

  it("business off, or the business area turned off, hides business milestones", () => {
    for (const k of [keys({ ...FULL, business: "none" }), keys(FULL, { ...richData(), profile: { ...richData().profile, business_enabled: false } })]) {
      expect(k).not.toContain("biz.revenue.1000");
      expect(k).not.toContain("habit.biz_30");
    }
    expect(keys({ ...FULL, business: "summary" })).toEqual(expect.arrayContaining(["biz.revenue.1000", "habit.biz_30"]));
  });

  it("habits off hides every habit milestone", () => {
    const k = keys({ ...FULL, habits: "none" });
    expect(k.filter((x) => x.startsWith("habit."))).toEqual([]);
    expect(k).toContain("level.2");
  });

  it("the sleep milestone follows the health setting", () => {
    expect(keys({ ...FULL, health: "none" })).not.toContain("habit.sleep_recovery");
    expect(keys({ ...FULL, health: "full" })).toContain("habit.sleep_recovery");
  });

  it("keeps the most recent 60", () => {
    const many = Array.from({ length: 70 }, (_, i) => ({ ...ms(`level.${i}`, "level"), achievedOn: `2026-0${(i % 9) + 1}-01` }));
    expect(buildSummary(richData(), ev(many), TODAY, share(), "u1").achievements).toHaveLength(60);
  });
});

describe("partner summary: journal and reviews", () => {
  it("includes only entries marked shared, newest first, trimmed", () => {
    const long = "y".repeat(2500);
    const data = richData({
      journal: [
        journal("2026-10-01", true, "older"), journal("2026-10-13", false, "JOURNAL-SECRET"), journal("2026-10-12", true, long),
        ...Array.from({ length: 10 }, (_, i) => journal(`2026-09-${String(i + 1).padStart(2, "0")}`, true, `sept ${i}`)),
      ],
    });
    const s = buildSummary(data, ev(), TODAY, share(NONE), "u1");
    expect(s.journal).toHaveLength(8);
    expect(s.journal[0].entry_date).toBe("2026-10-12");
    expect(s.journal[0].body).toHaveLength(2000);
    expect(s.journal[1].body).toBe("older");
    expect(JSON.stringify(s)).not.toContain("JOURNAL-SECRET");
    for (const j of s.journal) expect(Object.keys(j).sort()).toEqual(["body", "entry_date", "id", "kind", "title"]);
  });

  it("includes only completed reviews marked shared", () => {
    const s = buildSummary(richData(), ev(), TODAY, share(NONE), "u1");
    expect(s.reviews.map((r) => r.went_well)).toEqual(["Good week"]);
    expect(JSON.stringify(s)).not.toContain("REVIEW-SECRET");
    expect(JSON.stringify(s)).not.toContain("DRAFT-SECRET");
  });

  it("keeps at most six reviews, newest first", () => {
    const reviews = Array.from({ length: 9 }, (_, i) => review(`2026-0${i + 1}-01`, true, true, `r${i}`));
    const s = buildSummary(richData({ reviews }), ev(), TODAY, share(), "u1");
    expect(s.reviews.map((r) => r.went_well)).toEqual(["r8", "r7", "r6", "r5", "r4", "r3"]);
  });
});

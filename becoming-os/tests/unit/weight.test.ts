import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/lib/calc/milestones";
import { checkWeight } from "../../src/lib/calc/validation";
import { paceRate, trendSeries, weighIns, weightPlan, weightProgress, weightSteps } from "../../src/lib/calc/weight";
import { goals, makeData, w } from "./fixtures";

describe("weight progress", () => {
  const g = goals(267, 50, 60);

  it("derives the 207–217 lb target range from a confirmed 267 lb start", () => {
    const p = weightProgress(g, [])!;
    expect(p.goal.targetWeight).toBe(217);
    expect(p.goal.stretchWeight).toBe(207);
    expect(p.lost).toBe(0);
    expect(p.pctPrimary).toBe(0);
    expect(p.nextMilestone).toBe(5);
    expect(p.remaining).toBe(50);
  });

  it("uses the 7-day average, not the single latest reading", () => {
    const entries = [w("2026-10-10", 267), w("2026-10-11", 266), w("2026-10-12", 262)];
    const p = weightProgress(g, entries)!;
    expect(p.trend).toBe(265);
    expect(p.lost).toBe(2);
    expect(p.lostScale).toBe(5);
    expect(p.pctPrimary).toBeCloseTo(4);
    expect(p.pctStretch).toBeCloseTo(3.33, 1);
    expect(p.toNextMilestone).toBe(3);
  });

  it("drops readings older than 7 calendar days from the average", () => {
    const s = trendSeries(weighIns([w("2026-10-01", 270), w("2026-10-07", 266), w("2026-10-08", 264)]));
    expect(s[1].trend).toBe(268); // Oct 1 is inside Oct 1–7
    expect(s[2].trend).toBe(265); // Oct 1 is outside Oct 2–8
  });

  it("caps the meter at 100% while still reporting the real change", () => {
    const entries = Array.from({ length: 7 }, (_, i) => w(`2027-05-${String(10 + i).padStart(2, "0")}`, 205));
    const p = weightProgress(g, entries)!;
    expect(p.lost).toBe(62);
    expect(p.pctPrimary).toBe(100);
    expect(p.pctStretch).toBe(100);
    expect(p.pctPrimaryRaw).toBeCloseTo(124);
    expect(p.remaining).toBe(0);
  });

  it("reports a negative loss honestly when weight goes up", () => {
    const p = weightProgress(g, [w("2026-10-10", 269)])!;
    expect(p.lost).toBe(-2);
    expect(p.pctPrimary).toBe(0);
    expect(p.nextMilestone).toBe(5);
  });

  it("builds 5 lb steps up to the stretch goal, plus non-multiple goals", () => {
    expect(weightSteps(weightProgress(g, [])!.goal)).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
    expect(weightSteps(weightProgress(goals(230, 47), [])!.goal)).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 47]);
  });

  it("never plans faster than 1% of body weight or 2 lb per week", () => {
    expect(paceRate("ambitious", 267)).toBe(2);
    expect(paceRate("ambitious", 180)).toBe(1.8);
    expect(paceRate("gentle", 267)).toBeCloseTo(1.34, 2);
    const plan = weightPlan(weightProgress(goals(200, 60), [])!.goal, 200, "2026-10-10", "2027-05-24", "steady");
    expect(plan.requiredPerWeek).toBeGreaterThan(1.8);
    expect(plan.plannedPerWeek).toBe(1.5);
    expect(plan.onPaceForDeadline).toBe(false);
    expect(plan.projectedAtDeadline).toBeGreaterThan(140);
  });
});

describe("weight milestones", () => {
  it("unlocks 5 lb only when the 7-day average gets there, on the first such date", () => {
    const data = makeData({
      goals: goals(267, 50, 60),
      weights: [w("2026-10-10", 267), w("2026-10-11", 261.5)], // single reading −5.5, average −2.75
    });
    let five = evaluate(data, "2026-10-11").milestones.find((m) => m.key === "weight.5")!;
    expect(five.achievedOn).toBeNull();
    data.weights.push(w("2026-10-18", 262), w("2026-10-19", 261.6));
    five = evaluate(data, "2026-10-19").milestones.find((m) => m.key === "weight.5")!;
    expect(five.achievedOn).toBe("2026-10-18"); // window Oct 12–18 holds only 262
    expect(five.prevKey).toBeUndefined();
    expect(five.nextKey).toBe("weight.10");
  });

  it("keeps a milestone through a later gain, but relocks it if its evidence is deleted", () => {
    const data = makeData({ goals: goals(267, 50, 60), weights: [w("2026-10-20", 261), w("2026-11-05", 266)] });
    const ev = evaluate(data, "2026-11-05");
    expect(ev.milestones.find((m) => m.key === "weight.5")!.achievedOn).toBe("2026-10-20");
    data.weights = data.weights.filter((x) => x.entry_date !== "2026-10-20");
    expect(evaluate(data, "2026-11-05").milestones.find((m) => m.key === "weight.5")!.achievedOn).toBeNull();
  });

  it("marks the goal and stretch goal as major", () => {
    const ms = evaluate(makeData({ goals: goals(267, 50, 60) }), "2026-10-10").milestones;
    expect(ms.find((m) => m.key === "weight.50")!).toMatchObject({ tier: "major", title: "Goal reached: 50 lb lost" });
    expect(ms.find((m) => m.key === "weight.60")!).toMatchObject({ tier: "major", title: "Stretch goal: 60 lb lost" });
    expect(ms.find((m) => m.key === "weight.15")!.tier).toBe("minor");
  });

  it("ignores weigh-ins dated after today", () => {
    const data = makeData({ goals: goals(267, 50), weights: [w("2026-12-01", 250)] });
    expect(evaluate(data, "2026-10-15").milestones.find((m) => m.key === "weight.5")!.achievedOn).toBeNull();
  });
});

describe("suspicious weight entries", () => {
  const prior = [w("2026-10-10", 267)];
  it("accepts normal day-to-day swings", () => {
    expect(checkWeight(263.5, "2026-10-11", prior, 267).ok).toBe(true);
  });
  it("asks for confirmation on a likely typo", () => {
    const c = checkWeight(167, "2026-10-11", prior, 267);
    expect(c.ok).toBe(false);
    expect(c.reasons[0]).toMatch(/100\.0 lb below/);
  });
  it("allows more change across longer gaps", () => {
    expect(checkWeight(259, "2026-10-24", prior, 267).ok).toBe(true);
  });
  it("checks the first weigh-in against the start weight", () => {
    expect(checkWeight(226, "2026-10-10", [], 267).ok).toBe(false);
  });
});

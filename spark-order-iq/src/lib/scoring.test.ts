import { describe, expect, it } from "vitest";
import { computeEconomics, computeGoalImpact, evaluateOrder, type EvaluationInput } from "./scoring";
import { DEFAULT_SETTINGS } from "./settings";
import type { DailyProgress, Settings } from "./types";

const progress = (earned: number, goal = 150): DailyProgress => ({
  earned,
  goal,
  remaining: Math.max(goal - earned, 0),
  orders: 0,
  miles: 0,
  minutes: 0,
  hourly: null,
  percent: goal > 0 ? (earned / goal) * 100 : 0,
});

const offer = (over: Partial<EvaluationInput> = {}): EvaluationInput => ({
  payout: 38.72,
  offerMiles: 14.1,
  pickupDistanceMiles: 4.8,
  estimatedMinutes: 52,
  items: null,
  orders: 1,
  stops: 1,
  shopping: false,
  heavyItems: false,
  pickupType: "Walmart",
  ...over,
});

describe("economics", () => {
  it("adds the deadhead leg to the offer miles", () => {
    const econ = computeEconomics(offer({ payout: 34.72, offerMiles: 13.4 }), DEFAULT_SETTINGS);
    expect(econ.totalMiles).toBeCloseTo(18.2, 5);
    expect(econ.payPerMile).toBeCloseTo(1.91, 2);
  });

  it("charges vehicle cost against total miles", () => {
    const econ = computeEconomics(offer({ payout: 34.72, offerMiles: 13.4 }), DEFAULT_SETTINGS);
    expect(econ.estimatedVehicleCost).toBeCloseTo(12.74, 2);
    expect(econ.estimatedProfit).toBeCloseTo(21.98, 2);
  });

  it("counts drive-to-store time in the hourly estimate when configured", () => {
    const withPickup = computeEconomics(offer(), DEFAULT_SETTINGS);
    expect(withPickup.pickupMinutes).toBeCloseTo(12, 5);
    expect(withPickup.totalMinutes).toBeCloseTo(64, 5);
    expect(withPickup.estimatedHourly).toBeCloseTo(36.3, 1);

    const offerTimeOnly: Settings = { ...DEFAULT_SETTINGS, includePickupTimeInHourly: false };
    const without = computeEconomics(offer(), offerTimeOnly);
    expect(without.totalMinutes).toBe(52);
    expect(without.estimatedHourly).toBeCloseTo(44.68, 2);
  });

  it("leaves the hourly rate unknown when no time was supplied", () => {
    const econ = computeEconomics(offer({ estimatedMinutes: null }), DEFAULT_SETTINGS);
    expect(econ.totalMinutes).toBeNull();
    expect(econ.estimatedHourly).toBeNull();
  });
});

describe("goal impact", () => {
  it("projects earnings and what's left", () => {
    const impact = computeGoalImpact(34.72, progress(82.42));
    expect(impact.afterOrder).toBeCloseTo(117.14, 2);
    expect(impact.remainingAfter).toBeCloseTo(32.86, 2);
    expect(impact.reachesGoal).toBe(false);
  });

  it("flags the order that finishes the day", () => {
    const impact = computeGoalImpact(15, progress(137.4));
    expect(impact.reachesGoal).toBe(true);
    expect(impact.afterOrder).toBeCloseTo(152.4, 2);
    expect(impact.remainingAfter).toBe(0);
  });

  it("never reports negative remaining once the goal is met", () => {
    const impact = computeGoalImpact(20, progress(160));
    expect(impact.alreadyReached).toBe(true);
    expect(impact.remainingBefore).toBe(0);
    expect(impact.remainingAfter).toBe(0);
  });
});

describe("decisions", () => {
  it("takes the strong sample offer", () => {
    const result = evaluateOrder(offer(), DEFAULT_SETTINGS, progress(82.42));
    expect(result.decision).toBe("TAKE");
    expect(result.score).toBeGreaterThanOrEqual(78);
  });

  it("skips the long, thin sample offer", () => {
    const result = evaluateOrder(
      offer({ payout: 18.42, offerMiles: 16.8, pickupDistanceMiles: 6.1, estimatedMinutes: 55 }),
      DEFAULT_SETTINGS,
      progress(82.42),
    );
    expect(result.decision).toBe("SKIP");
    expect(result.reasons.some((r) => r.tone === "fail")).toBe(true);
  });

  it("considers the borderline sample offer, and takes it once the hourly rule is off", () => {
    const borderline = offer({
      payout: 26.5,
      offerMiles: 10.2,
      pickupDistanceMiles: 2.1,
      estimatedMinutes: 48,
      items: 28,
      shopping: true,
    });
    expect(evaluateOrder(borderline, DEFAULT_SETTINGS, progress(82.42)).decision).toBe("CONSIDER");

    const relaxed: Settings = {
      ...DEFAULT_SETTINGS,
      rules: { ...DEFAULT_SETTINGS.rules, minHourly: { enabled: false, value: 30 } },
    };
    expect(evaluateOrder(borderline, relaxed, progress(82.42)).decision).not.toBe("SKIP");
  });

  it("does not let goal pressure rescue a weak offer", () => {
    const weak = offer({ payout: 15, offerMiles: 12, pickupDistanceMiles: 5, estimatedMinutes: 45 });
    const nearGoal = evaluateOrder(weak, DEFAULT_SETTINGS, progress(137.4));
    expect(nearGoal.decision).toBe("SKIP");
    expect(nearGoal.goalImpact.reachesGoal).toBe(true);
  });

  it("ignores rules the driver switched off", () => {
    const input = offer({ payout: 22, offerMiles: 8, pickupDistanceMiles: 2, estimatedMinutes: 30 });
    expect(evaluateOrder(input, DEFAULT_SETTINGS, progress(0)).checks.find((c) => c.key === "minPayout")?.passed).toBe(
      false,
    );
    const noPayoutRule: Settings = {
      ...DEFAULT_SETTINGS,
      rules: { ...DEFAULT_SETTINGS.rules, minPayout: { enabled: false, value: 25 } },
    };
    const relaxed = evaluateOrder(input, noPayoutRule, progress(0));
    expect(relaxed.decision).not.toBe("SKIP");
  });

  it("holds back a TAKE when a rule could not be checked", () => {
    const noTime = evaluateOrder(offer({ estimatedMinutes: null }), DEFAULT_SETTINGS, progress(0));
    expect(noTime.decision).toBe("CONSIDER");
    expect(noTime.unknowns.length).toBeGreaterThan(0);
  });

  it("scores every component out of its configured weight", () => {
    const result = evaluateOrder(offer(), DEFAULT_SETTINGS, progress(82.42));
    for (const component of result.components) {
      expect(component.score).toBeGreaterThanOrEqual(0);
      expect(component.score).toBeLessThanOrEqual(component.max);
    }
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("penalises complexity without changing the payout maths", () => {
    const simple = evaluateOrder(offer(), DEFAULT_SETTINGS, progress(0));
    const complex = evaluateOrder(
      offer({ items: 62, shopping: true, heavyItems: true, stops: 3 }),
      DEFAULT_SETTINGS,
      progress(0),
    );
    const simpleComplexity = simple.components.find((c) => c.key === "complexity")!;
    const complexComplexity = complex.components.find((c) => c.key === "complexity")!;
    expect(complexComplexity.score).toBeLessThan(simpleComplexity.score);
    expect(complex.economics.payPerMile).toBeCloseTo(simple.economics.payPerMile!, 5);
  });

  it("survives a zero-mile offer without dividing by zero", () => {
    const result = evaluateOrder(
      offer({ offerMiles: 0, pickupDistanceMiles: 0 }),
      DEFAULT_SETTINGS,
      progress(0),
    );
    expect(result.economics.payPerMile).toBeNull();
    expect(Number.isFinite(result.score)).toBe(true);
  });
});

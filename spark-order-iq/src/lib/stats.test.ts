import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";
import { dailyProgress, dayTotals, hourPerformance, projectedFinish, storePerformance, summarize, weekTotal } from "./stats";
import type { OrderRecord } from "./types";

const at = (daysAgo: number, hour: number, over: Partial<OrderRecord> = {}): OrderRecord => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return {
    id: `${daysAgo}-${hour}-${Math.random()}`,
    completedAt: d.toISOString(),
    payout: 30,
    miles: 15,
    minutes: 45,
    store: "Walmart",
    storeLabel: "Walmart #1234",
    type: "Delivery",
    decision: null,
    score: null,
    notes: null,
    sample: false,
    ...over,
  };
};

describe("dailyProgress", () => {
  it("counts only today", () => {
    const progress = dailyProgress([at(0, 9), at(0, 11), at(1, 9)], DEFAULT_SETTINGS);
    expect(progress.orders).toBe(2);
    expect(progress.earned).toBe(60);
    expect(progress.remaining).toBe(90);
    expect(progress.miles).toBe(30);
  });

  it("derives hourly from logged order time", () => {
    const progress = dailyProgress([at(0, 9, { payout: 45, minutes: 90 })], DEFAULT_SETTINGS);
    expect(progress.hourly).toBeCloseTo(30, 5);
  });

  it("clamps remaining at zero past the goal", () => {
    const progress = dailyProgress([at(0, 9, { payout: 200 })], DEFAULT_SETTINGS);
    expect(progress.remaining).toBe(0);
    expect(progress.percent).toBeGreaterThan(100);
  });

  it("is empty and safe with no orders", () => {
    const progress = dailyProgress([], DEFAULT_SETTINGS);
    expect(progress.earned).toBe(0);
    expect(progress.hourly).toBeNull();
    expect(progress.percent).toBe(0);
  });
});

describe("projectedFinish", () => {
  it("returns null before there is any pace to project", () => {
    expect(projectedFinish(dailyProgress([], DEFAULT_SETTINGS), DEFAULT_SETTINGS)).toBeNull();
  });

  it("projects forward from the current pace", () => {
    const now = new Date();
    now.setHours(15, 0, 0, 0);
    const progress = dailyProgress([at(0, 12, { payout: 60, minutes: 120 })], DEFAULT_SETTINGS, now);
    const projected = projectedFinish(progress, DEFAULT_SETTINGS, now);
    // 6 hours of pace left until the 21:00 default stop, at $30/hr.
    expect(projected).toBeCloseTo(60 + 30 * 6, 5);
  });

  it("never carries a pace past a typical day's work", () => {
    const now = new Date();
    now.setHours(3, 0, 0, 0);
    // 18 hours until the 21:00 stop, but only 6 hours of an 8-hour day left.
    const progress = dailyProgress([at(0, 1, { payout: 60, minutes: 120 })], DEFAULT_SETTINGS, now);
    expect(projectedFinish(progress, DEFAULT_SETTINGS, now)).toBeCloseTo(60 + 30 * 6, 5);
  });

  it("stops projecting once the typical day is spent", () => {
    const now = new Date();
    now.setHours(15, 0, 0, 0);
    const progress = dailyProgress([at(0, 7, { payout: 300, minutes: 8 * 60 })], DEFAULT_SETTINGS, now);
    expect(projectedFinish(progress, DEFAULT_SETTINGS, now)).toBeCloseTo(300, 5);
  });
});

describe("summaries", () => {
  it("averages only over orders that carry the data", () => {
    const summary = summarize([at(0, 9, { payout: 20, miles: 10, minutes: 30 }), at(0, 10, { payout: 40, miles: null, minutes: null })]);
    expect(summary.count).toBe(2);
    expect(summary.earnings).toBe(60);
    expect(summary.avgPayout).toBe(30);
    expect(summary.perMile).toBe(2);
    expect(summary.hourly).toBe(40);
  });

  it("groups stores and sorts by earnings", () => {
    const stores = storePerformance([
      at(0, 9, { storeLabel: "Walmart #1234", payout: 20 }),
      at(0, 10, { storeLabel: "Walmart #1234", payout: 30 }),
      at(0, 11, { storeLabel: "Sam's Club #6412", payout: 40, store: "Sam's Club" }),
    ]);
    expect(stores[0]?.label).toBe("Walmart #1234");
    expect(stores[0]?.count).toBe(2);
    expect(stores[1]?.earnings).toBe(40);
  });

  it("buckets orders by hour of day", () => {
    const hours = hourPerformance([at(0, 9), at(0, 9), at(0, 17)]);
    expect(hours.find((h) => h.hour === 9)?.count).toBe(2);
    expect(hours.find((h) => h.hour === 17)?.count).toBe(1);
  });
});

describe("goal history", () => {
  it("returns one row per day, newest first", () => {
    const totals = dayTotals([at(0, 9, { payout: 100 }), at(2, 9, { payout: 50 })], DEFAULT_SETTINGS, 3);
    expect(totals).toHaveLength(3);
    expect(totals[0]?.earnings).toBe(100);
    expect(totals[1]?.earnings).toBe(0);
    expect(totals[2]?.earnings).toBe(50);
  });

  it("totals the rolling week", () => {
    expect(weekTotal([at(0, 9, { payout: 100 }), at(6, 9, { payout: 50 }), at(9, 9, { payout: 999 })], DEFAULT_SETTINGS)).toBe(150);
  });
});

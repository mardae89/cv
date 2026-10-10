import { describe, expect, it } from "vitest";
import { checkAudience, platformSeries, readingOn, summarize } from "../../src/lib/calc/audience";
import { evaluate } from "../../src/lib/calc/milestones";
import { buildDemo } from "../../src/lib/demo";
import type { AudienceEntry, AudiencePlatform } from "../../src/lib/types";
import { id, makeData } from "./fixtures";

const r = (platform: AudiencePlatform, recorded_on: string, count: number): AudienceEntry =>
  ({ id: id(), user_id: "u1", platform, recorded_on, count, note: null });

describe("audience readings", () => {
  const entries = [
    r("instagram", "2026-10-20", 1200), r("instagram", "2026-10-10", 1000), r("instagram", "2026-11-15", 1500),
    r("youtube", "2026-11-01", 300),
  ];

  it("orders each platform's readings by date", () => {
    expect(platformSeries(entries, "instagram").map((x) => x.count)).toEqual([1000, 1200, 1500]);
    expect(platformSeries(entries, "skool")).toEqual([]);
  });

  it("finds the latest reading on or before a date", () => {
    const s = platformSeries(entries, "instagram");
    expect(readingOn(s, "2026-10-25")?.count).toBe(1200);
    expect(readingOn(s, "2026-10-09")).toBeNull();
  });

  it("summarises current totals and growth, skipping untracked platforms", () => {
    const sums = summarize(entries, "2026-11-20");
    expect(sums.map((x) => x.platform.key)).toEqual(["instagram", "youtube"]);
    const ig = sums[0];
    expect(ig.current.count).toBe(1500);
    expect(ig.change30).toBe(300); // vs the Oct 20 reading, the latest one 30+ days back
    expect(ig.sinceStart).toBe(500);
    expect(sums[1].change30).toBeNull(); // a single reading has nothing to compare with
  });

  it("ignores readings dated after today", () => {
    expect(summarize([r("skool", "2026-12-01", 50)], "2026-11-20")).toEqual([]);
  });

  it("asks to double-check implausible jumps but not normal growth", () => {
    expect(checkAudience(1300, "2026-10-25", "instagram", entries).ok).toBe(true);
    expect(checkAudience(12000, "2026-10-25", "instagram", entries).ok).toBe(false); // extra zero
    expect(checkAudience(120, "2026-10-25", "instagram", entries).ok).toBe(false); // dropped a digit
    expect(checkAudience(5, "2026-11-02", "youtube", [r("youtube", "2026-11-01", 3)]).ok).toBe(true); // tiny counts swing
  });
});

describe("audience milestones", () => {
  it("counts only totals crossed after the first reading", () => {
    const data = makeData({ audience: [r("instagram", "2026-10-10", 1200), r("instagram", "2026-11-01", 2600)] });
    const ms = evaluate(data, "2026-11-20").milestones.filter((m) => m.category === "audience");
    expect(ms.find((m) => m.key === "audience.instagram.1000")).toBeUndefined(); // already had it
    expect(ms.find((m) => m.key === "audience.instagram.2500")?.achievedOn).toBe("2026-11-01");
    // the next two remain locked with progress
    const locked = ms.filter((m) => !m.achievedOn).map((m) => m.key);
    expect(locked).toEqual(["audience.instagram.5000", "audience.instagram.10000"]);
  });

  it("relocks when the reading that earned it is corrected", () => {
    const a = r("youtube", "2026-10-10", 80), b = r("youtube", "2026-10-30", 120);
    expect(evaluate(makeData({ audience: [a, b] }), "2026-11-01").unlocked.some((m) => m.key === "audience.youtube.100")).toBe(true);
    expect(evaluate(makeData({ audience: [a, { ...b, count: 95 }] }), "2026-11-01").unlocked.some((m) => m.key === "audience.youtube.100")).toBe(false);
  });

  it("sample data includes audience readings for all three platforms", () => {
    const rows = buildDemo("u1").find((t) => t.table === "audience")!.rows;
    expect(new Set(rows.map((x) => x.platform))).toEqual(new Set(["instagram", "youtube", "skool"]));
  });
});

import { describe, expect, it } from "vitest";
import { dayResult, indexPower, standardPowerList } from "../../src/lib/calc/power";
import { conversions, reachedOn, trafficWeek, trafficWeeks } from "../../src/lib/calc/traffic";
import type { PowerItem, TrafficEntry } from "../../src/lib/types";
import { id, makeData } from "./fixtures";

const e = (log_date: string, channel: TrafficEntry["channel"], reached: number, conversations: number, invitations: number, members: number): TrafficEntry =>
  ({ id: id(), user_id: "u1", log_date, channel, reached, conversations, invitations, members, note: null });

describe("traffic engine", () => {
  // Week of Mon Oct 12 2026.
  const entries = [
    e("2026-10-12", "social_outbound", 10, 4, 2, 1),
    e("2026-10-13", "social_outbound", 8, 2, 1, 0),
    e("2026-10-13", "existing_world", 5, 3, 1, 1),
    e("2026-10-19", "social_outbound", 12, 3, 1, 0), // next week
  ];

  it("totals the four numbers for the week", () => {
    const w = trafficWeek(entries, "2026-10-15");
    expect(w.from).toBe("2026-10-12");
    expect(w.totals).toEqual({ reached: 23, conversations: 9, invitations: 4, members: 2 });
  });

  it("splits by channel", () => {
    const w = trafficWeek(entries, "2026-10-15");
    expect(w.byChannel.map((c) => [c.channel.key, c.totals.reached])).toEqual([["existing_world", 5], ["social_outbound", 18]]);
  });

  it("computes each conversion step", () => {
    const c = conversions({ reached: 20, conversations: 5, invitations: 2, members: 1 });
    expect(c.map((x) => x.pct)).toEqual([25, 40, 50]);
    expect(conversions({ reached: 0, conversations: 0, invitations: 0, members: 0 }).every((x) => x.pct === null)).toBe(true);
  });

  it("lists weeks and counts today's reach", () => {
    expect(trafficWeeks(entries, "2026-10-20").map((w) => w.from)).toEqual(["2026-10-12", "2026-10-19"]);
    expect(reachedOn(entries, "2026-10-13")).toBe(13);
  });

  it("can drive a Power List item (reach 10 new people)", () => {
    const item = { ...standardPowerList("2026-10-12")[0], id: id(), user_id: "u1", name: "Reach 10 new people", kind: "count", target: 10, auto: "reached" } as PowerItem;
    const idx = indexPower({ ...makeData(), traffic: entries });
    expect(dayResult([item], "2026-10-12", idx).items[0].done).toBe(true);
    expect(dayResult([item], "2026-10-14", idx).items[0].done).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { addMonths, countdown, dateRange, diffDays, dow, monthEnd, todayIn, weekStart } from "../../src/lib/dates";

describe("mission countdown", () => {
  it("spans 226 days and 227 calendar dates", () => {
    const c = countdown("2026-10-10");
    expect(c.spanDays).toBe(226);
    expect(c.calendarDays).toBe(227);
  });

  it("is day 1 of 227 with 226 days remaining on Oct 10, 2026", () => {
    const c = countdown("2026-10-10");
    expect(c.status).toBe("active");
    expect(c.dayNumber).toBe(1);
    expect(c.elapsed).toBe(0);
    expect(c.remaining).toBe(226);
    expect(c.pct).toBe(0);
  });

  it("is day 227 with nothing remaining on May 24, 2027", () => {
    const c = countdown("2027-05-24");
    expect(c.dayNumber).toBe(227);
    expect(c.remaining).toBe(0);
    expect(c.pct).toBe(100);
  });

  it("handles before and after the mission", () => {
    expect(countdown("2026-10-01")).toMatchObject({ status: "before", daysUntilStart: 9, elapsed: 0, dayNumber: null });
    expect(countdown("2027-06-01")).toMatchObject({ status: "complete", remaining: 0, elapsed: 226, pct: 100 });
  });

  it("crosses the DST change and the year boundary correctly", () => {
    expect(diffDays("2026-10-10", "2026-11-02")).toBe(23); // DST ends Nov 1
    expect(diffDays("2026-12-31", "2027-01-01")).toBe(1);
    expect(countdown("2027-01-01").elapsed).toBe(83);
  });
});

describe("calendar helpers", () => {
  it("weeks start on Monday", () => {
    expect(dow("2026-10-10")).toBe(6); // Saturday
    expect(weekStart("2026-10-10")).toBe("2026-10-05");
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
    expect(weekStart("2026-10-11")).toBe("2026-10-05");
  });

  it("does month math", () => {
    expect(monthEnd("2027-02-10")).toBe("2027-02-28");
    expect(addMonths("2026-11-01", 3)).toBe("2027-02-01");
    expect(dateRange("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("finds today in a time zone", () => {
    const instant = new Date("2026-10-11T03:30:00Z"); // still Oct 10 in New York
    expect(todayIn("America/New_York", instant)).toBe("2026-10-10");
    expect(todayIn("Europe/London", instant)).toBe("2026-10-11");
  });
});

// Calendar-date arithmetic on 'YYYY-MM-DD' strings. Everything is done in UTC
// milliseconds so daylight-saving transitions can never shift a day.
import type { ISODate } from "./types";

export const MISSION_START: ISODate = "2026-10-10";
export const MISSION_END: ISODate = "2027-05-24";

const DAY = 86_400_000;

export function toUTC(d: ISODate): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

export function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromUTC(toUTC(s)) === s;
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUTC(toUTC(d) + n * DAY);
}

/** Whole days from a to b (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY);
}

/** 0 = Sunday … 6 = Saturday. */
export function dow(d: ISODate): number {
  return new Date(toUTC(d)).getUTCDay();
}

/** Monday of the week containing d. */
export function weekStart(d: ISODate): ISODate {
  return addDays(d, -((dow(d) + 6) % 7));
}

export function weekEnd(d: ISODate): ISODate {
  return addDays(weekStart(d), 6);
}

export function monthStart(d: ISODate): ISODate {
  return d.slice(0, 8) + "01";
}

export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}

export function addMonths(d: ISODate, n: number): ISODate {
  const [y, m] = d.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}-01`;
}

export function monthEnd(d: ISODate): ISODate {
  return addDays(addMonths(monthStart(d), 1), -1);
}

export function daysInMonth(d: ISODate): number {
  return diffDays(monthStart(d), monthEnd(d)) + 1;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

/** Inclusive list of dates from a to b. */
export function dateRange(a: ISODate, b: ISODate): ISODate[] {
  const out: ISODate[] = [];
  if (a > b) return out;
  for (let t = toUTC(a), end = toUTC(b); t <= end; t += DAY) out.push(fromUTC(t));
  return out;
}

/** Month starts from the month of a through the month of b. */
export function monthRange(a: ISODate, b: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let m = monthStart(a); m <= b; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** Today's calendar date in an IANA time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): ISODate {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  }
}

/** Current hour (0–23) in a time zone. */
export function hourIn(timeZone: string, now: Date = new Date()): number {
  try {
    return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
  } catch {
    return now.getHours();
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function fmtDate(d: ISODate | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return `${MONTHS[m - 1]} ${day}, ${y}`;
}

export function fmtShort(d: ISODate | null | undefined): string {
  if (!d) return "—";
  const [, m, day] = d.split("-").map(Number);
  return `${MONTHS[m - 1]} ${day}`;
}

export function fmtMonth(d: ISODate, long = true): string {
  const [y, m] = d.split("-").map(Number);
  return long ? `${MONTHS_LONG[m - 1]} ${y}` : `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

export function fmtWeekday(d: ISODate, long = false): string {
  return (long ? DAYS_LONG : DAYS)[dow(d)];
}

export function fmtLongDate(d: ISODate): string {
  return `${fmtWeekday(d, true)}, ${MONTHS_LONG[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}`;
}

export function fmtWeekRange(start: ISODate): string {
  const end = addDays(start, 6);
  return start.slice(5, 7) === end.slice(5, 7)
    ? `${fmtShort(start)}–${Number(end.slice(8, 10))}, ${end.slice(0, 4)}`
    : `${fmtShort(start)} – ${fmtShort(end)}, ${end.slice(0, 4)}`;
}

export const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
export const DAY_NAMES = DAYS;

/** "every day", "weekdays", "Mon–Thu", or "Mon, Wed, Fri" for a set of weekdays (0 = Sunday). */
export function fmtDays(days: number[]): string {
  const set = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort();
  if (!set.length) return "no days";
  if (set.length === 7) return "every day";
  if (set.join() === "1,2,3,4,5") return "weekdays";
  if (set.join() === "0,6") return "weekends";
  const run = set.every((d, i) => i === 0 || d === set[i - 1] + 1);
  return run && set.length > 2 ? `${DAYS[set[0]]}–${DAYS[set[set.length - 1]]}` : set.map((d) => DAYS[d]).join(", ");
}

export interface Countdown {
  start: ISODate;
  end: ISODate;
  /** 226: days between the start and end dates. */
  spanDays: number;
  /** 227: calendar dates from start to end, both included. */
  calendarDays: number;
  status: "before" | "active" | "complete";
  /** Day N of 227 while active; null otherwise. */
  dayNumber: number | null;
  elapsed: number;
  remaining: number;
  daysUntilStart: number;
  pct: number;
}

export function countdown(today: ISODate, start = MISSION_START, end = MISSION_END): Countdown {
  const spanDays = diffDays(start, end);
  const status = today < start ? "before" : today > end ? "complete" : "active";
  const elapsed = Math.min(spanDays, Math.max(0, diffDays(start, today)));
  const remaining = Math.max(0, diffDays(today, end));
  return {
    start,
    end,
    spanDays,
    calendarDays: spanDays + 1,
    status,
    dayNumber: status === "active" ? diffDays(start, today) + 1 : null,
    elapsed,
    remaining,
    daysUntilStart: Math.max(0, diffDays(today, start)),
    pct: (elapsed / spanDays) * 100,
  };
}

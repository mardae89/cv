// Audience counts (Instagram followers, YouTube subscribers, Skool members).
// Each record is a reading of the total on one day, so growth is the
// difference between readings — never a sum of them.
import { addDays, diffDays } from "../dates";
import { num } from "../format";
import type { AudienceEntry, AudiencePlatform, ISODate } from "../types";
import type { Check } from "./validation";

export interface PlatformInfo {
  key: AudiencePlatform;
  name: string;
  /** What the count is called on that platform. */
  unit: string;
  unitOne: string;
}

export const PLATFORMS: PlatformInfo[] = [
  { key: "instagram", name: "Instagram", unit: "followers", unitOne: "follower" },
  { key: "youtube", name: "YouTube", unit: "subscribers", unitOne: "subscriber" },
  { key: "skool", name: "Skool", unit: "members", unitOne: "member" },
];

export const platformInfo = (p: AudiencePlatform) => PLATFORMS.find((x) => x.key === p)!;

export interface Reading {
  date: ISODate;
  count: number;
}

/** Every reading for one platform, oldest first. */
export function platformSeries(entries: AudienceEntry[], platform: AudiencePlatform): Reading[] {
  return entries
    .filter((e) => e.platform === platform)
    .map((e) => ({ date: e.recorded_on, count: num(e.count) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The latest reading on or before `date`. */
export function readingOn(series: Reading[], date: ISODate): Reading | null {
  let out: Reading | null = null;
  for (const r of series) {
    if (r.date > date) break;
    out = r;
  }
  return out;
}

export interface AudienceSummary {
  platform: PlatformInfo;
  current: Reading;
  first: Reading;
  /** Change since the reading 30 days ago (or the closest earlier one); null without one. */
  change30: number | null;
  /** Change since the first reading. */
  sinceStart: number;
  readings: number;
}

/** Where each tracked platform stands today. Platforms with no readings are left out. */
export function summarize(entries: AudienceEntry[], today: ISODate): AudienceSummary[] {
  const out: AudienceSummary[] = [];
  for (const p of PLATFORMS) {
    const s = platformSeries(entries, p.key).filter((r) => r.date <= today);
    if (!s.length) continue;
    const current = s[s.length - 1];
    const before = readingOn(s, addDays(today, -30));
    out.push({
      platform: p,
      current,
      first: s[0],
      change30: before && before.date !== current.date ? current.count - before.count : null,
      sinceStart: current.count - s[0].count,
      readings: s.length,
    });
  }
  return out;
}

export const fmtCount = (n: number) => Math.round(n).toLocaleString("en-US");

export const fmtChange = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${fmtCount(Math.abs(n))}`;

/** Totals worth celebrating once a platform's count first reaches them. */
export const AUDIENCE_STEPS = [100, 250, 500, 1000, 2500, 5000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];

/** Big jumps between readings are usually typos (an extra zero, the wrong platform). */
export function checkAudience(
  count: number, date: ISODate, platform: AudiencePlatform, entries: AudienceEntry[], editingId?: string,
): Check {
  const s = platformSeries(entries.filter((e) => e.id !== editingId), platform).filter((r) => r.date !== date);
  const prev = [...s].reverse().find((r) => r.date < date);
  const next = s.find((r) => r.date > date);
  const info = platformInfo(platform);
  const reasons: string[] = [];
  const odd = (other: number) => other >= 50 && (count < other * 0.75 || count > other * 3);
  if (prev && odd(prev.count)) {
    reasons.push(`${fmtCount(count)} ${info.unit} is a big jump from ${fmtCount(prev.count)} ${diffDays(prev.date, date)} day(s) earlier.`);
  }
  if (next && odd(next.count)) {
    reasons.push(`${fmtCount(count)} ${info.unit} is a big jump from ${fmtCount(next.count)} ${diffDays(date, next.date)} day(s) later.`);
  }
  return { ok: reasons.length === 0, reasons };
}

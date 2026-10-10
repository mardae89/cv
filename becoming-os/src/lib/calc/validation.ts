// Plausibility checks. These never block a save outright; they ask the user to
// confirm values that look like typos, so a mistyped number can't silently
// unlock a milestone or distort a trend.
import { diffDays } from "../dates";
import { money, num } from "../format";
import type { ISODate, Transaction, WeightEntry } from "../types";

export interface Check {
  ok: boolean;
  reasons: string[];
}

const pass: Check = { ok: true, reasons: [] };

/** Day-to-day weight change beyond normal water swings (~5 lb, +0.5 lb per extra day). */
export function checkWeight(
  weight: number, date: ISODate, existing: WeightEntry[], startWeight: number | null, editingId?: string,
): Check {
  const others = existing
    .filter((e) => e.weight !== null && e.id !== editingId)
    .map((e) => ({ date: e.entry_date, weight: num(e.weight) }));
  const prev = others.filter((e) => e.date < date).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const next = others.filter((e) => e.date > date).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  const reasons: string[] = [];
  const allowed = (gap: number) => Math.max(5, weight * 0.02) + 0.5 * Math.max(0, gap - 1);
  if (prev) {
    const gap = diffDays(prev.date, date);
    const delta = weight - prev.weight;
    if (Math.abs(delta) > allowed(gap)) {
      reasons.push(`${Math.abs(delta).toFixed(1)} lb ${delta < 0 ? "below" : "above"} your weigh-in ${gap} day${gap === 1 ? "" : "s"} earlier (${prev.weight} lb).`);
    }
  }
  if (next) {
    const gap = diffDays(date, next.date);
    const delta = weight - next.weight;
    if (Math.abs(delta) > allowed(gap)) {
      reasons.push(`${Math.abs(delta).toFixed(1)} lb ${delta < 0 ? "below" : "above"} your weigh-in ${gap} day${gap === 1 ? "" : "s"} later (${next.weight} lb).`);
    }
  }
  if (!prev && !next && startWeight && Math.abs(weight - startWeight) > Math.max(10, startWeight * 0.06)) {
    reasons.push(`${Math.abs(weight - startWeight).toFixed(1)} lb from your starting weight of ${startWeight} lb.`);
  }
  return reasons.length ? { ok: false, reasons } : pass;
}

export function checkTransaction(amount: number, kind: Transaction["kind"], businessId: string | null, history: Transaction[], editingId?: string): Check {
  const reasons: string[] = [];
  if (amount >= 25000) reasons.push(`${money(amount)} is a large single entry.`);
  const same = history.filter((t) => t.kind === kind && t.business_id === businessId && t.id !== editingId);
  const largest = same.reduce((m, t) => Math.max(m, num(t.amount)), 0);
  if (largest > 0 && amount > largest * 5 && amount >= 2000) {
    reasons.push(`It's more than 5× your largest previous ${kind === "sale" ? "sale" : "entry"} here (${money(largest)}).`);
  }
  return reasons.length ? { ok: false, reasons } : pass;
}

export function checkWorkout(activity: string, distance: number | null, duration: number | null): Check {
  const reasons: string[] = [];
  const running = activity === "run" || activity === "run_walk";
  if (running && distance && duration && distance >= 1 && duration / distance < 5) {
    reasons.push(`That's a pace faster than 5:00 per mile.`);
  }
  if (running && distance && distance > 20) reasons.push(`${distance} miles is longer than a marathon-training long run.`);
  if (duration && duration > 300) reasons.push(`${Math.round(duration)} minutes is over five hours.`);
  if (activity === "walk" && distance && duration && duration / distance < 10) reasons.push("That walking pace is faster than 10:00 per mile.");
  return reasons.length ? { ok: false, reasons } : pass;
}

export function checkDate(date: ISODate, today: ISODate): Check {
  if (date > today) return { ok: false, reasons: ["This date is in the future."] };
  return pass;
}

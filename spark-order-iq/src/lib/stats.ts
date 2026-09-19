import { dayKey } from "./format";
import type { DailyProgress, OrderRecord, OrderType, PickupType, Settings } from "./types";

/** Aggregations over logged orders. All of it is the driver's own data. */

export type RangeKey = "today" | "7d" | "30d" | "all";

export function ordersForDay(orders: OrderRecord[], day: string): OrderRecord[] {
  return orders.filter((o) => dayKey(o.completedAt) === day);
}

export function ordersInRange(orders: OrderRecord[], range: RangeKey, now = new Date()): OrderRecord[] {
  if (range === "all") return orders;
  if (range === "today") return ordersForDay(orders, dayKey(now.toISOString()));
  const days = range === "7d" ? 7 : 30;
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  return orders.filter((o) => new Date(o.completedAt) >= cutoff);
}

/**
 * Worked time for a set of orders. Logged order minutes are used when present;
 * otherwise we fall back to the wall-clock span between the first and last
 * order, which is the closest honest stand-in.
 */
export function workedMinutes(orders: OrderRecord[], now = new Date()): number {
  const logged = orders.reduce((a, o) => a + (o.minutes ?? 0), 0);
  if (logged > 0) return logged;
  if (orders.length === 0) return 0;
  const times = orders.map((o) => new Date(o.completedAt).getTime());
  const span = (now.getTime() - Math.min(...times)) / 60_000;
  return span > 0 ? span : 0;
}

export function dailyProgress(orders: OrderRecord[], settings: Settings, now = new Date()): DailyProgress {
  const today = ordersForDay(orders, dayKey(now.toISOString()));
  const earned = today.reduce((a, o) => a + o.payout, 0);
  const miles = today.reduce((a, o) => a + (o.miles ?? 0), 0);
  const mins = workedMinutes(today, now);
  const goal = settings.dailyGoal;
  return {
    earned,
    goal,
    remaining: Math.max(goal - earned, 0),
    orders: today.length,
    miles,
    minutes: mins,
    hourly: mins > 0 ? earned / (mins / 60) : null,
    percent: goal > 0 ? Math.min((earned / goal) * 100, 999) : 0,
  };
}

/**
 * Where the day lands if the rest of it goes like the part already worked.
 *
 * Two brakes keep this from turning into a fantasy: the clock (nothing is
 * projected past the hour the driver usually stops) and the shift length
 * (a pace is only carried out to a typical full day, not indefinitely).
 * Returns null before there's enough data.
 */
export function projectedFinish(progress: DailyProgress, settings: Settings, now = new Date()): number | null {
  if (progress.orders === 0 || progress.hourly === null) return null;
  const end = new Date(now);
  end.setHours(settings.dayEndHour, 0, 0, 0);
  const hoursUntilStop = (end.getTime() - now.getTime()) / 3_600_000;
  const hoursOfShiftLeft = Math.max(settings.typicalShiftHours - progress.minutes / 60, 0);
  const hoursLeft = Math.max(Math.min(hoursUntilStop, hoursOfShiftLeft), 0);
  return progress.earned + progress.hourly * hoursLeft;
}

export interface Summary {
  count: number;
  earnings: number;
  miles: number;
  minutes: number;
  avgPayout: number | null;
  avgMiles: number | null;
  avgMinutes: number | null;
  perMile: number | null;
  hourly: number | null;
}

export function summarize(orders: OrderRecord[]): Summary {
  const count = orders.length;
  const earnings = orders.reduce((a, o) => a + o.payout, 0);
  const withMiles = orders.filter((o) => o.miles !== null && o.miles > 0);
  const miles = withMiles.reduce((a, o) => a + (o.miles ?? 0), 0);
  const withTime = orders.filter((o) => o.minutes !== null && o.minutes > 0);
  const minutes = withTime.reduce((a, o) => a + (o.minutes ?? 0), 0);
  const milesEarnings = withMiles.reduce((a, o) => a + o.payout, 0);
  const timeEarnings = withTime.reduce((a, o) => a + o.payout, 0);
  return {
    count,
    earnings,
    miles,
    minutes,
    avgPayout: count ? earnings / count : null,
    avgMiles: withMiles.length ? miles / withMiles.length : null,
    avgMinutes: withTime.length ? minutes / withTime.length : null,
    perMile: miles > 0 ? milesEarnings / miles : null,
    hourly: minutes > 0 ? timeEarnings / (minutes / 60) : null,
  };
}

export interface StoreStats extends Summary {
  key: string;
  label: string;
  store: PickupType;
}

export function storePerformance(orders: OrderRecord[]): StoreStats[] {
  const groups = new Map<string, OrderRecord[]>();
  for (const o of orders) {
    const key = o.storeLabel?.trim() || o.store;
    const list = groups.get(key);
    if (list) list.push(o);
    else groups.set(key, [o]);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({
      key,
      label: key,
      store: list[0]!.store,
      ...summarize(list),
    }))
    .sort((a, b) => b.earnings - a.earnings);
}

export interface TypeStats extends Summary {
  type: OrderType;
}

export function typePerformance(orders: OrderRecord[]): TypeStats[] {
  const types: OrderType[] = ["Delivery", "Shopping"];
  return types
    .map((type) => ({ type, ...summarize(orders.filter((o) => o.type === type)) }))
    .filter((t) => t.count > 0);
}

export interface HourStats {
  hour: number;
  count: number;
  earnings: number;
  hourly: number | null;
}

export function hourPerformance(orders: OrderRecord[]): HourStats[] {
  const buckets = new Map<number, OrderRecord[]>();
  for (const o of orders) {
    const h = new Date(o.completedAt).getHours();
    const list = buckets.get(h);
    if (list) list.push(o);
    else buckets.set(h, [o]);
  }
  return [...buckets.entries()]
    .map(([hour, list]) => {
      const s = summarize(list);
      return { hour, count: s.count, earnings: s.earnings, hourly: s.hourly };
    })
    .sort((a, b) => a.hour - b.hour);
}

export interface DayTotal {
  day: string;
  iso: string;
  earnings: number;
  orders: number;
  miles: number;
  goal: number;
}

/** Earnings per day for the last `days` days, most recent first. */
export function dayTotals(orders: OrderRecord[], settings: Settings, days: number, now = new Date()): DayTotal[] {
  const out: DayTotal[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = dayKey(d.toISOString());
    const list = ordersForDay(orders, key);
    out.push({
      day: key,
      iso: d.toISOString(),
      earnings: list.reduce((a, o) => a + o.payout, 0),
      orders: list.length,
      miles: list.reduce((a, o) => a + (o.miles ?? 0), 0),
      goal: settings.dailyGoal,
    });
  }
  return out;
}

/** Rolling 7-day window ending today, for the weekly goal card. */
export function weekTotal(orders: OrderRecord[], settings: Settings, now = new Date()): number {
  return dayTotals(orders, settings, 7, now).reduce((a, d) => a + d.earnings, 0);
}

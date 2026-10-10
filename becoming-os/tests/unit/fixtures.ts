import type { Habit, Transaction, UserData, WeightEntry, Workout } from "../../src/lib/types";

let n = 0;
export const id = () => `id-${++n}`;

export function makeData(over: Partial<UserData> = {}): UserData {
  return {
    profile: {
      id: "u1", display_name: "Test", timezone: "America/New_York", plan_preset: "primary",
      business_enabled: true, onboarding_done: true, demo_mode: false, demo_today: null, created_at: "2026-10-10T00:00:00Z",
    },
    goals: null, athletic: null, businessSettings: null,
    weights: [], checkins: [], symptoms: [], nutrition: [], photos: [], workouts: [], sets: [],
    habits: [], completions: [], restDays: [], tasks: [], journal: [], reviews: [], roadmapNotes: [],
    businesses: [], offers: [], customers: [], transactions: [], payments: [], deals: [], metrics: [],
    activityLogs: [], achievements: [], audience: [],
    ...over,
  };
}

export const goals = (start: number, target: number, stretch: number | null = null) => ({
  user_id: "u1", start_weight: start, start_date: "2026-10-10", target_loss: target, stretch_loss: stretch,
  start_waist: null, pace: "steady" as const, activity_level: null, health_notes: null, preferred_activities: [],
  weekly_training_minutes: null,
});

export const w = (date: string, weight: number): WeightEntry => ({
  id: id(), user_id: "u1", entry_date: date, weight, waist_in: null, note: null, flagged: false,
});

export const sale = (date: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: id(), user_id: "u1", business_id: "b1", kind: "sale", txn_date: date, amount, description: null,
  customer_id: null, offer_id: null, recurring: false, lead_source: null, expense_category: null, notes: null,
  ...extra,
});

export const txn = (kind: Transaction["kind"], date: string, amount: number, extra: Partial<Transaction> = {}): Transaction =>
  sale(date, amount, { kind, business_id: kind === "sale" || kind === "refund" || kind === "expense" ? "b1" : null, ...extra });

export const workout = (date: string, activity: Workout["activity"], extra: Partial<Workout> = {}): Workout => ({
  id: id(), user_id: "u1", workout_date: date, activity, title: null, duration_min: 30, distance_mi: null,
  avg_hr: null, rpe: null, intensity: null, pain_level: null, is_race: false, notes: null, recovery_notes: null,
  ...extra,
});

export const habit = (name: string, days: number[], extra: Partial<Habit> = {}): Habit => ({
  id: id(), user_id: "u1", name, category: "other", schedule_days: days, skip_on_rest_days: false, xp: 10,
  start_date: "2026-10-10", archived_on: null, sort_order: 0, ...extra,
});

// The table definitions the storage engine enforces: defaults, uniqueness,
// parent links (with their delete behaviour) and the value rules that used to
// live in the database. Keeping them here means the same rules apply whether
// records are saved on this device or synced through the shared page.
import type { ISODate } from "@/lib/types";

export const LIST_KEYS = [
  "weights", "checkins", "symptoms", "nutrition", "photos", "workouts", "sets", "habits", "completions",
  "restDays", "tasks", "journal", "reviews", "roadmapNotes", "businesses", "offers", "customers",
  "transactions", "payments", "deals", "metrics", "activityLogs", "achievements", "notifications",
] as const;
export type ListKey = (typeof LIST_KEYS)[number];

export const SINGLE_KEYS = ["goals", "athletic", "businessSettings", "shareSettings", "reminderSettings"] as const;
export type SingleKey = (typeof SINGLE_KEYS)[number];

export type Row = Record<string, unknown> & { id: string };

interface Parent {
  field: string;
  table: ListKey;
  /** What happens to this row when the parent is deleted. */
  onDelete: "cascade" | "set-null";
  /** The parent must exist when the field is set. */
  required?: boolean;
}

export interface TableDef {
  /** Field whose month (YYYY-MM) groups rows into storage chunks. */
  bucketBy?: string;
  /** Sets of fields that must be unique together; upserts match on these. */
  unique?: string[][];
  parents?: Parent[];
  defaults?: Record<string, unknown>;
  /** Oldest rows beyond this count are dropped on insert. */
  cap?: number;
}

export const TABLES: Record<ListKey, TableDef> = {
  weights: { bucketBy: "entry_date", unique: [["entry_date"]], defaults: { waist_in: null, note: null, flagged: false, weight: null } },
  checkins: {
    bucketBy: "checkin_date", unique: [["checkin_date"]],
    defaults: { sleep_hours: null, sleep_quality: null, energy: null, soreness: null, fatigue: null, water_oz: null, note: null },
  },
  symptoms: { bucketBy: "log_date", defaults: { body_area: "Ankle", side: null, pain_type: null, during: null, note: null } },
  nutrition: { bucketBy: "log_date", defaults: { description: null, calories: null, protein_g: null, carbs_g: null, fat_g: null, note: null } },
  photos: { bucketBy: "taken_on", defaults: { pose: null, caption: null } },
  workouts: {
    bucketBy: "workout_date",
    defaults: {
      title: null, duration_min: null, distance_mi: null, avg_hr: null, rpe: null, intensity: null, pain_level: null,
      is_race: false, notes: null, recovery_notes: null,
    },
  },
  sets: {
    bucketBy: "created_at",
    parents: [{ field: "workout_id", table: "workouts", onDelete: "cascade", required: true }],
    defaults: { set_no: 1, reps: null, weight_lb: null },
  },
  habits: { defaults: { category: "other", schedule_days: [0, 1, 2, 3, 4, 5, 6], skip_on_rest_days: false, xp: 10, archived_on: null, sort_order: 0 } },
  completions: {
    bucketBy: "completed_on", unique: [["habit_id", "completed_on"]],
    parents: [{ field: "habit_id", table: "habits", onDelete: "cascade", required: true }],
    defaults: { note: null },
  },
  restDays: { bucketBy: "rest_date", unique: [["rest_date"]], defaults: { note: null } },
  tasks: { bucketBy: "due_date", defaults: { completed_on: null, category: "other" } },
  journal: { bucketBy: "entry_date", defaults: { kind: "journal", title: null, minutes: null, shared: false } },
  reviews: {
    bucketBy: "period_start", unique: [["period", "period_start"]],
    defaults: { went_well: null, difficult: null, learned: null, change_next: null, proud: null, shared: false, completed_at: null },
  },
  roadmapNotes: {
    unique: [["chapter_key"]],
    defaults: { objective: null, planned_actions: null, reflection: null, status_override: null },
  },
  businesses: { defaults: { kind: "other", description: null, monthly_target: null, active: true, sort_order: 0 } },
  offers: {
    parents: [{ field: "business_id", table: "businesses", onDelete: "cascade", required: true }],
    defaults: { price: null, billing: "one_time", term_months: null, active: true },
  },
  customers: {
    parents: [{ field: "business_id", table: "businesses", onDelete: "cascade", required: true }],
    defaults: { status: "active", source: null, started_on: null, churned_on: null, notes: null },
  },
  transactions: {
    bucketBy: "txn_date",
    parents: [
      { field: "business_id", table: "businesses", onDelete: "cascade" },
      { field: "customer_id", table: "customers", onDelete: "set-null" },
      { field: "offer_id", table: "offers", onDelete: "set-null" },
    ],
    defaults: {
      business_id: null, description: null, customer_id: null, offer_id: null, recurring: false, lead_source: null,
      expense_category: null, notes: null,
    },
  },
  payments: {
    bucketBy: "paid_on",
    parents: [{ field: "transaction_id", table: "transactions", onDelete: "cascade", required: true }],
    defaults: { method: null },
  },
  deals: {
    bucketBy: "created_on",
    parents: [
      { field: "business_id", table: "businesses", onDelete: "cascade", required: true },
      { field: "offer_id", table: "offers", onDelete: "set-null" },
    ],
    defaults: { contact: null, stage: "lead", value: null, offer_id: null, source: null, closed_on: null, notes: null },
  },
  metrics: {
    parents: [{ field: "business_id", table: "businesses", onDelete: "cascade", required: true }],
    defaults: { kind: "outreach", daily_target: null, weekly_target: null, active: true, sort_order: 0 },
  },
  activityLogs: {
    bucketBy: "log_date", unique: [["metric_id", "log_date"]],
    parents: [{ field: "metric_id", table: "metrics", onDelete: "cascade", required: true }],
    defaults: { note: null },
  },
  achievements: {
    unique: [["key"]],
    parents: [{ field: "photo_id", table: "photos", onDelete: "set-null" }],
    defaults: { tier: "minor", detail: null, value: null, celebrated_at: null, photo_id: null },
  },
  notifications: { bucketBy: "created_at", unique: [["dedupe_key"]], defaults: { body: null, link: null, read_at: null }, cap: 300 },
};

export const SINGLE_DEFAULTS: Record<SingleKey, Record<string, unknown>> = {
  goals: {
    start_weight: null, start_date: null, target_loss: null, stretch_loss: null, start_waist: null, pace: "steady",
    activity_level: null, health_notes: null, preferred_activities: [], weekly_training_minutes: null,
  },
  athletic: {
    readiness: null, assessed_on: null, injury_notes: null, phase: "foundation", weekly_session_target: 3,
    training_days: [1, 3, 5], goal_text: "Complete a 10K", race_name: null, race_date: null,
  },
  businessSettings: {
    goal_metric: "revenue", goal_amount: 10000, goal_deadline: "2027-05-24", baseline_revenue: null,
    baseline_expenses: null, baseline_confirmed_on: null, forecast: {},
  },
  shareSettings: { weight: "percent", training: "summary", habits: "summary", health: "none", photos: "none", milestones: "full", business: "none" },
  reminderSettings: {
    daily_logging: true, daily_logging_hour: 20, workouts: true, weekly_review: true, monthly_review: true,
    milestones: true, business_targets: true, recovery: true, race_checkpoints: true,
  },
};

export class ValidationError extends Error {}

const fail = (msg: string): never => {
  throw new ValidationError(msg);
};

const isDate = (v: unknown): v is ISODate =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

function range(row: Record<string, unknown>, field: string, lo: number, hi: number, label: string) {
  const v = row[field];
  if (v === null || v === undefined) return;
  if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) fail(`${label} must be between ${lo} and ${hi}.`);
}

function oneOf(row: Record<string, unknown>, field: string, allowed: readonly unknown[], label: string) {
  const v = row[field];
  if (v === null || v === undefined) return;
  if (!allowed.includes(v)) fail(`${label} isn't a valid choice.`);
}

function required(row: Record<string, unknown>, fields: string[]) {
  for (const f of fields) if (row[f] === null || row[f] === undefined || row[f] === "") fail(`Missing ${f.replace(/_/g, " ")}.`);
}

function dates(row: Record<string, unknown>, fields: string[]) {
  for (const f of fields) {
    const v = row[f];
    if (v !== null && v !== undefined && !isDate(v)) fail(`${f.replace(/_/g, " ")} must be a valid date.`);
  }
}

const text = (row: Record<string, unknown>, field: string, max: number) => {
  const v = row[field];
  if (typeof v === "string" && v.length > max) fail(`${field.replace(/_/g, " ")} is too long (max ${max} characters).`);
};

/** Row-level rules (the old CHECK constraints). Cross-row rules live in the engine. */
export function validateRow(table: ListKey, r: Record<string, unknown>): void {
  switch (table) {
    case "weights":
      required(r, ["entry_date"]);
      dates(r, ["entry_date"]);
      range(r, "weight", 70, 700, "Weight");
      range(r, "waist_in", 15, 90, "Waist");
      if (r.weight == null && r.waist_in == null) fail("Enter a weight or a waist measurement.");
      text(r, "note", 500);
      break;
    case "checkins":
      required(r, ["checkin_date"]);
      dates(r, ["checkin_date"]);
      range(r, "sleep_hours", 0, 24, "Sleep");
      for (const f of ["sleep_quality", "energy", "soreness", "fatigue"]) range(r, f, 1, 5, f.replace("_", " "));
      range(r, "water_oz", 0, 400, "Water");
      break;
    case "symptoms":
      required(r, ["log_date", "pain_level"]);
      dates(r, ["log_date"]);
      range(r, "pain_level", 0, 10, "Pain level");
      oneOf(r, "side", ["left", "right", "both", "n/a"], "Side");
      oneOf(r, "pain_type", ["sharp", "dull", "aching", "burning", "stiffness", "swelling", "other"], "Pain type");
      break;
    case "nutrition":
      required(r, ["log_date", "meal"]);
      dates(r, ["log_date"]);
      oneOf(r, "meal", ["breakfast", "lunch", "dinner", "snack", "other"], "Meal");
      range(r, "calories", 0, 10000, "Calories");
      range(r, "protein_g", 0, 1000, "Protein");
      range(r, "carbs_g", 0, 1500, "Carbs");
      range(r, "fat_g", 0, 1000, "Fat");
      break;
    case "photos":
      required(r, ["taken_on", "storage_path"]);
      dates(r, ["taken_on"]);
      break;
    case "workouts":
      required(r, ["workout_date", "activity"]);
      dates(r, ["workout_date"]);
      oneOf(r, "activity", ["run", "run_walk", "walk", "swim", "cycle", "strength", "mobility", "recovery", "other"], "Activity");
      range(r, "duration_min", 0.1, 1440, "Duration");
      range(r, "distance_mi", 0, 300, "Distance");
      range(r, "avg_hr", 30, 230, "Heart rate");
      range(r, "rpe", 1, 10, "Effort");
      range(r, "pain_level", 0, 10, "Pain");
      break;
    case "sets":
      required(r, ["workout_id", "exercise"]);
      range(r, "reps", 0, 500, "Reps");
      range(r, "weight_lb", 0, 2000, "Weight");
      break;
    case "habits": {
      required(r, ["name", "start_date"]);
      dates(r, ["start_date", "archived_on"]);
      text(r, "name", 80);
      const days = r.schedule_days;
      if (!Array.isArray(days) || !days.length || days.some((d) => !Number.isInteger(d) || (d as number) < 0 || (d as number) > 6)) {
        fail("Choose at least one scheduled day.");
      }
      range(r, "xp", 5, 25, "XP");
      if (r.archived_on && (r.archived_on as string) < (r.start_date as string)) fail("A habit can't be archived before it starts.");
      break;
    }
    case "completions":
      required(r, ["habit_id", "completed_on"]);
      dates(r, ["completed_on"]);
      break;
    case "restDays":
      required(r, ["rest_date"]);
      dates(r, ["rest_date"]);
      break;
    case "tasks":
      required(r, ["title", "due_date"]);
      dates(r, ["due_date", "completed_on"]);
      text(r, "title", 160);
      break;
    case "journal":
      required(r, ["entry_date", "body"]);
      dates(r, ["entry_date"]);
      oneOf(r, "kind", ["journal", "reflection", "learning"], "Entry type");
      text(r, "body", 10000);
      break;
    case "reviews":
      required(r, ["period", "period_start"]);
      dates(r, ["period_start"]);
      oneOf(r, "period", ["week", "month"], "Review period");
      break;
    case "businesses":
      required(r, ["name"]);
      text(r, "name", 80);
      range(r, "monthly_target", 0, 1e9, "Monthly target");
      break;
    case "offers":
      required(r, ["business_id", "name"]);
      range(r, "price", 0, 1e9, "Price");
      oneOf(r, "billing", ["one_time", "monthly", "installment"], "Billing");
      break;
    case "customers":
      required(r, ["business_id", "name"]);
      dates(r, ["started_on", "churned_on"]);
      oneOf(r, "status", ["active", "paused", "churned"], "Status");
      if (r.started_on && r.churned_on && (r.churned_on as string) < (r.started_on as string)) fail("Churn date can't be before the start date.");
      break;
    case "transactions": {
      required(r, ["kind", "txn_date", "amount"]);
      dates(r, ["txn_date"]);
      oneOf(r, "kind", ["sale", "refund", "expense", "gig_income", "personal_income", "transfer"], "Type");
      const a = r.amount;
      if (typeof a !== "number" || !(a > 0) || a > 10_000_000) fail("Enter an amount greater than zero.");
      const biz = r.kind === "sale" || r.kind === "refund" || r.kind === "expense";
      if (biz && !r.business_id) fail("Sales, refunds and expenses belong to a business.");
      if (!biz && r.business_id) fail("Personal income and transfers can't belong to a business.");
      if (r.kind !== "sale" && r.recurring) fail("Only sales can be recurring.");
      if (r.kind !== "expense" && r.expense_category) fail("Only expenses have a category.");
      break;
    }
    case "payments":
      required(r, ["transaction_id", "paid_on", "amount"]);
      dates(r, ["paid_on"]);
      if (typeof r.amount !== "number" || !(r.amount > 0)) fail("Payment must be more than zero.");
      break;
    case "deals":
      required(r, ["business_id", "name", "created_on"]);
      dates(r, ["created_on", "closed_on"]);
      oneOf(r, "stage", ["lead", "contacted", "conversation", "proposal", "won", "lost"], "Stage");
      break;
    case "metrics":
      required(r, ["business_id", "label"]);
      oneOf(r, "kind", ["outreach", "content", "sales", "audience"], "Type");
      break;
    case "activityLogs":
      required(r, ["metric_id", "log_date"]);
      dates(r, ["log_date"]);
      range(r, "count", 0, 100000, "Count");
      break;
    case "achievements":
      required(r, ["key", "category", "title", "achieved_on"]);
      dates(r, ["achieved_on"]);
      break;
    case "notifications":
      required(r, ["kind", "title", "dedupe_key"]);
      break;
    case "roadmapNotes":
      required(r, ["chapter_key"]);
      break;
  }
}

export function validateSingle(key: SingleKey, r: Record<string, unknown>): void {
  if (key === "goals") {
    range(r, "start_weight", 70, 700, "Starting weight");
    range(r, "target_loss", 0.1, 300, "Target loss");
    range(r, "stretch_loss", 0.1, 300, "Stretch goal");
    range(r, "start_waist", 15, 90, "Waist");
    dates(r, ["start_date"]);
    if (r.stretch_loss != null && r.target_loss != null && (r.stretch_loss as number) < (r.target_loss as number)) {
      fail("The stretch goal should be at least the main goal.");
    }
    if (r.start_weight != null && r.target_loss != null && (r.start_weight as number) - (r.target_loss as number) < 60) {
      fail("That target is below a realistic weight.");
    }
  }
  if (key === "athletic") {
    range(r, "weekly_session_target", 1, 14, "Sessions per week");
    dates(r, ["assessed_on", "race_date"]);
  }
  if (key === "businessSettings") {
    if (r.goal_amount != null && !((r.goal_amount as number) > 0)) fail("The goal must be more than $0.");
    oneOf(r, "goal_metric", ["revenue", "cash", "profit"], "Goal measure");
  }
}

/** Storage chunk for a row: "YYYY-MM" of its bucket field, or "all". */
export function bucketOf(table: ListKey, row: Record<string, unknown>): string {
  const f = TABLES[table].bucketBy;
  const v = f ? row[f] : null;
  return typeof v === "string" && /^\d{4}-\d{2}/.test(v) ? v.slice(0, 7) : "all";
}

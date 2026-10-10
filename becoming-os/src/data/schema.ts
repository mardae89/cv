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
  /** Rows dropped last when trimming to the cap. */
  capKeep?: (row: Record<string, unknown>) => boolean;
}

export const TABLES: Record<ListKey, TableDef> = {
  weights: { bucketBy: "entry_date", unique: [["entry_date"]], defaults: { waist_in: null, note: null, flagged: false, weight: null } },
  checkins: {
    bucketBy: "checkin_date", unique: [["checkin_date"]],
    defaults: { sleep_hours: null, sleep_quality: null, energy: null, soreness: null, fatigue: null, water_oz: null, note: null },
  },
  symptoms: { bucketBy: "log_date", defaults: { body_area: "Ankle", side: null, pain_type: null, during: null, note: null } },
  nutrition: { bucketBy: "log_date", defaults: { description: null, calories: null, protein_g: null, carbs_g: null, fat_g: null, note: null } },
  photos: { bucketBy: "taken_on", unique: [["storage_path"]], defaults: { pose: null, caption: null } },
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
  notifications: {
    bucketBy: "created_at", unique: [["dedupe_key"]], defaults: { body: null, link: null, read_at: null, cleared_at: null }, cap: 300,
    // One-off reminders (a chapter, a near milestone, a race checkpoint, an unlock) are only created once;
    // dropping them first would bring them back. Dated ones (daily:, weekly:, …) never come back once past.
    capKeep: (r) => /^(chapter|near|race|ach):/.test(String(r.dedupe_key)),
  },
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

/** Whole-number columns. The old database rounded these on save; so does the engine. */
const INT_FIELDS: Partial<Record<ListKey | SingleKey, string[]>> = {
  checkins: ["sleep_quality", "energy", "soreness", "fatigue"],
  symptoms: ["pain_level"],
  nutrition: ["calories"],
  workouts: ["avg_hr", "rpe", "pain_level"],
  sets: ["set_no", "reps"],
  habits: ["xp", "sort_order"],
  journal: ["minutes"],
  businesses: ["sort_order"],
  offers: ["term_months"],
  metrics: ["daily_target", "weekly_target", "sort_order"],
  activityLogs: ["count"],
  goals: ["weekly_training_minutes"],
  athletic: ["weekly_session_target"],
  reminderSettings: ["daily_logging_hour"],
};

/** Round whole-number columns in place, as the old database did. */
export function normalize<T extends Record<string, unknown>>(key: ListKey | SingleKey, r: T): T {
  for (const f of INT_FIELDS[key] ?? []) {
    const v = r[f];
    if (typeof v === "number" && Number.isFinite(v) && !Number.isInteger(v)) (r as Record<string, unknown>)[f] = Math.round(v);
  }
  return r;
}

const CATEGORIES = ["body", "training", "nutrition", "recovery", "business", "mind", "relationship", "other"];

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
      text(r, "note", 1000);
      break;
    case "symptoms":
      required(r, ["log_date", "pain_level", "body_area"]);
      dates(r, ["log_date"]);
      range(r, "pain_level", 0, 10, "Pain level");
      oneOf(r, "side", ["left", "right", "both", "n/a"], "Side");
      oneOf(r, "pain_type", ["sharp", "dull", "aching", "burning", "stiffness", "swelling", "other"], "Pain type");
      oneOf(r, "during", ["rest", "walking", "running", "training", "stairs", "morning", "other"], "When it hurts");
      text(r, "body_area", 60);
      text(r, "note", 1000);
      break;
    case "nutrition":
      required(r, ["log_date", "meal"]);
      dates(r, ["log_date"]);
      oneOf(r, "meal", ["breakfast", "lunch", "dinner", "snack", "other"], "Meal");
      range(r, "calories", 0, 10000, "Calories");
      range(r, "protein_g", 0, 1000, "Protein");
      range(r, "carbs_g", 0, 1500, "Carbs");
      range(r, "fat_g", 0, 1000, "Fat");
      text(r, "description", 300);
      text(r, "note", 500);
      break;
    case "photos":
      required(r, ["taken_on", "storage_path"]);
      dates(r, ["taken_on"]);
      oneOf(r, "pose", ["front", "side", "back", "other"], "Pose");
      text(r, "storage_path", 300);
      text(r, "caption", 300);
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
      oneOf(r, "intensity", ["easy", "moderate", "hard"], "Intensity");
      text(r, "title", 120);
      text(r, "notes", 2000);
      text(r, "recovery_notes", 1000);
      break;
    case "sets":
      required(r, ["workout_id", "exercise"]);
      range(r, "reps", 0, 500, "Reps");
      range(r, "weight_lb", 0, 2000, "Weight");
      range(r, "set_no", 1, 50, "Set number");
      text(r, "exercise", 80);
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
      oneOf(r, "category", CATEGORIES, "Category");
      if (r.archived_on && (r.archived_on as string) < (r.start_date as string)) fail("A habit can't be archived before it starts.");
      break;
    }
    case "completions":
      required(r, ["habit_id", "completed_on"]);
      dates(r, ["completed_on"]);
      text(r, "note", 300);
      break;
    case "restDays":
      required(r, ["rest_date"]);
      dates(r, ["rest_date"]);
      text(r, "note", 300);
      break;
    case "tasks":
      required(r, ["title", "due_date"]);
      dates(r, ["due_date", "completed_on"]);
      text(r, "title", 160);
      oneOf(r, "category", CATEGORIES, "Category");
      break;
    case "journal":
      required(r, ["entry_date", "body"]);
      dates(r, ["entry_date"]);
      oneOf(r, "kind", ["journal", "reflection", "learning"], "Entry type");
      text(r, "body", 10000);
      text(r, "title", 160);
      range(r, "minutes", 0, 1440, "Minutes");
      break;
    case "reviews":
      required(r, ["period", "period_start"]);
      dates(r, ["period_start"]);
      oneOf(r, "period", ["week", "month"], "Review period");
      for (const f of ["went_well", "difficult", "learned", "change_next", "proud"]) text(r, f, 3000);
      break;
    case "businesses":
      required(r, ["name"]);
      text(r, "name", 80);
      range(r, "monthly_target", 0, 1e9, "Monthly target");
      oneOf(r, "kind", ["service", "education", "other"], "Business type");
      text(r, "description", 600);
      break;
    case "offers":
      required(r, ["business_id", "name"]);
      range(r, "price", 0, 1e9, "Price");
      oneOf(r, "billing", ["one_time", "monthly", "installment"], "Billing");
      range(r, "term_months", 1, 60, "Term");
      text(r, "name", 80);
      break;
    case "customers":
      required(r, ["business_id", "name"]);
      dates(r, ["started_on", "churned_on"]);
      oneOf(r, "status", ["active", "paused", "churned"], "Status");
      if (r.started_on && r.churned_on && (r.churned_on as string) < (r.started_on as string)) fail("Churn date can't be before the start date.");
      text(r, "name", 120);
      text(r, "source", 80);
      text(r, "notes", 1000);
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
      oneOf(r, "expense_category", ["software", "advertising", "contractors", "delivery", "education", "fees", "equipment", "travel", "other"], "Expense category");
      text(r, "description", 200);
      text(r, "lead_source", 80);
      text(r, "notes", 1000);
      break;
    }
    case "payments":
      required(r, ["transaction_id", "paid_on", "amount"]);
      dates(r, ["paid_on"]);
      if (typeof r.amount !== "number" || !(r.amount > 0)) fail("Payment must be more than zero.");
      text(r, "method", 40);
      break;
    case "deals":
      required(r, ["business_id", "name", "created_on"]);
      dates(r, ["created_on", "closed_on"]);
      oneOf(r, "stage", ["lead", "contacted", "conversation", "proposal", "won", "lost"], "Stage");
      range(r, "value", 0, 1e9, "Deal value");
      text(r, "name", 120);
      text(r, "contact", 120);
      text(r, "source", 80);
      text(r, "notes", 2000);
      break;
    case "metrics":
      required(r, ["business_id", "label"]);
      oneOf(r, "kind", ["outreach", "content", "sales", "audience"], "Type");
      text(r, "label", 60);
      range(r, "daily_target", 0, 10000, "Daily target");
      range(r, "weekly_target", 0, 70000, "Weekly target");
      break;
    case "activityLogs":
      required(r, ["metric_id", "log_date", "count"]);
      dates(r, ["log_date"]);
      range(r, "count", 0, 100000, "Count");
      text(r, "note", 300);
      break;
    case "achievements":
      required(r, ["key", "category", "title", "achieved_on"]);
      dates(r, ["achieved_on"]);
      oneOf(r, "category", ["weight", "business", "athletic", "habit", "level"], "Milestone category");
      oneOf(r, "tier", ["minor", "major"], "Milestone tier");
      text(r, "key", 80);
      text(r, "title", 160);
      text(r, "detail", 400);
      break;
    case "notifications":
      required(r, ["kind", "title", "dedupe_key"]);
      text(r, "kind", 40);
      text(r, "title", 160);
      text(r, "body", 600);
      text(r, "link", 200);
      text(r, "dedupe_key", 120);
      break;
    case "roadmapNotes":
      required(r, ["chapter_key"]);
      text(r, "chapter_key", 20);
      text(r, "objective", 500);
      text(r, "planned_actions", 3000);
      text(r, "reflection", 3000);
      oneOf(r, "status_override", ["not_started", "in_progress", "complete", "adjusted"], "Status");
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
    oneOf(r, "pace", ["gentle", "steady", "ambitious"], "Pace");
    oneOf(r, "activity_level", ["sedentary", "light", "moderate", "active"], "Activity level");
    text(r, "health_notes", 2000);
    range(r, "weekly_training_minutes", 0, 3000, "Weekly training minutes");
  }
  if (key === "athletic") {
    range(r, "weekly_session_target", 1, 14, "Sessions per week");
    dates(r, ["assessed_on", "race_date"]);
    oneOf(r, "readiness", ["no_injury", "symptoms_not_assessed", "under_care", "cleared_by_clinician"], "Readiness");
    oneOf(r, "phase", ["foundation", "return_to_running", "aerobic_base", "10k_specific", "race_ready"], "Training phase");
    if (r.goal_text === null || r.goal_text === undefined) fail("Missing goal text.");
    text(r, "goal_text", 120);
    text(r, "injury_notes", 2000);
    text(r, "race_name", 120);
  }
  if (key === "businessSettings") {
    required(r, ["goal_amount", "goal_deadline"]);
    if (!((r.goal_amount as number) > 0)) fail("The goal must be more than $0.");
    oneOf(r, "goal_metric", ["revenue", "cash", "profit"], "Goal measure");
    range(r, "baseline_revenue", 0, 1e9, "Baseline revenue");
    range(r, "baseline_expenses", 0, 1e9, "Baseline expenses");
    dates(r, ["goal_deadline", "baseline_confirmed_on"]);
  }
  if (key === "shareSettings") {
    // A missing or unknown level must never read as "shared".
    required(r, ["weight", "training", "habits", "health", "photos", "milestones", "business"]);
    oneOf(r, "weight", ["none", "percent", "pounds", "full"], "Weight sharing");
    for (const f of ["training", "habits", "business"]) oneOf(r, f, ["none", "summary", "full"], `${f[0].toUpperCase()}${f.slice(1)} sharing`);
    for (const f of ["health", "photos", "milestones"]) oneOf(r, f, ["none", "full"], `${f[0].toUpperCase()}${f.slice(1)} sharing`);
  }
  if (key === "reminderSettings") {
    range(r, "daily_logging_hour", 0, 23, "Reminder hour");
  }
}

/** The profile's own rules (the old profiles table). The time zone is checked by the engine. */
export function validateProfile(p: Record<string, unknown>): void {
  oneOf(p, "plan_preset", ["primary", "partner", "custom"], "Plan");
  dates(p, ["demo_today"]);
  text(p, "display_name", 60);
}

/** Storage chunk for a row: "YYYY-MM" of its bucket field, or "all". */
export function bucketOf(table: ListKey, row: Record<string, unknown>): string {
  const f = TABLES[table].bucketBy;
  const v = f ? row[f] : null;
  return typeof v === "string" && /^\d{4}-\d{2}/.test(v) ? v.slice(0, 7) : "all";
}

// Row types for every stored record. Numbers are stored as numbers, but
// older backups may hold numeric strings; `num()` in format.ts normalises
// them where it matters.

export type ISODate = string; // 'YYYY-MM-DD', a local calendar date

export type HabitCategory =
  | "body" | "training" | "nutrition" | "recovery" | "business" | "mind" | "relationship" | "other";

export interface Profile {
  id: string;
  display_name: string;
  timezone: string;
  plan_preset: "primary" | "partner" | "custom" | null;
  business_enabled: boolean;
  onboarding_done: boolean;
  demo_mode: boolean;
  demo_today: ISODate | null;
  created_at: string;
}

export type WeightShare = "none" | "percent" | "pounds" | "full";
export type SummaryShare = "none" | "summary" | "full";
export type BinaryShare = "none" | "full";

export interface ShareSettings {
  user_id: string;
  weight: WeightShare;
  training: SummaryShare;
  habits: SummaryShare;
  health: BinaryShare;
  photos: BinaryShare;
  milestones: BinaryShare;
  business: SummaryShare;
}

export interface ReminderSettings {
  user_id: string;
  daily_logging: boolean;
  daily_logging_hour: number;
  workouts: boolean;
  weekly_review: boolean;
  monthly_review: boolean;
  milestones: boolean;
  business_targets: boolean;
  recovery: boolean;
  race_checkpoints: boolean;
}

export interface Partnership {
  id: string;
  user_a: string;
  user_b: string | null;
  invite_code: string;
  status: "pending" | "active" | "ended";
  created_at: string;
  accepted_at: string | null;
}

export interface AppNotification {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  dedupe_key: string;
  created_at: string;
  read_at: string | null;
}

export type Pace = "gentle" | "steady" | "ambitious";

export interface BodyGoals {
  user_id: string;
  start_weight: number | null;
  start_date: ISODate | null;
  target_loss: number | null;
  stretch_loss: number | null;
  start_waist: number | null;
  pace: Pace;
  activity_level: "sedentary" | "light" | "moderate" | "active" | null;
  health_notes: string | null;
  preferred_activities: string[];
  weekly_training_minutes: number | null;
}

export interface WeightEntry {
  id: string;
  user_id: string;
  entry_date: ISODate;
  weight: number | null;
  waist_in: number | null;
  note: string | null;
  flagged: boolean;
}

export interface DailyCheckin {
  id: string;
  user_id: string;
  checkin_date: ISODate;
  sleep_hours: number | null;
  sleep_quality: number | null;
  energy: number | null;
  soreness: number | null;
  fatigue: number | null;
  water_oz: number | null;
  note: string | null;
}

export type PainType = "sharp" | "dull" | "aching" | "burning" | "stiffness" | "swelling" | "other";

export interface SymptomLog {
  id: string;
  user_id: string;
  log_date: ISODate;
  body_area: string;
  side: "left" | "right" | "both" | "n/a" | null;
  pain_level: number;
  pain_type: PainType | null;
  during: "rest" | "walking" | "running" | "training" | "stairs" | "morning" | "other" | null;
  note: string | null;
}

export type Meal = "breakfast" | "lunch" | "dinner" | "snack" | "other";

export interface NutritionLog {
  id: string;
  user_id: string;
  log_date: ISODate;
  meal: Meal;
  description: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  note: string | null;
}

export interface ProgressPhoto {
  id: string;
  user_id: string;
  taken_on: ISODate;
  storage_path: string;
  pose: "front" | "side" | "back" | "other" | null;
  caption: string | null;
}

export type Readiness = "no_injury" | "symptoms_not_assessed" | "under_care" | "cleared_by_clinician";
export type Phase = "foundation" | "return_to_running" | "aerobic_base" | "10k_specific" | "race_ready";

export interface AthleticProfile {
  user_id: string;
  readiness: Readiness | null;
  assessed_on: ISODate | null;
  injury_notes: string | null;
  phase: Phase;
  weekly_session_target: number;
  training_days: number[];
  goal_text: string;
  race_name: string | null;
  race_date: ISODate | null;
}

export type Activity =
  | "run" | "run_walk" | "walk" | "swim" | "cycle" | "strength" | "mobility" | "recovery" | "other";

export interface Workout {
  id: string;
  user_id: string;
  workout_date: ISODate;
  activity: Activity;
  title: string | null;
  duration_min: number | null;
  distance_mi: number | null;
  avg_hr: number | null;
  rpe: number | null;
  intensity: "easy" | "moderate" | "hard" | null;
  pain_level: number | null;
  is_race: boolean;
  notes: string | null;
  recovery_notes: string | null;
}

export interface StrengthSet {
  id: string;
  user_id: string;
  workout_id: string;
  exercise: string;
  set_no: number;
  reps: number | null;
  weight_lb: number | null;
}

export interface Habit {
  id: string;
  user_id: string;
  name: string;
  category: HabitCategory;
  schedule_days: number[]; // 0 = Sunday … 6 = Saturday
  skip_on_rest_days: boolean;
  xp: number;
  start_date: ISODate;
  archived_on: ISODate | null;
  sort_order: number;
}

export interface HabitCompletion {
  id: string;
  user_id: string;
  habit_id: string;
  completed_on: ISODate;
  note: string | null;
}

export interface RestDay {
  id: string;
  user_id: string;
  rest_date: ISODate;
  note: string | null;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  due_date: ISODate;
  completed_on: ISODate | null;
  category: HabitCategory;
}

export interface JournalEntry {
  id: string;
  user_id: string;
  entry_date: ISODate;
  kind: "journal" | "reflection" | "learning";
  title: string | null;
  body: string;
  minutes: number | null;
  shared: boolean;
  created_at: string;
}

export interface Review {
  id: string;
  user_id: string;
  period: "week" | "month";
  period_start: ISODate;
  went_well: string | null;
  difficult: string | null;
  learned: string | null;
  change_next: string | null;
  proud: string | null;
  shared: boolean;
  completed_at: string | null;
}

export interface RoadmapNote {
  user_id: string;
  chapter_key: string;
  objective: string | null;
  planned_actions: string | null;
  reflection: string | null;
  status_override: "not_started" | "in_progress" | "complete" | "adjusted" | null;
}

export type GoalMetric = "revenue" | "cash" | "profit";

export interface ForecastAssumptions {
  newRecurringPerMonth?: number;
  recurringPrice?: number;
  churnPct?: number;
  oneTimeSalesPerMonth?: number;
  oneTimeAvg?: number;
  monthlyExpenses?: number;
}

export interface BusinessSettings {
  user_id: string;
  goal_metric: GoalMetric;
  goal_amount: number;
  goal_deadline: ISODate;
  baseline_revenue: number | null;
  baseline_expenses: number | null;
  baseline_confirmed_on: ISODate | null;
  forecast: ForecastAssumptions;
}

export interface Business {
  id: string;
  user_id: string;
  name: string;
  kind: "service" | "education" | "other";
  description: string | null;
  monthly_target: number | null;
  active: boolean;
  sort_order: number;
}

export interface Offer {
  id: string;
  user_id: string;
  business_id: string;
  name: string;
  price: number | null;
  billing: "one_time" | "monthly" | "installment";
  term_months: number | null;
  active: boolean;
}

export interface Customer {
  id: string;
  user_id: string;
  business_id: string;
  name: string;
  status: "active" | "paused" | "churned";
  source: string | null;
  started_on: ISODate | null;
  churned_on: ISODate | null;
  notes: string | null;
}

export type TxnKind = "sale" | "refund" | "expense" | "gig_income" | "personal_income" | "transfer";
export type ExpenseCategory =
  | "software" | "advertising" | "contractors" | "delivery" | "education" | "fees" | "equipment" | "travel" | "other";

export interface Transaction {
  id: string;
  user_id: string;
  business_id: string | null;
  kind: TxnKind;
  txn_date: ISODate;
  amount: number;
  description: string | null;
  customer_id: string | null;
  offer_id: string | null;
  recurring: boolean;
  lead_source: string | null;
  expense_category: ExpenseCategory | null;
  notes: string | null;
}

export interface Payment {
  id: string;
  user_id: string;
  transaction_id: string;
  paid_on: ISODate;
  amount: number;
  method: string | null;
}

export type DealStage = "lead" | "contacted" | "conversation" | "proposal" | "won" | "lost";

export interface Deal {
  id: string;
  user_id: string;
  business_id: string;
  name: string;
  contact: string | null;
  stage: DealStage;
  value: number | null;
  offer_id: string | null;
  source: string | null;
  created_on: ISODate;
  closed_on: ISODate | null;
  notes: string | null;
}

export interface ActivityMetric {
  id: string;
  user_id: string;
  business_id: string;
  label: string;
  kind: "outreach" | "content" | "sales" | "audience";
  daily_target: number | null;
  weekly_target: number | null;
  active: boolean;
  sort_order: number;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  metric_id: string;
  log_date: ISODate;
  count: number;
  note: string | null;
}

export type AudiencePlatform = "instagram" | "youtube" | "skool";

/** The follower / subscriber / member count on one platform, as read on one day. */
export interface AudienceEntry {
  id: string;
  user_id: string;
  platform: AudiencePlatform;
  recorded_on: ISODate;
  count: number;
  note: string | null;
  created_at?: string;
}

// ── Power List: the non-negotiables checked off every day
/** Where an item's progress can come from besides ticking it: records logged elsewhere in the app. */
export type PowerAuto = "food" | "workouts" | "shorts" | "longs" | "reached";

export interface PowerItem {
  id: string;
  user_id: string;
  name: string;
  /** "check": done or not. "count": done once `target` is reached (stories, pages, minutes). */
  kind: "check" | "count";
  target: number | null;
  unit: string | null;
  auto: PowerAuto | null;
  /** Days it is due, 0 = Sunday … 6 = Saturday. */
  days: number[];
  sort_order: number;
  /** It counts toward completion rates from this date. */
  start_date: ISODate;
  archived_on: ISODate | null;
}

export interface PowerLog {
  id: string;
  user_id: string;
  item_id: string;
  log_date: ISODate;
  value: number | null;
  done: boolean;
}

export interface PowerSettings {
  user_id: string;
  /** Why this matters — rotated through the app as a constant reminder. */
  reasons: string[];
  /** Who you're becoming, in one line. */
  identity: string | null;
  shorts_per_day: number;
  longs_per_week: number;
  /** New people reached per day (the Traffic Engine's daily ten). */
  reach_per_day: number;
}

// ── Traffic Engine: the four numbers, by channel
export type TrafficChannel =
  | "existing_world" | "social_outbound" | "content" | "borrowed_audiences"
  | "referrals" | "webinars" | "external_ads" | "skool_ads";

/** One day's numbers for one channel. */
export interface TrafficEntry {
  id: string;
  user_id: string;
  log_date: ISODate;
  channel: TrafficChannel;
  reached: number;
  conversations: number;
  invitations: number;
  members: number;
  note: string | null;
}

// ── Content library
export type ContentFormat = "short" | "long";
export type FunnelStage = "top" | "middle" | "bottom";

export interface ContentIdea {
  id: string;
  user_id: string;
  num: number;
  title: string;
  format: ContentFormat;
  section: string;
  funnel: FunnelStage;
  /** A direct call to action (the free group, coaching). */
  cta: boolean;
  /** From a section your notes mark as priority. */
  priority: boolean;
  status: "open" | "done";
  /** The day it's scheduled to be posted. */
  planned_for: ISODate | null;
  completed_on: ISODate | null;
  notes: string | null;
  created_at?: string;
}

export type AchievementCategory = "weight" | "business" | "audience" | "power" | "athletic" | "habit" | "level";

export interface AchievementRow {
  id: string;
  user_id: string;
  key: string;
  category: AchievementCategory;
  tier: "minor" | "major";
  title: string;
  detail: string | null;
  value: number | null;
  achieved_on: ISODate;
  celebrated_at: string | null;
  photo_id: string | null;
  created_at: string;
}

export interface PartnerOverview {
  partner_id: string;
  display_name: string;
  today: ISODate;
  demo_mode: boolean;
  levels: {
    weight: WeightShare; training: SummaryShare; habits: SummaryShare; health: BinaryShare;
    photos: BinaryShare; milestones: BinaryShare; business: SummaryShare;
  };
  weight?: {
    has_goal: boolean;
    pct_primary?: number;
    pct_stretch?: number | null;
    lost?: number;
    target_loss?: number;
    stretch_loss?: number | null;
    remaining?: number;
    next_milestone?: number;
    start_weight?: number;
    current_trend?: number | null;
    target_weight?: number;
    latest_entry?: ISODate;
  };
  training?: {
    week_start: ISODate;
    sessions_week: number;
    session_target: number;
    run_miles_week: number;
    longest_run: number;
    strength_week: number;
    total_workouts: number;
    phase: Phase;
    goal_text: string;
    race_name: string | null;
    race_date: ISODate | null;
  };
  habits?: {
    today_scheduled: number;
    today_done: number;
    week_scheduled: number;
    week_done: number;
    week_pct: number | null;
  };
  business?: { month: ISODate; metric: GoalMetric; goal: number; value: number };
}

/** Everything one user owns, loaded once and recomputed client-side. */
export interface UserData {
  profile: Profile;
  goals: BodyGoals | null;
  athletic: AthleticProfile | null;
  businessSettings: BusinessSettings | null;
  weights: WeightEntry[];
  checkins: DailyCheckin[];
  symptoms: SymptomLog[];
  nutrition: NutritionLog[];
  photos: ProgressPhoto[];
  workouts: Workout[];
  sets: StrengthSet[];
  habits: Habit[];
  completions: HabitCompletion[];
  restDays: RestDay[];
  tasks: Task[];
  journal: JournalEntry[];
  reviews: Review[];
  roadmapNotes: RoadmapNote[];
  businesses: Business[];
  offers: Offer[];
  customers: Customer[];
  transactions: Transaction[];
  payments: Payment[];
  deals: Deal[];
  metrics: ActivityMetric[];
  activityLogs: ActivityLog[];
  achievements: AchievementRow[];
  audience: AudienceEntry[];
  powerItems: PowerItem[];
  powerLogs: PowerLog[];
  contentIdeas: ContentIdea[];
  traffic: TrafficEntry[];
  powerSettings: PowerSettings | null;
}

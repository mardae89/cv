-- ═══════════════════════════════════════════════════════════════════════════
-- BECOMING OS — database schema
--
-- Every table is owned by one user (user_id) and protected by row-level
-- security. A partner can read another user's rows only when the owner's
-- share_settings grant that category, and only through an active partnership.
-- Writes are always owner-only. Business finance is never shared by default.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────────────────────────────────────────────────────── profiles ──
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  timezone text not null default 'America/New_York',
  plan_preset text check (plan_preset in ('primary', 'partner', 'custom')),
  business_enabled boolean not null default false,
  onboarding_done boolean not null default false,
  demo_mode boolean not null default false,
  demo_today date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.validate_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end $$;

create trigger profiles_validate before insert or update on public.profiles
  for each row execute function public.validate_profile();
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────── sharing & social ──
create table public.share_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weight text not null default 'percent' check (weight in ('none', 'percent', 'pounds', 'full')),
  training text not null default 'summary' check (training in ('none', 'summary', 'full')),
  habits text not null default 'summary' check (habits in ('none', 'summary', 'full')),
  health text not null default 'none' check (health in ('none', 'full')),
  photos text not null default 'none' check (photos in ('none', 'full')),
  milestones text not null default 'full' check (milestones in ('none', 'full')),
  business text not null default 'none' check (business in ('none', 'summary', 'full')),
  updated_at timestamptz not null default now()
);
create trigger share_settings_updated before update on public.share_settings
  for each row execute function public.set_updated_at();

create table public.partnerships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid references auth.users(id) on delete cascade,
  invite_code text not null unique,
  status text not null default 'pending' check (status in ('pending', 'active', 'ended')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  ended_at timestamptz,
  check (user_b is null or user_b <> user_a)
);
create index partnerships_a on public.partnerships (user_a) where status = 'active';
create index partnerships_b on public.partnerships (user_b) where status = 'active';

create table public.reminder_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_logging boolean not null default true,
  daily_logging_hour smallint not null default 20 check (daily_logging_hour between 0 and 23),
  workouts boolean not null default true,
  weekly_review boolean not null default true,
  monthly_review boolean not null default true,
  milestones boolean not null default true,
  business_targets boolean not null default true,
  recovery boolean not null default true,
  race_checkpoints boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger reminder_settings_updated before update on public.reminder_settings
  for each row execute function public.set_updated_at();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (char_length(kind) <= 40),
  title text not null check (char_length(title) <= 160),
  body text check (char_length(body) <= 600),
  link text check (char_length(link) <= 200),
  dedupe_key text not null check (char_length(dedupe_key) <= 120),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, dedupe_key)
);

-- ────────────────────────────────────────────────────────────────── body ──
create table public.body_goals (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  start_weight numeric(5,1) check (start_weight between 70 and 700),
  start_date date,
  target_loss numeric(5,1) check (target_loss > 0 and target_loss <= 300),
  stretch_loss numeric(5,1) check (stretch_loss > 0 and stretch_loss <= 300),
  start_waist numeric(4,1) check (start_waist between 15 and 90),
  pace text not null default 'steady' check (pace in ('gentle', 'steady', 'ambitious')),
  activity_level text check (activity_level in ('sedentary', 'light', 'moderate', 'active')),
  health_notes text check (char_length(health_notes) <= 2000),
  preferred_activities text[] not null default '{}',
  weekly_training_minutes smallint check (weekly_training_minutes between 0 and 3000),
  updated_at timestamptz not null default now(),
  check (stretch_loss is null or target_loss is null or stretch_loss >= target_loss),
  check (target_loss is null or start_weight is null or start_weight - target_loss >= 60)
);
create trigger body_goals_updated before update on public.body_goals
  for each row execute function public.set_updated_at();

create table public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null,
  weight numeric(5,1) check (weight between 70 and 700),
  waist_in numeric(4,1) check (waist_in between 15 and 90),
  note text check (char_length(note) <= 500),
  flagged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date),
  check (weight is not null or waist_in is not null)
);
create trigger weight_entries_updated before update on public.weight_entries
  for each row execute function public.set_updated_at();

create table public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  checkin_date date not null,
  sleep_hours numeric(3,1) check (sleep_hours between 0 and 24),
  sleep_quality smallint check (sleep_quality between 1 and 5),
  energy smallint check (energy between 1 and 5),
  soreness smallint check (soreness between 1 and 5),
  fatigue smallint check (fatigue between 1 and 5),
  water_oz numeric(5,1) check (water_oz between 0 and 400),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, checkin_date)
);
create trigger daily_checkins_updated before update on public.daily_checkins
  for each row execute function public.set_updated_at();

create table public.symptom_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date date not null,
  body_area text not null default 'Ankle' check (char_length(body_area) between 1 and 60),
  side text check (side in ('left', 'right', 'both', 'n/a')),
  pain_level smallint not null check (pain_level between 0 and 10),
  pain_type text check (pain_type in ('sharp', 'dull', 'aching', 'burning', 'stiffness', 'swelling', 'other')),
  during text check (during in ('rest', 'walking', 'running', 'training', 'stairs', 'morning', 'other')),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index symptom_logs_user_date on public.symptom_logs (user_id, log_date);

create table public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack', 'other')),
  description text check (char_length(description) <= 300),
  calories integer check (calories between 0 and 10000),
  protein_g numeric(5,1) check (protein_g between 0 and 1000),
  carbs_g numeric(5,1) check (carbs_g between 0 and 1500),
  fat_g numeric(5,1) check (fat_g between 0 and 1000),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index nutrition_logs_user_date on public.nutrition_logs (user_id, log_date);

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  taken_on date not null,
  storage_path text not null unique check (char_length(storage_path) <= 300),
  pose text check (pose in ('front', 'side', 'back', 'other')),
  caption text check (char_length(caption) <= 300),
  created_at timestamptz not null default now()
);
create index progress_photos_user on public.progress_photos (user_id, taken_on);

-- ─────────────────────────────────────────────────────────────── training ──
create table public.athletic_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  readiness text check (readiness in ('no_injury', 'symptoms_not_assessed', 'under_care', 'cleared_by_clinician')),
  assessed_on date,
  injury_notes text check (char_length(injury_notes) <= 2000),
  phase text not null default 'foundation'
    check (phase in ('foundation', 'return_to_running', 'aerobic_base', '10k_specific', 'race_ready')),
  weekly_session_target smallint not null default 3 check (weekly_session_target between 1 and 14),
  training_days smallint[] not null default '{1,3,5}',
  goal_text text not null default 'Complete a 10K' check (char_length(goal_text) <= 120),
  race_name text check (char_length(race_name) <= 120),
  race_date date,
  updated_at timestamptz not null default now()
);
create trigger athletic_profiles_updated before update on public.athletic_profiles
  for each row execute function public.set_updated_at();

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_date date not null,
  activity text not null
    check (activity in ('run', 'run_walk', 'walk', 'swim', 'cycle', 'strength', 'mobility', 'recovery', 'other')),
  title text check (char_length(title) <= 120),
  duration_min numeric(5,1) check (duration_min > 0 and duration_min <= 1440),
  distance_mi numeric(6,2) check (distance_mi >= 0 and distance_mi <= 300),
  avg_hr smallint check (avg_hr between 30 and 230),
  rpe smallint check (rpe between 1 and 10),
  intensity text check (intensity in ('easy', 'moderate', 'hard')),
  pain_level smallint check (pain_level between 0 and 10),
  is_race boolean not null default false,
  notes text check (char_length(notes) <= 2000),
  recovery_notes text check (char_length(recovery_notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workouts_user_date on public.workouts (user_id, workout_date);
create trigger workouts_updated before update on public.workouts
  for each row execute function public.set_updated_at();

create table public.strength_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise text not null check (char_length(exercise) between 1 and 80),
  set_no smallint not null default 1 check (set_no between 1 and 50),
  reps smallint check (reps between 0 and 500),
  weight_lb numeric(6,1) check (weight_lb between 0 and 2000),
  created_at timestamptz not null default now()
);
create index strength_sets_workout on public.strength_sets (workout_id);
create index strength_sets_user on public.strength_sets (user_id);

-- ─────────────────────────────────────────────────── habits & development ──
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category text not null default 'other'
    check (category in ('body', 'training', 'nutrition', 'recovery', 'business', 'mind', 'relationship', 'other')),
  schedule_days smallint[] not null default '{0,1,2,3,4,5,6}',
  skip_on_rest_days boolean not null default false,
  xp smallint not null default 10 check (xp between 5 and 25),
  start_date date not null,
  archived_on date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (schedule_days <@ '{0,1,2,3,4,5,6}'::smallint[] and cardinality(schedule_days) between 1 and 7),
  check (archived_on is null or archived_on >= start_date)
);
create index habits_user on public.habits (user_id);

create table public.habit_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  completed_on date not null,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  unique (habit_id, completed_on)
);
create index habit_completions_user_date on public.habit_completions (user_id, completed_on);

create table public.rest_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rest_date date not null,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  unique (user_id, rest_date)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  due_date date not null,
  completed_on date,
  category text not null default 'other'
    check (category in ('body', 'training', 'nutrition', 'recovery', 'business', 'mind', 'relationship', 'other')),
  created_at timestamptz not null default now()
);
create index tasks_user_due on public.tasks (user_id, due_date);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null,
  kind text not null default 'journal' check (kind in ('journal', 'reflection', 'learning')),
  title text check (char_length(title) <= 160),
  body text not null check (char_length(body) between 1 and 10000),
  minutes smallint check (minutes between 0 and 1440),
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index journal_user_date on public.journal_entries (user_id, entry_date);
create trigger journal_updated before update on public.journal_entries
  for each row execute function public.set_updated_at();

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period text not null check (period in ('week', 'month')),
  period_start date not null,
  went_well text check (char_length(went_well) <= 3000),
  difficult text check (char_length(difficult) <= 3000),
  learned text check (char_length(learned) <= 3000),
  change_next text check (char_length(change_next) <= 3000),
  proud text check (char_length(proud) <= 3000),
  shared boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period, period_start)
);
create trigger reviews_updated before update on public.reviews
  for each row execute function public.set_updated_at();

create table public.roadmap_notes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chapter_key text not null check (char_length(chapter_key) <= 20),
  objective text check (char_length(objective) <= 500),
  planned_actions text check (char_length(planned_actions) <= 3000),
  reflection text check (char_length(reflection) <= 3000),
  status_override text check (status_override in ('not_started', 'in_progress', 'complete', 'adjusted')),
  updated_at timestamptz not null default now(),
  primary key (user_id, chapter_key)
);
create trigger roadmap_notes_updated before update on public.roadmap_notes
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────── business ──
create table public.business_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  goal_metric text not null default 'revenue' check (goal_metric in ('revenue', 'cash', 'profit')),
  goal_amount numeric(12,2) not null default 10000 check (goal_amount > 0),
  goal_deadline date not null default '2027-05-24',
  baseline_revenue numeric(12,2) check (baseline_revenue >= 0),
  baseline_expenses numeric(12,2) check (baseline_expenses >= 0),
  baseline_confirmed_on date,
  forecast jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger business_settings_updated before update on public.business_settings
  for each row execute function public.set_updated_at();

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'other' check (kind in ('service', 'education', 'other')),
  description text check (char_length(description) <= 600),
  monthly_target numeric(12,2) check (monthly_target >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index businesses_user on public.businesses (user_id);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  price numeric(12,2) check (price >= 0),
  billing text not null default 'one_time' check (billing in ('one_time', 'monthly', 'installment')),
  term_months smallint check (term_months between 1 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index offers_business on public.offers (business_id);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  status text not null default 'active' check (status in ('active', 'paused', 'churned')),
  source text check (char_length(source) <= 80),
  started_on date,
  churned_on date,
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  check (churned_on is null or started_on is null or churned_on >= started_on)
);
create index customers_business on public.customers (business_id);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  kind text not null check (kind in ('sale', 'refund', 'expense', 'gig_income', 'personal_income', 'transfer')),
  txn_date date not null,
  amount numeric(12,2) not null check (amount > 0 and amount <= 10000000),
  description text check (char_length(description) <= 200),
  customer_id uuid references public.customers(id) on delete set null,
  offer_id uuid references public.offers(id) on delete set null,
  recurring boolean not null default false,
  lead_source text check (char_length(lead_source) <= 80),
  expense_category text check (expense_category in
    ('software', 'advertising', 'contractors', 'delivery', 'education', 'fees', 'equipment', 'travel', 'other')),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Business kinds belong to a workspace; personal income and transfers never do.
  check ((kind in ('sale', 'refund', 'expense')) = (business_id is not null)),
  check (kind = 'sale' or recurring = false),
  check (kind = 'expense' or expense_category is null)
);
create index transactions_user_date on public.transactions (user_id, txn_date);
create trigger transactions_updated before update on public.transactions
  for each row execute function public.set_updated_at();

-- Cash received against a sale. Revenue is recognised on the sale's txn_date;
-- cash is recognised on each payment's paid_on. They are never interchangeable.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  paid_on date not null,
  amount numeric(12,2) not null check (amount > 0),
  method text check (char_length(method) <= 40),
  created_at timestamptz not null default now()
);
create index payments_transaction on public.payments (transaction_id);
create index payments_user_date on public.payments (user_id, paid_on);

create or replace function public.validate_payment() returns trigger
language plpgsql set search_path = '' as $$
declare
  t record;
  paid numeric;
begin
  select kind, amount, user_id into t from public.transactions where id = new.transaction_id;
  if t is null or t.user_id <> new.user_id then
    raise exception 'Payment must belong to one of your sales' using errcode = '23514';
  end if;
  if t.kind <> 'sale' then
    raise exception 'Payments can only be recorded against sales' using errcode = '23514';
  end if;
  select coalesce(sum(amount), 0) into paid from public.payments
    where transaction_id = new.transaction_id and id <> new.id;
  if paid + new.amount > t.amount + 0.004 then
    raise exception 'Cash collected (%) would exceed the sale amount (%)', paid + new.amount, t.amount
      using errcode = '23514';
  end if;
  return new;
end $$;
create trigger payments_validate before insert or update on public.payments
  for each row execute function public.validate_payment();

create or replace function public.validate_transaction_change() returns trigger
language plpgsql set search_path = '' as $$
declare
  paid numeric;
begin
  select coalesce(sum(amount), 0) into paid from public.payments where transaction_id = new.id;
  if paid > 0 and new.kind <> 'sale' then
    raise exception 'Remove the recorded payments before changing this sale''s type' using errcode = '23514';
  end if;
  if paid > new.amount + 0.004 then
    raise exception 'Sale amount cannot be less than cash already collected (%)', paid using errcode = '23514';
  end if;
  return new;
end $$;
create trigger transactions_validate before update on public.transactions
  for each row execute function public.validate_transaction_change();

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  contact text check (char_length(contact) <= 120),
  stage text not null default 'lead' check (stage in ('lead', 'contacted', 'conversation', 'proposal', 'won', 'lost')),
  value numeric(12,2) check (value >= 0),
  offer_id uuid references public.offers(id) on delete set null,
  source text check (char_length(source) <= 80),
  created_on date not null,
  closed_on date,
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index deals_business on public.deals (business_id);
create trigger deals_updated before update on public.deals
  for each row execute function public.set_updated_at();

create table public.activity_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  kind text not null default 'outreach' check (kind in ('outreach', 'content', 'sales', 'audience')),
  daily_target integer check (daily_target between 0 and 10000),
  weekly_target integer check (weekly_target between 0 and 70000),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index activity_metrics_business on public.activity_metrics (business_id);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  metric_id uuid not null references public.activity_metrics(id) on delete cascade,
  log_date date not null,
  count integer not null check (count between 0 and 100000),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  unique (metric_id, log_date)
);
create index activity_logs_user_date on public.activity_logs (user_id, log_date);

-- ──────────────────────────────────────────────────────────── achievements ──
create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null check (char_length(key) <= 80),
  category text not null check (category in ('weight', 'business', 'athletic', 'habit', 'level')),
  tier text not null default 'minor' check (tier in ('minor', 'major')),
  title text not null check (char_length(title) <= 160),
  detail text check (char_length(detail) <= 400),
  value numeric,
  achieved_on date not null,
  celebrated_at timestamptz,
  photo_id uuid references public.progress_photos(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

-- ═══════════════════════════════════════════════════════ access helpers ══
create or replace function public.level_rank(lvl text) returns integer
language sql immutable as $$
  select case lvl
    when 'percent' then 1 when 'summary' then 1
    when 'pounds' then 2 when 'full' then 3 else 0 end
$$;

create or replace function public.partner_of(uid uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when p.user_a = uid then p.user_b else p.user_a end
  from public.partnerships p
  where p.status = 'active' and (p.user_a = uid or p.user_b = uid)
  limit 1
$$;

create or replace function public.share_level(owner uuid, category text) returns text
language sql stable security definer set search_path = '' as $$
  select case category
    when 'weight' then s.weight when 'training' then s.training
    when 'habits' then s.habits when 'health' then s.health
    when 'photos' then s.photos when 'milestones' then s.milestones
    when 'business' then s.business else 'none' end
  from public.share_settings s where s.user_id = owner
$$;

-- True for the owner, or for the owner's active partner when the owner shares
-- `category` at `min_level` or above. This is what every SELECT policy uses.
create or replace function public.can_read(owner uuid, category text, min_level text default 'full')
returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then false
    when owner = auth.uid() then true
    when owner is distinct from public.partner_of(auth.uid()) then false
    else public.level_rank(coalesce(public.share_level(owner, category), 'none'))
         >= public.level_rank(min_level)
  end
$$;

create or replace function public.can_read_achievement(owner uuid, cat text) returns boolean
language sql stable security definer set search_path = '' as $$
  select owner = auth.uid() or (
    public.can_read(owner, 'milestones', 'full') and case cat
      when 'weight' then public.can_read(owner, 'weight', 'pounds')
      when 'business' then public.can_read(owner, 'business', 'summary')
      when 'athletic' then public.can_read(owner, 'training', 'summary')
      when 'habit' then public.can_read(owner, 'habits', 'summary')
      else true end)
$$;

create or replace function public.is_partner_of(owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and owner = public.partner_of(auth.uid())
$$;

-- ═══════════════════════════════════════════════════ row-level security ══
-- Owner-only write policies, generated for every user-owned table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'weight_entries', 'daily_checkins', 'symptom_logs', 'nutrition_logs', 'progress_photos',
    'workouts', 'strength_sets', 'habits', 'habit_completions', 'rest_days', 'tasks',
    'journal_entries', 'reviews', 'roadmap_notes', 'businesses', 'offers', 'customers',
    'transactions', 'payments', 'deals', 'activity_metrics', 'activity_logs', 'achievements',
    'notifications', 'body_goals', 'athletic_profiles', 'business_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_delete', t);
  end loop;
end $$;

-- Simple tables: insert/update own rows.
do $$
declare
  t text;
begin
  foreach t in array array[
    'weight_entries', 'daily_checkins', 'symptom_logs', 'nutrition_logs', 'progress_photos',
    'workouts', 'habits', 'rest_days', 'tasks', 'journal_entries', 'reviews', 'roadmap_notes',
    'businesses', 'notifications', 'body_goals', 'athletic_profiles', 'business_settings'
  ] loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_update', t);
  end loop;
end $$;

-- Child tables: the parent row must belong to the same user.
create or replace function public.owns(tbl text, row_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  found boolean;
begin
  if row_id is null then return true; end if;
  if tbl not in ('workouts', 'habits', 'businesses', 'offers', 'customers', 'transactions',
                 'activity_metrics', 'progress_photos') then
    raise exception 'owns(): unsupported table %', tbl;
  end if;
  execute format('select exists (select 1 from public.%I where id = $1 and user_id = $2)', tbl)
    into found using row_id, auth.uid();
  return found;
end $$;

create policy strength_sets_insert on public.strength_sets for insert to authenticated
  with check (user_id = (select auth.uid()) and public.owns('workouts', workout_id));
create policy strength_sets_update on public.strength_sets for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns('workouts', workout_id));

create policy habit_completions_insert on public.habit_completions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.owns('habits', habit_id));
create policy habit_completions_update on public.habit_completions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns('habits', habit_id));

do $$
declare
  t text;
begin
  foreach t in array array['offers', 'customers', 'deals', 'activity_metrics'] loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()) and public.owns(''businesses'', business_id))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.owns(''businesses'', business_id))',
      t || '_update', t);
  end loop;
end $$;

create policy transactions_insert on public.transactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.owns('businesses', business_id)
    and public.owns('customers', customer_id) and public.owns('offers', offer_id));
create policy transactions_update on public.transactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns('businesses', business_id)
    and public.owns('customers', customer_id) and public.owns('offers', offer_id));

create policy payments_insert on public.payments for insert to authenticated
  with check (user_id = (select auth.uid()) and public.owns('transactions', transaction_id));
create policy payments_update on public.payments for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns('transactions', transaction_id));

create policy activity_logs_insert on public.activity_logs for insert to authenticated
  with check (user_id = (select auth.uid()) and public.owns('activity_metrics', metric_id));
create policy activity_logs_update on public.activity_logs for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns('activity_metrics', metric_id));

create policy achievements_insert on public.achievements for insert to authenticated
  with check (user_id = (select auth.uid()) and public.owns('progress_photos', photo_id));
create policy achievements_update on public.achievements for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns('progress_photos', photo_id));

-- Read policies: owner, or partner at the shared level.
create policy weight_entries_select on public.weight_entries for select to authenticated
  using (public.can_read(user_id, 'weight', 'full'));
create policy body_goals_select on public.body_goals for select to authenticated
  using (public.can_read(user_id, 'weight', 'full'));
create policy progress_photos_select on public.progress_photos for select to authenticated
  using (public.can_read(user_id, 'photos', 'full'));

create policy daily_checkins_select on public.daily_checkins for select to authenticated
  using (public.can_read(user_id, 'health', 'full'));
create policy symptom_logs_select on public.symptom_logs for select to authenticated
  using (public.can_read(user_id, 'health', 'full'));
create policy nutrition_logs_select on public.nutrition_logs for select to authenticated
  using (public.can_read(user_id, 'health', 'full'));
create policy athletic_profiles_select on public.athletic_profiles for select to authenticated
  using (public.can_read(user_id, 'health', 'full'));

create policy workouts_select on public.workouts for select to authenticated
  using (public.can_read(user_id, 'training', 'full'));
create policy strength_sets_select on public.strength_sets for select to authenticated
  using (public.can_read(user_id, 'training', 'full'));

create policy habits_select on public.habits for select to authenticated
  using (public.can_read(user_id, 'habits', 'full'));
create policy habit_completions_select on public.habit_completions for select to authenticated
  using (public.can_read(user_id, 'habits', 'full'));
create policy rest_days_select on public.rest_days for select to authenticated
  using (public.can_read(user_id, 'habits', 'full'));
create policy tasks_select on public.tasks for select to authenticated
  using (public.can_read(user_id, 'habits', 'full'));

create policy journal_entries_select on public.journal_entries for select to authenticated
  using (user_id = (select auth.uid()) or (shared and public.is_partner_of(user_id)));
create policy reviews_select on public.reviews for select to authenticated
  using (user_id = (select auth.uid()) or (shared and completed_at is not null and public.is_partner_of(user_id)));
create policy roadmap_notes_select on public.roadmap_notes for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'business_settings', 'businesses', 'offers', 'customers', 'transactions', 'payments',
    'deals', 'activity_metrics', 'activity_logs'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_read(user_id, ''business'', ''full''))',
      t || '_select', t);
  end loop;
end $$;

create policy achievements_select on public.achievements for select to authenticated
  using (public.can_read_achievement(user_id, category));

-- Profiles, sharing, partnerships, reminders.
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_partner_of(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter table public.share_settings enable row level security;
create policy share_settings_select on public.share_settings for select to authenticated
  using (user_id = (select auth.uid()) or public.is_partner_of(user_id));
create policy share_settings_insert on public.share_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy share_settings_update on public.share_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.reminder_settings enable row level security;
create policy reminder_settings_select on public.reminder_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy reminder_settings_insert on public.reminder_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy reminder_settings_update on public.reminder_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Partnerships change only through the functions below.
alter table public.partnerships enable row level security;
create policy partnerships_select on public.partnerships for select to authenticated
  using (user_a = (select auth.uid()) or user_b = (select auth.uid()));

-- ══════════════════════════════════════════════════════ new-user setup ══
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  tz text := coalesce(nullif(new.raw_user_meta_data->>'timezone', ''), 'America/New_York');
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = tz) then
    tz := 'America/New_York';
  end if;
  insert into public.profiles (id, display_name, timezone)
  values (new.id, coalesce(left(trim(new.raw_user_meta_data->>'display_name'), 60), ''), tz);
  insert into public.share_settings (user_id) values (new.id);
  insert into public.reminder_settings (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════════════════════════════════════════════ partnerships ══
create or replace function public.create_invite() returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  code text;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if public.partner_of(me) is not null then
    raise exception 'You are already connected with a partner' using errcode = '23505';
  end if;
  delete from public.partnerships where user_a = me and status = 'pending';
  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.partnerships where invite_code = code);
  end loop;
  insert into public.partnerships (user_a, invite_code) values (me, code);
  return code;
end $$;

create or replace function public.accept_invite(code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  inv public.partnerships;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into inv from public.partnerships
    where invite_code = upper(trim(code)) and status = 'pending'
      and created_at > now() - interval '14 days'
    for update;
  if inv.id is null then
    raise exception 'That invite code is not valid or has expired' using errcode = 'P0002';
  end if;
  if inv.user_a = me then
    raise exception 'You cannot accept your own invite' using errcode = '22023';
  end if;
  if public.partner_of(me) is not null or public.partner_of(inv.user_a) is not null then
    raise exception 'One of you is already connected with a partner' using errcode = '23505';
  end if;
  update public.partnerships set user_b = me, status = 'active', accepted_at = now()
    where id = inv.id;
  delete from public.partnerships where user_a = me and status = 'pending';
  return inv.user_a;
end $$;

create or replace function public.end_partnership() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.partnerships set status = 'ended', ended_at = now()
    where status = 'active' and (user_a = auth.uid() or user_b = auth.uid());
end $$;

-- ═════════════════════════════════════════════════ partner overview ══
-- Returns the partner's high-level progress, containing only the fields their
-- share_settings allow. Raw rows stay behind RLS; this is the summary path.
-- The arithmetic mirrors src/lib/calc (weight trend = mean of the 7 calendar
-- days ending on the latest weigh-in).
create or replace function public.get_partner_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  p uuid;
  s public.share_settings;
  prof public.profiles;
  g public.body_goals;
  ap public.athletic_profiles;
  bs public.business_settings;
  today date;
  wk date;
  mo date;
  latest date;
  trend numeric;
  lost numeric;
  w jsonb;
  res jsonb;
  v_sched int;
  v_done int;
  t_sched int;
  t_done int;
  rev numeric;
  cash numeric;
  v_exp numeric;
  refunds numeric;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  p := public.partner_of(me);
  if p is null then return null; end if;

  select * into s from public.share_settings where user_id = p;
  select * into prof from public.profiles where id = p;
  today := coalesce(prof.demo_today, (now() at time zone prof.timezone)::date);
  wk := today - (extract(isodow from today)::int - 1);
  mo := date_trunc('month', today)::date;

  res := jsonb_build_object(
    'partner_id', p,
    'display_name', prof.display_name,
    'today', today,
    'demo_mode', prof.demo_mode,
    'levels', jsonb_build_object(
      'weight', s.weight, 'training', s.training, 'habits', s.habits, 'health', s.health,
      'photos', s.photos, 'milestones', s.milestones, 'business', s.business));

  -- Weight
  if s.weight <> 'none' then
    select * into g from public.body_goals where user_id = p;
    select max(entry_date) into latest from public.weight_entries
      where user_id = p and weight is not null;
    if latest is not null then
      select round(avg(weight), 2) into trend from public.weight_entries
        where user_id = p and weight is not null and entry_date between latest - 6 and latest;
    end if;
    if g.start_weight is not null and g.target_loss is not null then
      lost := case when trend is null then 0 else round(g.start_weight - trend, 1) end;
      w := jsonb_build_object(
        'has_goal', true,
        'pct_primary', round(least(100, greatest(0, lost / g.target_loss * 100)), 1),
        'pct_stretch', case when g.stretch_loss is null then null
          else round(least(100, greatest(0, lost / g.stretch_loss * 100)), 1) end);
      if s.weight in ('pounds', 'full') then
        w := w || jsonb_build_object(
          'lost', lost,
          'target_loss', g.target_loss,
          'stretch_loss', g.stretch_loss,
          'remaining', greatest(0, round(g.target_loss - lost, 1)),
          'next_milestone', (floor(greatest(lost, 0) / 5) + 1) * 5);
      end if;
      if s.weight = 'full' then
        w := w || jsonb_build_object(
          'start_weight', g.start_weight,
          'current_trend', trend,
          'target_weight', g.start_weight - g.target_loss,
          'latest_entry', latest);
      end if;
    else
      w := jsonb_build_object('has_goal', false);
    end if;
    res := res || jsonb_build_object('weight', w);
  end if;

  -- Training
  if s.training <> 'none' then
    select * into ap from public.athletic_profiles where user_id = p;
    res := res || jsonb_build_object('training', jsonb_build_object(
      'week_start', wk,
      'sessions_week', (select count(*) from public.workouts
        where user_id = p and workout_date between wk and today and activity <> 'recovery'),
      'session_target', coalesce(ap.weekly_session_target, 3),
      'run_miles_week', (select coalesce(sum(distance_mi), 0) from public.workouts
        where user_id = p and workout_date between wk and today and activity in ('run', 'run_walk')),
      'longest_run', (select coalesce(max(distance_mi), 0) from public.workouts
        where user_id = p and activity in ('run', 'run_walk')),
      'strength_week', (select count(*) from public.workouts
        where user_id = p and workout_date between wk and today and activity = 'strength'),
      'total_workouts', (select count(*) from public.workouts
        where user_id = p and activity <> 'recovery'),
      'phase', coalesce(ap.phase, 'foundation'),
      'goal_text', coalesce(ap.goal_text, 'Complete a 10K'),
      'race_name', ap.race_name,
      'race_date', ap.race_date));
  end if;

  -- Habits
  if s.habits <> 'none' then
    with days as (
      select d::date as d from generate_series(wk, today, interval '1 day') d
    ), sched as (
      select h.id, days.d from public.habits h cross join days
      where h.user_id = p and h.start_date <= days.d
        and (h.archived_on is null or h.archived_on > days.d)
        and extract(dow from days.d)::smallint = any (h.schedule_days)
        and not (h.skip_on_rest_days and exists (
          select 1 from public.rest_days r where r.user_id = p and r.rest_date = days.d))
    )
    select count(*), count(c.id),
           count(*) filter (where sched.d = today), count(c.id) filter (where sched.d = today)
      into v_sched, v_done, t_sched, t_done
      from sched left join public.habit_completions c
        on c.habit_id = sched.id and c.completed_on = sched.d;
    res := res || jsonb_build_object('habits', jsonb_build_object(
      'today_scheduled', t_sched, 'today_done', t_done,
      'week_scheduled', v_sched, 'week_done', v_done,
      'week_pct', case when v_sched = 0 then null else round(v_done::numeric / v_sched * 100, 1) end));
  end if;

  -- Business (summary = progress toward the goal metric only)
  if s.business <> 'none' then
    select * into bs from public.business_settings where user_id = p;
    select coalesce(sum(amount) filter (where kind = 'sale'), 0),
           coalesce(sum(amount) filter (where kind = 'refund'), 0),
           coalesce(sum(amount) filter (where kind = 'expense'), 0)
      into rev, refunds, v_exp
      from public.transactions
      where user_id = p and txn_date >= mo and txn_date <= (mo + interval '1 month - 1 day')::date;
    select coalesce(sum(amount), 0) into cash from public.payments
      where user_id = p and paid_on >= mo and paid_on <= (mo + interval '1 month - 1 day')::date;
    res := res || jsonb_build_object('business', jsonb_build_object(
      'month', mo,
      'metric', coalesce(bs.goal_metric, 'revenue'),
      'goal', coalesce(bs.goal_amount, 10000),
      'value', case coalesce(bs.goal_metric, 'revenue')
        when 'cash' then cash - refunds
        when 'profit' then rev - refunds - v_exp
        else rev - refunds end));
  end if;

  return res;
end $$;

-- ══════════════════════════════════════════════════════════ data reset ══
-- Deletes every record the caller owns (used by "Reset demo" and "Delete all
-- my data"). Runs as the caller, so RLS limits it to their own rows.
create or replace function public.reset_my_data() returns void
language plpgsql security invoker set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  delete from public.achievements where user_id = me;
  delete from public.notifications where user_id = me;
  delete from public.payments where user_id = me;
  delete from public.transactions where user_id = me;
  delete from public.activity_logs where user_id = me;
  delete from public.activity_metrics where user_id = me;
  delete from public.deals where user_id = me;
  delete from public.customers where user_id = me;
  delete from public.offers where user_id = me;
  delete from public.businesses where user_id = me;
  delete from public.business_settings where user_id = me;
  delete from public.strength_sets where user_id = me;
  delete from public.workouts where user_id = me;
  delete from public.athletic_profiles where user_id = me;
  delete from public.habit_completions where user_id = me;
  delete from public.habits where user_id = me;
  delete from public.rest_days where user_id = me;
  delete from public.tasks where user_id = me;
  delete from public.journal_entries where user_id = me;
  delete from public.reviews where user_id = me;
  delete from public.roadmap_notes where user_id = me;
  delete from public.progress_photos where user_id = me;
  delete from public.symptom_logs where user_id = me;
  delete from public.nutrition_logs where user_id = me;
  delete from public.daily_checkins where user_id = me;
  delete from public.weight_entries where user_id = me;
  delete from public.body_goals where user_id = me;
  update public.profiles
    set onboarding_done = false, demo_mode = false, demo_today = null,
        plan_preset = null, business_enabled = false
    where id = me;
end $$;

-- ═════════════════════════════════════════════════════════════ grants ══
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.partnerships from authenticated;
revoke insert, delete on public.profiles from authenticated;
grant execute on function
  public.create_invite(), public.accept_invite(text), public.end_partnership(),
  public.get_partner_overview(), public.reset_my_data(),
  public.can_read(uuid, text, text), public.can_read_achievement(uuid, text),
  public.is_partner_of(uuid), public.partner_of(uuid), public.share_level(uuid, text),
  public.level_rank(text), public.owns(text, uuid)
  to authenticated;

-- ═══════════════════════════════════════════════ progress photo storage ══
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.can_read_photo_path(path text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  folder text := split_part(path, '/', 1);
begin
  if folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.can_read(folder::uuid, 'photos', 'full');
end $$;
grant execute on function public.can_read_photo_path(text) to authenticated;

create policy "progress photos: read own or shared" on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and public.can_read_photo_path(name));
create policy "progress photos: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy "progress photos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and split_part(name, '/', 1) = (select auth.uid())::text);

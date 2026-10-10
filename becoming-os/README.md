# BECOMING OS

**Build the body. Build the business. Build the man.**
*Every action recorded. Every milestone earned. Every month a new chapter.*

A private, two-person transformation tracker for **Oct 10, 2026 – May 24, 2027**
(226 days between the dates; 227 calendar dates counting both). Each of you has your
own login and records; you choose exactly what the other can see.

React + TypeScript + Vite + Tailwind on Supabase (Postgres, Auth, Storage) — the same
stack Lovable generates. Setup: **[DEPLOY.md](DEPLOY.md)**.

---

## What's in it

| Area | Where | What it does |
|---|---|---|
| Today | `/` | Countdown (day N of 227, days left, % elapsed), today's scheduled habits and tasks with an execution score, next milestone, progress cards, this week's results |
| Logging | `/log` | Weigh-ins, waist, check-ins (sleep, energy, soreness, fatigue, water), pain & symptoms, progress photos, workouts with sets/reps/weights, meals and macros, business transactions, outreach/content counts, habits, journal |
| Body | `/progress` | 7-day-average trend, 50 lb and 60 lb meters, weekly averages, waist, plan vs. sustainable pace, weight milestones with photos, full history |
| Train | `/train` | Injury awareness, five-phase 10K roadmap gated on clearance, weekly sessions/miles, longest-run progression, pain chart, strength records |
| Business | `/business`, `/business/:id` | Revenue earned vs. cash collected vs. expenses vs. profit, MRR, receivables, customers & churn, pipeline, offers, outreach targets, estimate forecast, CSV export, per-business workspaces |
| Habits | `/habits` | Per-day schedules (weekday/weekend), rest days, streaks, tasks |
| Reviews | `/reviews` | Weekly and monthly reviews from saved records, observations, priorities, five-question reflection |
| Roadmap | `/roadmap` | Eight chapters with planned and re-planned targets, actual results, notes |
| Milestones | `/achievements` | Level, XP, every milestone (locked/unlocked), permanent timeline, shareable cards |
| Charts | `/charts` | Every metric with date ranges and previous-period comparison |
| Together | `/together` | Invite code, partner progress (as shared), shared milestones and reflections |
| Settings | `/settings` | Goals, readiness, privacy, reminders, JSON/CSV export, reset |

## How the numbers work

All metrics are recomputed from saved records on every change (`src/lib/calc/`), so
editing or deleting anything updates every meter, chart and milestone.

**Weight.** Progress uses the **7-day average**: the mean of every weigh-in in the
seven calendar days ending on the latest one. Pounds lost = confirmed start − 7-day
average. Meters cap at 100%; the real change keeps showing past the goal.
Day-to-day jumps larger than normal water swings (≈5 lb, plus ½ lb per extra day
between weigh-ins) ask for confirmation before saving.

**Business.** Four separate measures, never interchanged:
revenue earned (sales on their date, net of refunds) · cash collected (payments on
the date received) · expenses · net profit (revenue − expenses). Unpaid sales show as
receivables. Gig income, personal income and transfers between your own accounts are
kept on record but never count toward any business figure. The $10,000 goal measures
revenue by default; switch it to cash or profit in Settings.

**Milestones** are rules over your records, dated the first day the records met them.
Because they look at history, a heavier week or a slower month never takes one away.
Correcting or deleting the record that earned one does.

- Weight: every 5 lb on the 7-day average, plus the exact goal and stretch goal.
- Business: $1K → $10K within one calendar month (the day month-to-date crosses it),
  $10K sustained three consecutive months, first client, first recurring customer,
  first $1K of recurring revenue in a month, ten customers, first profitable month
  (completed months only), best month yet.
- Athletic: first consistent week, first pain-free run (logged pain 0/10), first
  continuous mile, 2 mi, 5K, 4 mi, 5 mi, 10K, 10K race, four consecutive weeks on
  plan, ten strength sessions.
- Consistency: seven days logging, four weeks at ≥80% of scheduled habits, thirty
  workouts, thirty days of business tracking, sleep & recovery, weekly reviews.

**XP** comes from logging and completing planned actions, with daily caps — at most
two workouts a day count, and nothing rewards extra volume, eating less or weight
change. Missed days never subtract XP. **Levels** (The Beginner → The Transformed)
need both XP and milestones.

**Training.** Running phases stay locked until readiness is *No current injury* or
*Assessed — clinician OK'd running*. Sharp pain, pain ≥ 5/10, or symptoms on 3+ days
in two weeks prompt a medical assessment. The app reports; it never clears anyone
to run or prescribes mileage.

**Roadmap targets** start from the confirmed baseline and are re-planned from current
results at no more than your pace setting (≤1% of body weight and ≤2 lb per week).
If the goal can't be reached safely by May 24, the roadmap shows a later date rather
than an unsafe rate.

## Privacy

Enforced in Postgres with row-level security, not by hiding things on screen:

- Every row belongs to one user; only the owner can insert, update or delete it.
- A partner can read rows only through an active partnership, and only at the level
  the owner chose per category — weight (hidden / % of goal / pounds / full),
  training, habits, health, photos, milestones, business.
- Defaults: weight as % of goal, training and habit summaries, milestones shared;
  **health, photos, journal and all business finances private.**
- Summaries reach the partner through `get_partner_overview()`, which returns only
  the fields the owner's settings allow.
- Journal entries and reflections are shared one at a time, never by default.
- Photos live in a private bucket and are served through short-lived signed URLs.

## Tests

```bash
npm test             # 57 unit tests: dates, weight, business, habits, training, XP, milestones, roadmap, reviews
npm run typecheck
DATABASE_URL=postgres://… npm run test:db   # RLS tests, run as real authenticated/anon roles
npm run test:e2e     # Playwright: the 15 core workflows, end to end, against a running stack
```

The E2E run signs up two test accounts, confirms starting weights, logs weigh-ins (and
a typo that gets caught), unlocks and celebrates the 5 lb milestone, records a sale,
an expense and gig income and checks revenue/cash/profit stay separate, unlocks and
re-locks revenue milestones by adding and deleting a sale, logs a workout, completes
a habit, edits a weigh-in and watches the milestone re-lock, connects the accounts
and checks through the REST API that the database withholds what isn't shared,
completes a weekly review, checks the countdown, and signs out and back in.

`scripts/local-stack.sh` runs a Supabase-compatible stack (Postgres + GoTrue +
PostgREST + Storage) without the Supabase CLI; `supabase start` works too.

## Layout

```
supabase/migrations/   schema, RLS policies, sharing functions, storage bucket
supabase/tests/        SQL tests for the access policies
src/lib/calc/          pure calculation engines (no I/O) — the source of every number
src/data/              Supabase client, auth, data loading, milestone sync, partner reads
src/components/        design system, charts, forms, celebration
src/pages/             one file per screen
tests/                 unit (Vitest) and end-to-end (Playwright)
```

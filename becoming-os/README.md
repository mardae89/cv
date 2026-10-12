# BECOMING OS

**Build the body. Build the business. Build the man.**
*Every action recorded. Every milestone earned. Every month a new chapter.*

A private, two-person transformation tracker for **Oct 10, 2026 – May 24, 2027**
(226 days between the dates; 227 calendar dates counting both). Each of you has your
own records; you choose exactly what the other can see.

**Nothing to set up.** No database, no accounts, no keys. It's one self-contained
HTML page (React + TypeScript + Vite + Tailwind, built into a single file):

- **As your private claude.ai page** — records sync across your devices and between
  the two of you, each person's records private to them.
- **As a plain file** (`dist-page/becoming-os.html`) — open it in any browser; records
  stay in that browser only.

How to start: **[DEPLOY.md](DEPLOY.md)**.

---

## What's in it

| Area | Where | What it does |
|---|---|---|
| Today | `/` | Countdown (day N of 227, days left, % elapsed), today's scheduled habits and tasks with an execution score, next milestone, progress cards, this week's results |
| Power List | `/power` | The daily non-negotiables (wake 5:45am, both exercise sessions, food logged, 6 stories, 2 shorts, 5 pages, no impulsive purchases, bed by 10:30pm, plus the filming/editing schedule), day ring, PCR by week or month with 75/80/90 ratings, weekly analysis, calendar coloured by the day's score (bright green 90%+, green 75%+, orange over 50%, red 50% or under), trend, previous weeks, "who you're becoming" evidence |
| Content Bank | `/content` | Release today: pick short or long form and see ten open ideas at a time (priority sections first), with Next. Today's slate (crossed out when done), filming focus, the week's release schedule. The bank of 129 ideas — 10 per page, filter by format, funnel stage, CTA, section, status. Your strategy (positioning, tone, goal, rules), editable, and what each section is for |
| Traffic | `/traffic` | The four numbers — people reached, conversations, invitations, members — by channel, weekly totals, conversion, the daily ten, where to find people |
| Logging | `/log` | Weigh-ins, waist, check-ins (sleep, energy, soreness, fatigue, water), pain & symptoms, progress photos, workouts with sets/reps/weights, meals and macros, business transactions, outreach/content counts, habits, journal |
| Body | `/progress` | 7-day-average trend, 50 lb and 60 lb meters, weekly averages, waist, plan vs. sustainable pace, weight milestones with photos, full history |
| Train | `/train` | Injury awareness, five-phase 10K roadmap gated on clearance, weekly sessions/miles, longest-run progression, pain chart, strength records |
| Business | `/business`, `/business/:id` | Revenue earned vs. cash collected vs. expenses vs. profit, MRR, receivables, customers & churn, pipeline, offers, outreach targets, estimate forecast, CSV export, per-business workspaces |
| Habits | `/habits` | Per-day schedules (weekday/weekend), rest days, streaks, tasks |
| Reviews | `/reviews` | Weekly and monthly reviews from saved records, observations, priorities, five-question reflection |
| Roadmap | `/roadmap` | Eight chapters with planned and re-planned targets, actual results, notes |
| Milestones | `/achievements` | Level, XP, every milestone (locked/unlocked), permanent timeline, shareable cards |
| Charts | `/charts` | Every metric with date ranges and previous-period comparison |
| Together | `/together` | Partner progress (as shared), shared milestones and reflections, your sharing levels |
| Settings | `/settings` | Day or Night theme, your reasons and "who I'm becoming", content targets and release days (short form and long form), goals, readiness, privacy, reminders, where your records are stored, backup export/import, reset |

## How the numbers work

**Power List Completion Rate (PCR).** Items completed ÷ items due, over a day,
week or month. A finished day is bright green at 90%+, green at 75%+, orange above
50% and red at 50% or under; today shows as in progress until it reaches green.
75%+ is good, 80%+ great, 90%+ exceptional. A week's score is given once the week
ends. Some items fill in from other records: exercise sessions from logged
workouts, "log food" from meal logs, shorts from videos checked off in the Content Bank,
and (optionally) a reach item from people reached in Traffic.

**Content targets.** The short-form target (2 a day by default) applies on your
short-form release days; long-form (4 a week) is slotted in on long-form release
days (Mon–Thu by default) until the week's target is met. Both are set in
Settings → Power List & motivation.

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

## Where records live

All storage goes through one small engine (`src/data/engine.ts`) that enforces the
rules a database would: unique dates (one weigh-in per day, one check-in per day…),
records that must belong to a parent (a set to its workout, a payment to its sale),
deletes that cascade or unlink, payments only against sales and never above the sale
amount. Records are grouped by month into documents, saved in the background with
retries; the app shows "Saving…" or the error if a save can't get through.

| Running as | Stored in | Syncs? |
|---|---|---|
| Your claude.ai page | The page's own database: `data/users/<you>/…` | Across your devices, live |
| Any other browser / the downloaded file | IndexedDB in that browser | No — export backups |

## Privacy

- On the claude.ai page, each person's records sit under `data/users/<their id>/`,
  which the platform keeps private to that person — **including from the page's
  owner**. Not a screen-level filter: the other person's app can't read it.
- The only thing your partner can read is a summary your own app writes to
  `shared/<your id>` from your sharing levels per category — weight (hidden / % of
  goal / pounds / full), training, habits, health, photos, milestones, business.
  A category set to hidden never leaves your private space; milestones in a hidden
  category are left out too.
- Defaults: weight as % of goal, training and habit summaries, milestones shared;
  **health, photos, journal and all business finances private.**
- Journal entries and reflections are shared one at a time, never by default.
- Photos are stored downscaled in your private space and never in the summary.

## Tests

```bash
npm test             # unit tests: dates, weight, business, habits, training, XP, milestones,
                     # roadmap, reviews, the storage engine and the partner summary
npm run typecheck
npm run test:e2e     # Playwright: the 15 core workflows (browser storage), plus two people
                     # sharing through a stand-in for the claude.ai page database
npm run build:page   # → dist-page/becoming-os.html and the claude.ai page variant
```

## Layout

```
src/lib/calc/          pure calculation engines (no I/O) — the source of every number
src/data/              storage engine, storage back-ends, host detection, partner summary
src/components/        design system, charts, forms, celebration
src/pages/             one file per screen
tests/                 unit (Vitest) and end-to-end (Playwright)
dist-page/             the built single-file app (plain file + claude.ai page variant)
```

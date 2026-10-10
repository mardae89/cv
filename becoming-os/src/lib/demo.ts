// Sample data for an explicitly labelled demo account. Generated
// deterministically for Oct 10 – Dec 15, 2026, with the app's clock set to
// Dec 15 so the dashboard reads as it would ten weeks in. None of these values
// describe a real person or business.
import { addDays, dateRange, dow, monthStart, weekStart } from "./dates";
import { BUSINESS_TEMPLATES, HABIT_TEMPLATES } from "./templates";

export const DEMO_TODAY = "2026-12-15";
const START = "2026-10-10";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const uuid = () => crypto.randomUUID();
const r1 = (n: number) => Math.round(n * 10) / 10;

export type DemoPlan = { table: string; rows: Record<string, unknown>[] }[];

export function buildDemo(uid: string): DemoPlan {
  const rand = rng(20261010);
  const days = dateRange(START, DEMO_TODAY);
  const u = <T extends Record<string, unknown>>(rows: T[]) => rows.map((r) => ({ user_id: uid, ...r }));

  // ── body
  const weights = days.filter(() => rand() < 0.86).map((d, i, arr) => {
    const weeks = (Date.parse(d) - Date.parse(START)) / 6.048e8;
    const w = 250 - 1.55 * weeks + (rand() - 0.5) * 2.4 + Math.sin(i / 3) * 0.4;
    return { entry_date: d, weight: r1(i === 0 ? 250 : w), waist_in: dow(d) === 1 ? r1(46 - weeks * 0.22) : null, note: i === arr.length - 1 ? "Demo weigh-in" : null };
  });
  const checkins = days.filter(() => rand() < 0.8).map((d) => ({
    checkin_date: d,
    sleep_hours: r1(6.2 + rand() * 2),
    sleep_quality: 2 + Math.floor(rand() * 4),
    energy: 2 + Math.floor(rand() * 4),
    soreness: 1 + Math.floor(rand() * 3),
    fatigue: 1 + Math.floor(rand() * 3),
    water_oz: Math.round(64 + rand() * 48),
  }));
  const symptoms = [
    { log_date: "2026-10-11", pain_level: 4, pain_type: "aching", during: "walking", side: "right" },
    { log_date: "2026-10-14", pain_level: 3, pain_type: "aching", during: "stairs", side: "right" },
    { log_date: "2026-10-19", pain_level: 2, pain_type: "stiffness", during: "morning", side: "right" },
    { log_date: "2026-10-26", pain_level: 1, pain_type: "stiffness", during: "morning", side: "right" },
  ].map((s) => ({ ...s, body_area: "Ankle", note: "Demo symptom log" }));
  const nutrition = days.filter(() => rand() < 0.6).flatMap((d) =>
    (["breakfast", "lunch", "dinner"] as const).filter(() => rand() < 0.85).map((meal) => ({
      log_date: d, meal, description: `Demo ${meal}`,
      calories: Math.round(450 + rand() * 350), protein_g: Math.round(30 + rand() * 25),
      carbs_g: Math.round(30 + rand() * 50), fat_g: Math.round(12 + rand() * 18),
    })));

  // ── training
  const workouts: Record<string, unknown>[] = [];
  const sets: Record<string, unknown>[] = [];
  let runDist = 1.0;
  for (const d of days) {
    const wd = dow(d);
    const nov = d >= "2026-11-01";
    if (rand() < 0.12) continue; // missed sessions happen
    if (wd === 1 || wd === 4) {
      const id = uuid();
      const wk = Math.floor((Date.parse(d) - Date.parse(START)) / 6.048e8);
      workouts.push({ id, workout_date: d, activity: "strength", title: "Full body (demo)", duration_min: 45, rpe: 7, intensity: "moderate" });
      for (const [ex, base] of [["Goblet squat", 35], ["Dumbbell bench press", 30], ["Seated row", 70], ["Romanian deadlift", 65]] as const) {
        for (let s = 1; s <= 3; s++) sets.push({ id: uuid(), workout_id: id, exercise: ex, set_no: s, reps: 10, weight_lb: base + wk * 2.5 });
      }
    } else if (wd === 2 || wd === 6) {
      if (!nov) {
        workouts.push({ id: uuid(), workout_date: d, activity: wd === 2 ? "cycle" : "walk", duration_min: 35, distance_mi: wd === 2 ? 7 : 2, intensity: "easy", rpe: 4 });
      } else {
        runDist = Math.min(3.4, runDist + 0.12);
        const continuous = d >= "2026-11-24" && wd === 2;
        workouts.push({
          id: uuid(), workout_date: d, activity: continuous ? "run" : "run_walk",
          distance_mi: continuous ? r1(Math.min(1.6, runDist * 0.6)) : r1(runDist),
          duration_min: Math.round((continuous ? Math.min(1.6, runDist * 0.6) : runDist) * 13.5),
          intensity: "easy", rpe: 5, pain_level: 0, notes: "Demo session",
        });
      }
    } else if (wd === 0 && rand() < 0.5) {
      workouts.push({ id: uuid(), workout_date: d, activity: "recovery", duration_min: 20, recovery_notes: "Demo mobility" });
    }
  }

  // ── habits
  const chosen = HABIT_TEMPLATES.filter((t) => t.defaultOn);
  const habits = chosen.map((t, i) => ({
    id: uuid(), name: t.name, category: t.category, schedule_days: t.schedule_days,
    skip_on_rest_days: t.skip_on_rest_days ?? false, xp: t.xp ?? 10, start_date: START, sort_order: i,
  }));
  const restDays = days.filter((d) => dow(d) === 0 && rand() < 0.6).map((d) => ({ rest_date: d, note: "Demo rest day" }));
  const restSet = new Set(restDays.map((r) => r.rest_date));
  const completions: Record<string, unknown>[] = [];
  for (const h of habits) {
    for (const d of days) {
      if (!h.schedule_days.includes(dow(d)) || (h.skip_on_rest_days && restSet.has(d))) continue;
      const p = d < "2026-10-25" ? 0.68 : 0.86;
      if (rand() < p) completions.push({ habit_id: h.id, completed_on: d });
    }
  }
  const tasks = [
    { title: "Book ankle assessment (demo)", due_date: "2026-10-13", completed_on: "2026-10-13", category: "body" },
    { title: "Send 3 proposals (demo)", due_date: DEMO_TODAY, completed_on: null, category: "business" },
    { title: "Plan holiday training days (demo)", due_date: DEMO_TODAY, completed_on: DEMO_TODAY, category: "training" },
  ];
  const journal = days.filter((d) => dow(d) === 0).map((d, i) => ({
    entry_date: d, kind: i % 3 === 2 ? "learning" : "journal",
    title: `Week ${i + 1} (demo)`, body: "Sample journal entry for the demo account.", minutes: i % 3 === 2 ? 30 : null,
  }));
  const reviews = days.filter((d) => dow(d) === 0 && d > "2026-10-18").slice(0, 7).map((d) => ({
    period: "week", period_start: weekStart(d), went_well: "Demo: hit most sessions.", difficult: "Demo: late nights midweek.",
    learned: "Demo: planning the day before helps.", change_next: "Demo: lights out by 10:30.", proud: "Demo: stayed consistent.",
    completed_at: `${d}T21:00:00Z`,
  }));

  // ── business
  const [lrgT, emT] = BUSINESS_TEMPLATES;
  const lrg = uuid(), em = uuid();
  const businesses = [
    { id: lrg, name: lrgT.name, kind: lrgT.kind, description: lrgT.description, monthly_target: 6000, sort_order: 0 },
    { id: em, name: emT.name, kind: emT.kind, description: emT.description, monthly_target: 4000, sort_order: 1 },
  ];
  const offerIds: Record<string, string> = {};
  const offers = [
    ...lrgT.offers.map((o, i) => ({ ...o, price: i === 0 ? 997 : 497, business_id: lrg })),
    ...emT.offers.map((o) => ({ ...o, business_id: em })),
  ].map((o) => {
    const id = uuid();
    offerIds[o.name] = id;
    return { id, ...o };
  });
  const metricRows = [
    ...lrgT.metrics.map((m, i) => ({ ...m, business_id: lrg, weekly_target: [100, 50, 75, 25, 30, 3, 2][i], sort_order: i })),
    ...emT.metrics.map((m, i) => ({ ...m, business_id: em, weekly_target: [5, 1, 5, null, null, null][i], sort_order: i })),
  ].map((m) => ({ id: uuid(), ...m }));
  const activityLogs: Record<string, unknown>[] = [];
  for (const m of metricRows) {
    for (const d of days) {
      if (dow(d) === 0 || dow(d) === 6 || rand() < 0.15) continue;
      const base = m.weekly_target ? m.weekly_target / 5 : m.label === "Website visits" ? 40 : m.label === "Email leads" ? 3 : 1;
      const n = Math.max(0, Math.round(base * (0.5 + rand() * 0.9)));
      if (n > 0) activityLogs.push({ metric_id: m.id, log_date: d, count: n });
    }
  }

  const customers: Record<string, unknown>[] = [];
  const transactions: Record<string, unknown>[] = [];
  const payments: Record<string, unknown>[] = [];
  const addCustomer = (business_id: string, name: string, started_on: string, extra: Record<string, unknown> = {}) => {
    const id = uuid();
    customers.push({ id, business_id, name, started_on, source: "Demo", ...extra });
    return id;
  };
  const addSale = (business_id: string, date: string, amount: number, o: { customer?: string; offer?: string; recurring?: boolean; paid?: number; paidOn?: string; lead?: string }) => {
    const id = uuid();
    transactions.push({
      id, business_id, kind: "sale", txn_date: date, amount, customer_id: o.customer ?? null,
      offer_id: o.offer ? offerIds[o.offer] : null, recurring: !!o.recurring, lead_source: o.lead ?? null, description: "Demo sale",
    });
    const paid = o.paid ?? amount;
    if (paid > 0) payments.push({ transaction_id: id, paid_on: o.paidOn ?? date, amount: paid });
  };

  // Lost Revenue Group: two clients on setup + monthly retainer.
  const c1 = addCustomer(lrg, "Demo HVAC Co. A", "2026-10-22");
  addSale(lrg, "2026-10-22", 997, { customer: c1, offer: "Revenue recovery setup fee", lead: "LinkedIn" });
  addSale(lrg, "2026-11-01", 497, { customer: c1, offer: "Revenue recovery system (monthly)", recurring: true });
  addSale(lrg, "2026-12-01", 497, { customer: c1, offer: "Revenue recovery system (monthly)", recurring: true });
  const c2 = addCustomer(lrg, "Demo HVAC Co. B", "2026-11-18");
  addSale(lrg, "2026-11-18", 997, { customer: c2, offer: "Revenue recovery setup fee", lead: "Cold email", paid: 500, paidOn: "2026-11-18" });
  addSale(lrg, "2026-12-01", 497, { customer: c2, offer: "Revenue recovery system (monthly)", recurring: true, paidOn: "2026-12-03" });
  const c3 = addCustomer(lrg, "Demo HVAC Co. C", "2026-12-08");
  addSale(lrg, "2026-12-08", 997, { customer: c3, offer: "Revenue recovery setup fee", lead: "Referral" });

  // Exchange Mastery: course sales, community members, one mentorship.
  let memberN = 0;
  const members: string[] = [];
  for (const m of ["2026-10-01", "2026-11-01", "2026-12-01"]) {
    const monthDays = days.filter((d) => monthStart(d) === m);
    const courseSales = m === "2026-10-01" ? 3 : m === "2026-11-01" ? 6 : 5;
    for (let i = 0; i < courseSales; i++) {
      const d = monthDays[Math.floor(rand() * monthDays.length)];
      addSale(em, d, 197, { customer: addCustomer(em, `Demo student ${++memberN}`, d), offer: "Trading course", lead: "YouTube" });
    }
    const newMembers = m === "2026-10-01" ? 4 : 5;
    for (let i = 0; i < newMembers; i++) members.push(addCustomer(em, `Demo member ${++memberN}`, monthDays[2] ?? monthDays[0]));
    const active = members.slice(m === "2026-12-01" ? 2 : 0);
    for (const c of active) addSale(em, monthDays[Math.min(4, monthDays.length - 1)], 49, { customer: c, offer: "Community membership", recurring: true });
  }
  customers.forEach((c) => {
    if (c.name === "Demo member 2" || c.name === "Demo member 3") Object.assign(c, { status: "churned", churned_on: "2026-11-28" });
  });
  addSale(em, "2026-11-20", 1500, { customer: addCustomer(em, "Demo mentee", "2026-11-20"), offer: "1:1 mentorship (6 weeks)", paid: 750, lead: "Community" });
  transactions.push({ id: uuid(), business_id: em, kind: "refund", txn_date: "2026-11-09", amount: 197, description: "Demo refund" });

  for (const m of ["2026-10-15", "2026-11-15", "2026-12-15"]) {
    transactions.push(
      { id: uuid(), business_id: lrg, kind: "expense", txn_date: m, amount: 149, expense_category: "software", description: "Demo AI receptionist platform" },
      { id: uuid(), business_id: em, kind: "expense", txn_date: m, amount: 99, expense_category: "software", description: "Demo community platform" },
      { id: uuid(), business_id: em, kind: "expense", txn_date: m, amount: m === "2026-12-15" ? 450 : 200, expense_category: "advertising", description: "Demo ads" },
    );
  }
  transactions.push(
    { id: uuid(), business_id: null, kind: "gig_income", txn_date: "2026-11-12", amount: 320, description: "Demo gig work" },
    { id: uuid(), business_id: null, kind: "transfer", txn_date: "2026-11-30", amount: 1000, description: "Demo transfer between own accounts" },
  );

  const stages = ["lead", "contacted", "conversation", "proposal", "proposal", "won", "lost", "conversation"] as const;
  const deals = stages.map((stage, i) => ({
    business_id: lrg, name: `Demo prospect ${String.fromCharCode(65 + i)}`, stage, value: 997 + 497 * 3,
    source: i % 2 ? "LinkedIn" : "Cold email", created_on: addDays("2026-10-20", i * 6),
    closed_on: stage === "won" || stage === "lost" ? addDays("2026-10-20", i * 6 + 9) : null,
  }));

  return [
    { table: "body_goals", rows: u([{ start_weight: 250, start_date: START, target_loss: 50, stretch_loss: 60, start_waist: 46, pace: "steady", activity_level: "light", preferred_activities: ["Walking", "Strength training", "Cycling"] }]) },
    { table: "athletic_profiles", rows: u([{ readiness: "cleared_by_clinician", assessed_on: "2026-10-28", injury_notes: "Demo: mild ankle sprain, cleared for gradual return.", phase: "return_to_running", weekly_session_target: 4, training_days: [1, 2, 4, 6], goal_text: "Complete a 10K", race_name: "Spring 10K (demo)", race_date: "2027-05-15" }]) },
    { table: "business_settings", rows: u([{ goal_metric: "revenue", goal_amount: 10000, baseline_revenue: 1200, baseline_expenses: 450, baseline_confirmed_on: START }]) },
    { table: "weight_entries", rows: u(weights) },
    { table: "daily_checkins", rows: u(checkins) },
    { table: "symptom_logs", rows: u(symptoms) },
    { table: "nutrition_logs", rows: u(nutrition) },
    { table: "workouts", rows: u(workouts) },
    { table: "strength_sets", rows: u(sets) },
    { table: "habits", rows: u(habits) },
    { table: "habit_completions", rows: u(completions) },
    { table: "rest_days", rows: u(restDays) },
    { table: "tasks", rows: u(tasks) },
    { table: "journal_entries", rows: u(journal) },
    { table: "reviews", rows: u(reviews) },
    { table: "businesses", rows: u(businesses) },
    { table: "offers", rows: u(offers) },
    { table: "activity_metrics", rows: u(metricRows) },
    { table: "activity_logs", rows: u(activityLogs) },
    { table: "customers", rows: u(customers) },
    { table: "transactions", rows: u(transactions) },
    { table: "payments", rows: u(payments) },
    { table: "deals", rows: u(deals) },
  ];
}

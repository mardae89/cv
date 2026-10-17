// The milestone engine. Every milestone is a rule over saved records; its
// date is the first day the records satisfied the rule. Because the rule
// looks at history, later setbacks (a heavier week, a slower month) never
// undo a milestone. Correcting or deleting the record that earned it does.
import { addDays, dateRange, fmtMonth, monthEnd, monthKey, todayIn, weekStart } from "../dates";
import { money, num, round } from "../format";
import type { AchievementCategory, AchievementRow, ISODate, UserData } from "../types";
import { isRun, isSession } from "./athletic";
import { AUDIENCE_STEPS, fmtCount, PLATFORMS, platformSeries } from "./audience";
import { dayResult, firstStart, GREEN_AT, indexPower, periods } from "./power";
import {
  dailyMetricDeltas, firstMtdCrossing, firstSaleByCustomer, goalStatus, METRIC_LABEL, monthFinance,
  mtdSeries, monthTotals, type Ledger,
} from "./business";
import { indexHabits, periodScore } from "./habits";
import { firstDateLost, weightProgress, weightSteps } from "./weight";
import { computeXP, levelDates, levelState, LEVELS, type XpResult, type LevelState } from "./xp";

export interface Milestone {
  key: string;
  category: AchievementCategory;
  group: string;
  tier: "minor" | "major";
  title: string;
  requirement: string;
  detail?: string;
  value?: number;
  achievedOn: ISODate | null;
  progress: { current: number; target: number; unit: string } | null;
  order: number;
  prevKey?: string;
  nextKey?: string;
}

function link(series: Milestone[]) {
  series.forEach((m, i) => {
    m.prevKey = series[i - 1]?.key;
    m.nextKey = series[i + 1]?.key;
  });
  return series;
}

const fmtMoneyK = (n: number) => (n % 1000 === 0 ? `$${n / 1000}K` : money(n));

// ──────────────────────────────────────────────────────────────── weight ──
function weightMilestones(data: UserData): Milestone[] {
  const wp = weightProgress(data.goals, data.weights);
  if (!wp) return [];
  const { goal, series } = wp;
  const steps = weightSteps(goal);
  return link(steps.map((k, i): Milestone => {
    const isGoal = Math.abs(k - goal.targetLoss) < 1e-9;
    const isStretch = goal.stretchLoss !== null && Math.abs(k - goal.stretchLoss) < 1e-9;
    const at = round(goal.start - k, 1);
    const achievedOn = firstDateLost(series, goal.start, k);
    return {
      key: `weight.${k}`,
      category: "weight",
      group: "Weight",
      tier: isGoal || isStretch || k % 25 === 0 ? "major" : "minor",
      title: isGoal ? `Goal reached: ${k} lb lost` : isStretch ? `Stretch goal: ${k} lb lost` : `${k} pounds lost`,
      requirement: `A weigh-in at or below ${at.toFixed(1)} lb (${k} lb below your ${goal.start} lb start)`,
      detail: achievedOn
        ? `Weighed in at ${at.toFixed(1)} lb or lower on this date.`
        : undefined,
      value: k,
      achievedOn,
      progress: { current: Math.max(0, wp.lost), target: k, unit: "lb" },
      order: i,
    };
  }));
}

// ─────────────────────────────────────────────────────────────── business ──
function businessMilestones(data: UserData, today: ISODate): Milestone[] {
  if (!data.profile.business_enabled && data.transactions.length === 0) return [];
  const l: Ledger = { transactions: data.transactions, payments: data.payments };
  const metric = data.businessSettings?.goal_metric ?? "revenue";
  const goal = num(data.businessSettings?.goal_amount) || 10000;
  const label = METRIC_LABEL[metric];
  const mtd = mtdSeries(dailyMetricDeltas(l, metric));
  const current = goalStatus(l, { goal_metric: metric, goal_amount: goal }, today).value;
  const out: Milestone[] = [];

  const ladder: number[] = [];
  for (let k = 1000; k <= goal + 1e-9; k += 1000) ladder.push(k);
  if (ladder[ladder.length - 1] !== goal) ladder.push(goal);
  out.push(...link(ladder.map((k, i): Milestone => ({
    key: `biz.${metric}.${k}`,
    category: "business",
    group: "Monthly revenue",
    tier: k === 1000 || k === 5000 || k === goal ? "major" : "minor",
    title: k === 1000 ? "First $1,000 month" : k === goal ? `${fmtMoneyK(k)} month — the goal` : `${fmtMoneyK(k)} month`,
    requirement: `${label} reaches ${money(k)} within one calendar month`,
    value: k,
    achievedOn: firstMtdCrossing(mtd, k),
    progress: { current: Math.max(0, current), target: k, unit: "$" },
    order: i,
  }))));

  // Sustained: the goal met in three consecutive calendar months.
  const totals = monthTotals(l, metric);
  let sustainedOn: ISODate | null = null;
  for (const p of mtd) {
    if (p.mtd < goal - 0.004) continue;
    const m = p.date.slice(0, 8) + "01";
    const m1 = monthKey(addDays(m, -1));
    const m2 = monthKey(addDays(m1 + "-01", -1));
    if ((totals.get(m1) ?? 0) >= goal - 0.004 && (totals.get(m2) ?? 0) >= goal - 0.004) {
      sustainedOn = p.date;
      break;
    }
  }
  let streak = 0;
  for (let m = today.slice(0, 8) + "01"; ; m = addDays(m, -1).slice(0, 8) + "01") {
    if ((totals.get(monthKey(m)) ?? 0) >= goal - 0.004) streak += 1;
    else if (m !== today.slice(0, 8) + "01") break;
    if (streak >= 3 || m < "2020-01-01") break;
  }
  out.push({
    key: `biz.${metric}.sustained`,
    category: "business",
    group: "Monthly revenue",
    tier: "major",
    title: `${fmtMoneyK(goal)}/month sustained for 3 months`,
    requirement: `${label} of at least ${money(goal)} in three consecutive calendar months`,
    achievedOn: sustainedOn,
    progress: { current: Math.min(3, streak), target: 3, unit: "months" },
    order: ladder.length,
  });

  const sales = data.transactions.filter((t) => t.kind === "sale").sort((a, b) => (a.txn_date < b.txn_date ? -1 : 1));
  out.push({
    key: "biz.first_sale",
    category: "business", group: "Firsts", tier: "major",
    title: "First paying client",
    requirement: "Record your first sale",
    achievedOn: sales[0]?.txn_date ?? null,
    progress: { current: sales.length ? 1 : 0, target: 1, unit: "sale" },
    order: 0,
  });
  const firstRecurring = sales.find((t) => t.recurring);
  out.push({
    key: "biz.first_recurring",
    category: "business", group: "Firsts", tier: "minor",
    title: "First recurring customer",
    requirement: "Record a sale marked as recurring",
    achievedOn: firstRecurring?.txn_date ?? null,
    progress: { current: firstRecurring ? 1 : 0, target: 1, unit: "sale" },
    order: 1,
  });
  const recurringDeltas = new Map<ISODate, number>();
  for (const t of sales) if (t.recurring) recurringDeltas.set(t.txn_date, (recurringDeltas.get(t.txn_date) ?? 0) + num(t.amount));
  const recurringThisMonth = monthFinance(l, today).recurring;
  out.push({
    key: "biz.mrr_1000",
    category: "business", group: "Firsts", tier: "major",
    title: "First $1,000 in monthly recurring revenue",
    requirement: "Recurring revenue earned within one calendar month reaches $1,000",
    achievedOn: firstMtdCrossing(mtdSeries(recurringDeltas), 1000),
    progress: { current: recurringThisMonth, target: 1000, unit: "$" },
    order: 2,
  });
  const firsts = [...firstSaleByCustomer(l).values()].sort();
  out.push({
    key: "biz.customers_10",
    category: "business", group: "Firsts", tier: "major",
    title: "First ten paying customers",
    requirement: "Ten different customers linked to sales",
    achievedOn: firsts[9] ?? null,
    progress: { current: firsts.length, target: 10, unit: "customers" },
    order: 3,
  });

  // Completed months only, so a late expense can't flip the verdict mid-month.
  const months = [...new Set(data.transactions.map((t) => t.txn_date.slice(0, 8) + "01"))].sort()
    .filter((m) => monthEnd(m) < today);
  let profitableOn: ISODate | null = null;
  for (const m of months) {
    const f = monthFinance(l, m);
    if (f.revenue > 0 && f.profit > 0) {
      profitableOn = monthEnd(m);
      break;
    }
  }
  out.push({
    key: "biz.first_profitable",
    category: "business", group: "Firsts", tier: "major",
    title: "First profitable month",
    requirement: "A completed calendar month where revenue exceeds expenses",
    achievedOn: profitableOn,
    progress: null,
    order: 4,
  });
  let best = 0;
  for (const m of months) {
    const v = totals.get(monthKey(m)) ?? 0;
    if (v > best && best > 0) {
      out.push({
        key: `biz.best.${monthKey(m)}`,
        category: "business", group: "Records", tier: "minor",
        title: `Best month yet: ${fmtMonth(m)}`,
        requirement: `Beat every previous month's ${label.toLowerCase()}`,
        detail: `${money(v)} — up from the previous best of ${money(best)}.`,
        value: v,
        achievedOn: monthEnd(m),
        progress: null,
        order: 10,
      });
    }
    best = Math.max(best, v);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────── athletic ──
function weeksMeetingTarget(data: UserData, target: number): { week: ISODate; metOn: ISODate | null }[] {
  const byWeek = new Map<ISODate, ISODate[]>();
  for (const w of data.workouts) {
    if (!isSession(w)) continue;
    const k = weekStart(w.workout_date);
    byWeek.set(k, [...(byWeek.get(k) ?? []), w.workout_date]);
  }
  return [...byWeek.keys()].sort().map((week) => {
    const days = byWeek.get(week)!.sort();
    return { week, metOn: days.length >= target ? days[target - 1] : null };
  });
}

// ────────────────────────────────────────────────────────────── audience ──
// Counted from the first reading: a total you already had when you started
// tracking isn't a new milestone. Shows what's earned plus the next two.
function audienceMilestones(data: UserData): Milestone[] {
  const out: Milestone[] = [];
  PLATFORMS.forEach((p, pi) => {
    const s = platformSeries(data.audience ?? [], p.key);
    if (!s.length) return;
    const latest = s[s.length - 1].count;
    const steps = AUDIENCE_STEPS.filter((k) => k > s[0].count);
    let upcoming = 0;
    const series: Milestone[] = [];
    for (const k of steps) {
      const hit = s.find((r) => r.count >= k) ?? null;
      if (!hit && ++upcoming > 2) break;
      series.push({
        key: `audience.${p.key}.${k}`,
        category: "audience",
        group: p.name,
        tier: [1000, 10_000, 100_000, 1_000_000].includes(k) ? "major" : "minor",
        title: `${fmtCount(k)} ${p.name} ${p.unit}`,
        requirement: `Record ${fmtCount(k)} or more ${p.name} ${p.unit}`,
        value: k,
        achievedOn: hit?.date ?? null,
        progress: { current: latest, target: k, unit: p.unit },
        order: 20 + pi,
      });
    }
    out.push(...link(series));
  });
  return out;
}

function athleticMilestones(data: UserData, today: ISODate): Milestone[] {
  const target = data.athletic?.weekly_session_target ?? 3;
  const ws = data.workouts.slice().sort((a, b) => (a.workout_date < b.workout_date ? -1 : 1));
  const runs = ws.filter(isRun);
  const longest = runs.reduce((m, r) => Math.max(m, num(r.distance_mi)), 0);
  const weeks = weeksMeetingTarget(data, target);
  const firstWeek = weeks.find((w) => w.metOn)?.metOn ?? null;
  const thisWeek = data.workouts.filter((w) => isSession(w) && w.workout_date >= weekStart(today) && w.workout_date <= today).length;

  // Four consecutive Monday-start weeks that each met the session target.
  let fourOn: ISODate | null = null;
  const met = new Map(weeks.map((w) => [w.week, w.metOn]));
  for (const w of weeks) {
    if (!w.metOn) continue;
    const prev = [1, 2, 3].map((n) => met.get(addDays(w.week, -7 * n)));
    if (prev.every(Boolean)) {
      fourOn = w.metOn;
      break;
    }
  }
  let consecutive = 0;
  for (let wk = weekStart(today); ; wk = addDays(wk, -7)) {
    if (met.get(wk)) consecutive += 1;
    else if (wk !== weekStart(today)) break;
    if (consecutive >= 4 || wk < "2020-01-01") break;
  }

  const firstWhere = (pred: (w: (typeof ws)[number]) => boolean) => ws.find(pred)?.workout_date ?? null;
  const dist = (key: string, miles: number, title: string, tier: "minor" | "major", order: number, run = false): Milestone => ({
    key, category: "athletic", group: "Distance", tier, title,
    requirement: run
      ? `Log a continuous run (not run-walk) of ${miles} mile${miles === 1 ? "" : "s"} or more`
      : `Log a run or run-walk of ${miles} miles or more`,
    value: miles,
    achievedOn: firstWhere((w) => (run ? w.activity === "run" : isRun(w)) && num(w.distance_mi) >= miles - 1e-9),
    progress: { current: run ? runs.filter((r) => r.activity === "run").reduce((m, r) => Math.max(m, num(r.distance_mi)), 0) : longest, target: miles, unit: "mi" },
    order,
  });
  const ladder = link([
    dist("ath.mile", 1, "First continuous mile", "major", 2, true),
    dist("ath.dist.2", 2, "Two miles", "minor", 3),
    dist("ath.5k", 3.1, "First 5K completed", "major", 4),
    dist("ath.dist.4", 4, "Four miles", "minor", 5),
    dist("ath.dist.5", 5, "Five miles", "minor", 6),
    dist("ath.10k", 6.2, "First 10K completed", "major", 7),
  ]);
  const strengthCount = ws.filter((w) => w.activity === "strength").length;
  const strengthDates = ws.filter((w) => w.activity === "strength").map((w) => w.workout_date);
  return [
    {
      key: "ath.first_week", category: "athletic", group: "Consistency", tier: "minor",
      title: "First week of consistent training",
      requirement: `Complete ${target} training sessions in one Monday–Sunday week`,
      achievedOn: firstWeek,
      progress: { current: Math.min(thisWeek, target), target, unit: "sessions" },
      order: 0,
    },
    {
      key: "ath.pain_free_run", category: "athletic", group: "Return to running", tier: "major",
      title: "First pain-free return-to-running session",
      requirement:
        "Log a run or run-walk with pain recorded as 0/10. Only attempt this once the ankle has been assessed and a clinician agrees.",
      achievedOn: firstWhere((w) => isRun(w) && w.pain_level === 0),
      progress: null,
      order: 1,
    },
    ...ladder,
    {
      key: "ath.race", category: "athletic", group: "Distance", tier: "major",
      title: "10K race finished",
      requirement: "Log a workout marked as a race, 6.2 miles or more",
      achievedOn: firstWhere((w) => w.is_race && num(w.distance_mi) >= 6.2 - 1e-9),
      progress: null,
      order: 8,
    },
    {
      key: "ath.four_weeks", category: "athletic", group: "Consistency", tier: "major",
      title: "Four consecutive weeks of planned training",
      requirement: `Meet your ${target}-session weekly target four weeks in a row`,
      achievedOn: fourOn,
      progress: { current: consecutive, target: 4, unit: "weeks" },
      order: 9,
    },
    {
      key: "ath.strength_10", category: "athletic", group: "Strength", tier: "minor",
      title: "Ten strength sessions",
      requirement: "Log 10 strength workouts",
      achievedOn: strengthDates[9] ?? null,
      progress: { current: strengthCount, target: 10, unit: "sessions" },
      order: 10,
    },
  ];
}

// ───────────────────────────────────────────────────── habits & logging ──
export function loggingDates(data: UserData): Set<ISODate> {
  const s = new Set<ISODate>();
  data.weights.forEach((x) => s.add(x.entry_date));
  data.checkins.forEach((x) => s.add(x.checkin_date));
  data.symptoms.forEach((x) => s.add(x.log_date));
  data.nutrition.forEach((x) => s.add(x.log_date));
  data.workouts.forEach((x) => s.add(x.workout_date));
  data.completions.forEach((x) => s.add(x.completed_on));
  data.restDays.forEach((x) => s.add(x.rest_date));
  data.journal.forEach((x) => s.add(x.entry_date));
  data.transactions.forEach((x) => s.add(x.txn_date));
  data.activityLogs.forEach((x) => s.add(x.log_date));
  data.tasks.forEach((x) => x.completed_on && s.add(x.completed_on));
  return s;
}

function consecutiveRun(dates: ISODate[]): (n: number) => ISODate | null {
  return (n) => {
    let run = 0;
    let prev: ISODate | null = null;
    for (const d of dates) {
      run = prev && addDays(prev, 1) === d ? run + 1 : 1;
      prev = d;
      if (run >= n) return d;
    }
    return null;
  };
}

// ────────────────────────────────────────────────────────── power list ──
function powerMilestones(data: UserData, today: ISODate): Milestone[] {
  const items = data.powerItems ?? [];
  const start = firstStart(items);
  if (!start) return [];
  const idx = indexPower(data);
  const days: { date: ISODate; pct: number }[] = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const r = dayResult(items, d, idx);
    if (r.due) days.push({ date: d, pct: r.pct! });
  }
  const firstWhere = (ok: (pct: number) => boolean) => days.find((d) => ok(d.pct))?.date ?? null;
  const streakDate = (n: number) => {
    let run = 0;
    for (const d of days) {
      run = d.pct >= GREEN_AT ? run + 1 : 0;
      if (run >= n) return d.date;
    }
    return null;
  };
  let best = 0, run = 0;
  for (const d of days) { run = d.pct >= GREEN_AT ? run + 1 : 0; best = Math.max(best, run); }
  const out: Milestone[] = [];
  const m = (key: string, tier: Milestone["tier"], title: string, requirement: string, achievedOn: ISODate | null,
    progress: Milestone["progress"], order: number): Milestone =>
    ({ key: `power.${key}`, category: "power", group: "Power List", tier, title, requirement, achievedOn, progress, order });
  out.push(m("first_green", "minor", "First green day", `Complete ${GREEN_AT}% or more of a day's Power List`, firstWhere((p) => p >= GREEN_AT), null, 0));
  out.push(m("first_perfect", "minor", "First perfect day", "Complete every item on a day's Power List", firstWhere((p) => p === 100), null, 1));
  out.push(...link([3, 7, 14, 30, 60, 100].map((n, i) => m(`streak_${n}`, n >= 14 ? "major" : "minor", `${n}-day green streak`,
    `${n} days in a row at ${GREEN_AT}% or more`, streakDate(n), { current: best, target: n, unit: "days" }, 2 + i))));
  // Weeks and months only count once they're over: the score is given at the end.
  const weeks = periods(items, "week", idx, today).filter((p) => p.complete);
  const months = periods(items, "month", idx, today).filter((p) => p.complete);
  const firstPeriod = (ps: typeof weeks, at: number) => ps.find((p) => (p.pct ?? 0) >= at)?.to ?? null;
  out.push(...link([[75, "good", "minor"], [80, "great", "minor"], [90, "exceptional", "major"]].map(([at, k, tier], i) =>
    m(`week_${k}`, tier as Milestone["tier"], `First ${k} week`, `Finish a week at ${at}% PCR or more`, firstPeriod(weeks, at as number), null, 10 + i))));
  out.push(...link([[75, "good", "minor"], [80, "great", "major"], [90, "exceptional", "major"]].map(([at, k, tier], i) =>
    m(`month_${k}`, tier as Milestone["tier"], `First ${k} month`, `Finish a month at ${at}% PCR or more`, firstPeriod(months, at as number), null, 13 + i))));
  // Content shipped.
  const done = (data.contentIdeas ?? []).filter((c) => c.status === "done" && c.completed_on).map((c) => c.completed_on!).sort();
  out.push(...link([10, 25, 50, 100, 200].map((n, i) => m(`videos_${n}`, n >= 50 ? "major" : "minor", `${n} videos completed`,
    `Check off ${n} videos from your content list`, done[n - 1] ?? null, { current: done.length, target: n, unit: "videos" }, 20 + i))));
  return out;
}

function habitMilestones(data: UserData, today: ISODate): Milestone[] {
  const out: Milestone[] = [];
  const logged = [...loggingDates(data)].filter((d) => d <= today).sort();
  const loggedSet = new Set(logged);
  let streak = 0;
  for (let d = loggedSet.has(today) ? today : addDays(today, -1); loggedSet.has(d); d = addDays(d, -1)) streak++;
  out.push({
    key: "habit.log_7", category: "habit", group: "Consistency", tier: "minor",
    title: "Seven days of consistent logging",
    requirement: "Log something — weight, a workout, a habit, a meal — seven days in a row",
    achievedOn: consecutiveRun(logged)(7),
    progress: { current: Math.min(streak, 7), target: 7, unit: "days" },
    order: 0,
  });

  // Four consecutive completed weeks at ≥ 80% of scheduled habits.
  const idx = indexHabits(data.completions, data.restDays);
  let execOn: ISODate | null = null;
  let run = 0;
  let current = 0;
  if (data.habits.length) {
    const first = data.habits.reduce((m, h) => (h.start_date < m ? h.start_date : m), data.habits[0].start_date);
    for (let w = weekStart(first); addDays(w, 6) <= today; w = addDays(w, 7)) {
      const s = periodScore(data.habits, idx, w, addDays(w, 6));
      if (s.pct !== null && s.pct >= 80) {
        run += 1;
        if (run >= 4 && !execOn) execOn = addDays(w, 6);
      } else if (s.scheduled > 0) run = 0;
    }
    current = run;
  }
  out.push({
    key: "habit.exec_4w", category: "habit", group: "Consistency", tier: "major",
    title: "Four weeks of consistent execution",
    requirement: "Complete at least 80% of scheduled habits in four consecutive full weeks",
    achievedOn: execOn,
    progress: { current: Math.min(current, 4), target: 4, unit: "weeks" },
    order: 1,
  });

  const sessions = data.workouts.filter(isSession).map((w) => w.workout_date).sort();
  out.push({
    key: "habit.workouts_30", category: "habit", group: "Consistency", tier: "major",
    title: "Thirty completed workouts",
    requirement: "Log 30 training sessions (recovery days don't count toward this one)",
    achievedOn: sessions[29] ?? null,
    progress: { current: sessions.length, target: 30, unit: "workouts" },
    order: 2,
  });

  if (data.profile.business_enabled) {
    const bizDays = [...new Set([
      ...data.activityLogs.filter((a) => a.count > 0).map((a) => a.log_date),
      ...data.transactions.filter((t) => t.business_id).map((t) => t.txn_date),
    ])].filter((d) => d <= today).sort();
    out.push({
      key: "habit.biz_30", category: "habit", group: "Consistency", tier: "minor",
      title: "Thirty days of business tracking",
      requirement: "Log business activity or transactions on 30 different days",
      achievedOn: bizDays[29] ?? null,
      progress: { current: bizDays.length, target: 30, unit: "days" },
      order: 3,
    });
  }

  // Sleep & recovery: 4 consecutive weeks with ≥5 nights of 7h+ and ≥1 rest/recovery day.
  const restish = new Set<ISODate>([
    ...data.restDays.map((r) => r.rest_date),
    ...data.workouts.filter((w) => w.activity === "recovery").map((w) => w.workout_date),
  ]);
  const goodSleep = new Set(data.checkins.filter((c) => num(c.sleep_hours) >= 7).map((c) => c.checkin_date));
  let sleepOn: ISODate | null = null;
  let srRun = 0;
  const allDates = [...goodSleep, ...restish].sort();
  if (allDates.length) {
    for (let w = weekStart(allDates[0]); addDays(w, 6) <= today; w = addDays(w, 7)) {
      const days = dateRange(w, addDays(w, 6));
      const ok = days.filter((d) => goodSleep.has(d)).length >= 5 && days.some((d) => restish.has(d));
      srRun = ok ? srRun + 1 : 0;
      if (srRun >= 4 && !sleepOn) sleepOn = addDays(w, 6);
    }
  }
  out.push({
    key: "habit.sleep_recovery", category: "habit", group: "Recovery", tier: "major",
    title: "Consistent sleep and recovery",
    requirement: "Four weeks in a row with 5+ nights of 7+ hours of sleep and at least one rest or recovery day",
    achievedOn: sleepOn,
    progress: { current: Math.min(srRun, 4), target: 4, unit: "weeks" },
    order: 4,
  });

  const weekly = data.reviews
    .filter((r) => r.period === "week" && r.completed_at)
    .map((r) => {
      const done = todayIn(data.profile.timezone, new Date(r.completed_at!));
      const end = addDays(r.period_start, 6);
      return done < end ? done : end;
    })
    .sort();
  out.push({
    key: "habit.first_review", category: "habit", group: "Reflection", tier: "minor",
    title: "First weekly review completed",
    requirement: "Complete a weekly review",
    achievedOn: weekly[0] ?? null,
    progress: { current: Math.min(weekly.length, 1), target: 1, unit: "review" },
    order: 5,
  });
  out.push({
    key: "habit.reviews_4", category: "habit", group: "Reflection", tier: "minor",
    title: "Four weekly reviews",
    requirement: "Complete four weekly reviews",
    achievedOn: weekly[3] ?? null,
    progress: { current: weekly.length, target: 4, unit: "reviews" },
    order: 6,
  });
  return out;
}

// ───────────────────────────────────────────────────────────── evaluate ──
export interface Evaluation {
  milestones: Milestone[];
  unlocked: Milestone[];
  xp: XpResult;
  level: LevelState;
}

export function evaluate(data: UserData, today: ISODate): Evaluation {
  const base = [
    ...weightMilestones(data),
    ...businessMilestones(data, today),
    ...audienceMilestones(data),
    ...powerMilestones(data, today),
    ...athleticMilestones(data, today),
    ...habitMilestones(data, today),
  ];
  // Records dated in the future (e.g. a typo) never unlock anything early.
  for (const m of base) if (m.achievedOn && m.achievedOn > today) m.achievedOn = null;
  const earned = base.filter((m) => m.achievedOn);
  const xp = computeXP(data, earned.map((m) => ({ achievedOn: m.achievedOn, tier: m.tier, category: m.category })), today, data);
  const dates = levelDates(xp.byDay, earned.map((m) => m.achievedOn!));
  const levels: Milestone[] = link(LEVELS.slice(1).map((l, i) => ({
    key: `level.${l.level}`,
    category: "level",
    group: "Levels",
    tier: l.level >= 4 ? "major" : "minor",
    title: `Level ${l.level}: ${l.name}`,
    requirement: `${l.xp.toLocaleString()} XP and ${l.achievements} milestone${l.achievements === 1 ? "" : "s"}`,
    achievedOn: dates.get(l.level) && dates.get(l.level)! <= today ? dates.get(l.level)! : null,
    progress: null,
    order: i,
  })));
  const milestones = [...base, ...levels];
  return {
    milestones,
    unlocked: milestones.filter((m) => m.achievedOn).sort((a, b) => (a.achievedOn! < b.achievedOn! ? -1 : 1)),
    xp,
    level: levelState(xp.total, earned.length),
  };
}

/** The locked milestone closest to unlocking, by progress ratio. */
export function nextMilestone(ms: Milestone[], category?: AchievementCategory): Milestone | null {
  const locked = ms.filter((m) => !m.achievedOn && m.progress && m.progress.target > 0 &&
    (!category || m.category === category));
  if (!locked.length) return null;
  return locked.reduce((best, m) => {
    const r = m.progress!.current / m.progress!.target;
    const br = best.progress!.current / best.progress!.target;
    return r > br + 1e-9 ? m : best;
  });
}

/** The n locked milestones closest to unlocking, closest first. */
export function closestMilestones(ms: Milestone[], n: number): Milestone[] {
  return ms
    .filter((m) => !m.achievedOn && m.progress && m.progress.target > 0)
    .map((m) => ({ m, r: m.progress!.current / m.progress!.target }))
    .sort((a, b) => b.r - a.r || a.m.order - b.m.order)
    .slice(0, n)
    .map((x) => x.m);
}

export interface AchievementDiff {
  insert: Milestone[];
  update: { id: string; m: Milestone }[];
  remove: AchievementRow[];
}

/** What to write so the stored achievements match the evaluated rules. */
export function diffAchievements(unlocked: Milestone[], stored: AchievementRow[]): AchievementDiff {
  const byKey = new Map(stored.map((r) => [r.key, r]));
  const keys = new Set(unlocked.map((m) => m.key));
  const insert: Milestone[] = [];
  const update: { id: string; m: Milestone }[] = [];
  for (const m of unlocked) {
    const r = byKey.get(m.key);
    if (!r) insert.push(m);
    else if (r.achieved_on !== m.achievedOn || r.title !== m.title || r.tier !== m.tier ||
      (m.value ?? null) !== (r.value === null ? null : num(r.value))) update.push({ id: r.id, m });
  }
  const remove = stored.filter((r) => !keys.has(r.key));
  return { insert, update, remove };
}

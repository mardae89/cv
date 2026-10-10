// Weekly and monthly reviews, built only from saved records. Insights are
// phrased as observations with possible explanations — never as causes.
import { addDays, dateRange, diffDays, fmtShort, weekStart } from "../dates";
import { money, num, round } from "../format";
import type { ISODate, UserData } from "../types";
import { injuryAlert, isRun, isSession, symptomSummary } from "./athletic";
import { customerStats, goalStatus, METRIC_LABEL, periodFinance, salesToClose, type Ledger, type PeriodFinance } from "./business";
import { indexHabits, isDone, isScheduled, periodScore, type PeriodScore } from "./habits";
import type { Milestone } from "./milestones";
import { trendAsOf, trendSeries, weighIns } from "./weight";

export interface Insight {
  key: string;
  tone: "positive" | "neutral" | "caution";
  title: string;
  text: string;
}

export interface ActivityTotal {
  kind: "outreach" | "content" | "sales" | "audience";
  label: string;
  count: number;
  target: number | null;
}

export interface PeriodReview {
  from: ISODate;
  to: ISODate;
  days: number;
  weight: { startTrend: number | null; endTrend: number | null; change: number | null; weighIns: number } | null;
  training: { sessions: number; target: number; runMiles: number; longestRun: number; strength: number; minutes: number; recoveryDays: number };
  sleep: { nights: number; avgHours: number | null; nights7: number; avgQuality: number | null; avgSoreness: number | null; avgFatigue: number | null };
  habits: PeriodScore;
  habitRows: { name: string; scheduled: number; done: number; pct: number | null }[];
  business: (PeriodFinance & { newCustomers: number; activity: ActivityTotal[] }) | null;
  milestones: Milestone[];
  setbacks: string[];
  insights: Insight[];
  priorities: string[];
}

function avg(xs: number[]): number | null {
  return xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length, 2) : null;
}

function sleepStats(data: UserData, from: ISODate, to: ISODate) {
  const cs = data.checkins.filter((c) => c.checkin_date >= from && c.checkin_date <= to);
  const hours = cs.filter((c) => c.sleep_hours !== null).map((c) => num(c.sleep_hours));
  return {
    nights: hours.length,
    avgHours: avg(hours),
    nights7: hours.filter((h) => h >= 7).length,
    avgQuality: avg(cs.filter((c) => c.sleep_quality !== null).map((c) => num(c.sleep_quality))),
    avgSoreness: avg(cs.filter((c) => c.soreness !== null).map((c) => num(c.soreness))),
    avgFatigue: avg(cs.filter((c) => c.fatigue !== null).map((c) => num(c.fatigue))),
  };
}

function activityTotals(data: UserData, from: ISODate, to: ISODate): ActivityTotal[] {
  const days = diffDays(from, to) + 1;
  return data.metrics.filter((m) => m.active).map((m) => {
    const count = data.activityLogs
      .filter((a) => a.metric_id === m.id && a.log_date >= from && a.log_date <= to)
      .reduce((s, a) => s + a.count, 0);
    const target = m.weekly_target !== null
      ? round((m.weekly_target * days) / 7, 0)
      : m.daily_target !== null ? m.daily_target * days : null;
    return { kind: m.kind, label: m.label, count, target };
  });
}

function trainingStats(data: UserData, from: ISODate, to: ISODate) {
  const ws = data.workouts.filter((w) => w.workout_date >= from && w.workout_date <= to);
  const weeks = Math.max(1, round((diffDays(from, to) + 1) / 7, 1));
  const runs = ws.filter(isRun);
  return {
    sessions: ws.filter(isSession).length,
    target: Math.round((data.athletic?.weekly_session_target ?? 3) * weeks),
    runMiles: round(runs.reduce((s, w) => s + num(w.distance_mi), 0), 2),
    longestRun: round(runs.reduce((m, w) => Math.max(m, num(w.distance_mi)), 0), 2),
    strength: ws.filter((w) => w.activity === "strength").length,
    minutes: Math.round(ws.reduce((s, w) => s + num(w.duration_min), 0)),
    recoveryDays: ws.filter((w) => w.activity === "recovery").length +
      data.restDays.filter((r) => r.rest_date >= from && r.rest_date <= to).length,
  };
}

export function buildReview(data: UserData, from: ISODate, to: ISODate, today: ISODate, unlocked: Milestone[]): PeriodReview {
  const days = diffDays(from, to) + 1;
  const prevFrom = addDays(from, -days);
  const prevTo = addDays(from, -1);
  const l: Ledger = { transactions: data.transactions, payments: data.payments };
  const idx = indexHabits(data.completions, data.restDays);
  const series = trendSeries(weighIns(data.weights));

  const weight = data.goals?.start_weight
    ? (() => {
        const startTrend = trendAsOf(series, prevTo);
        const endTrend = trendAsOf(series, to);
        return {
          startTrend,
          endTrend,
          change: startTrend !== null && endTrend !== null ? round(endTrend - startTrend, 1) : null,
          weighIns: data.weights.filter((w) => w.weight !== null && w.entry_date >= from && w.entry_date <= to).length,
        };
      })()
    : null;

  const training = trainingStats(data, from, to);
  const prevTraining = trainingStats(data, prevFrom, prevTo);
  const sleep = sleepStats(data, from, to);
  const prevSleep = sleepStats(data, prevFrom, prevTo);
  const habits = periodScore(data.habits, idx, from, to);
  const prevHabits = periodScore(data.habits, idx, prevFrom, prevTo);
  const habitRows = data.habits.map((h) => {
    let scheduled = 0, done = 0;
    for (const d of dateRange(from, to)) {
      if (!isScheduled(h, d, idx.rest)) continue;
      scheduled += 1;
      if (isDone(idx, h.id, d)) done += 1;
    }
    return { name: h.name, scheduled, done, pct: scheduled ? round((done / scheduled) * 100, 0) : null };
  }).filter((r) => r.scheduled > 0);

  const business = data.profile.business_enabled
    ? { ...periodFinance(l, from, to), newCustomers: customerStats(l, data.customers, from, to).newCustomers, activity: activityTotals(data, from, to) }
    : null;

  const milestones = unlocked.filter((m) => m.achievedOn! >= from && m.achievedOn! <= to);

  // ── setbacks (stated plainly, without judgement)
  const setbacks: string[] = [];
  if (weight?.change !== null && weight?.change !== undefined && weight.change > 0.5) {
    setbacks.push(`7-day average weight rose ${weight.change} lb.`);
  }
  if (training.sessions < training.target) setbacks.push(`${training.sessions} of ${training.target} planned training sessions.`);
  if (habits.pct !== null && habits.pct < 60) setbacks.push(`Habit completion was ${habits.pct}%.`);
  const symptoms = data.symptoms.filter((s) => s.log_date >= from && s.log_date <= to && s.pain_level > 0);
  if (symptoms.length) setbacks.push(`Pain logged on ${new Set(symptoms.map((s) => s.log_date)).size} day(s), up to ${Math.max(...symptoms.map((s) => s.pain_level))}/10.`);
  if (business && business.expenses > business.revenue && business.revenue > 0) setbacks.push("Expenses exceeded revenue in this period.");

  // ── insights
  const insights: Insight[] = [];
  const recoveryDown =
    sleep.nights >= 3 && prevSleep.nights >= 3 &&
    ((sleep.avgHours !== null && prevSleep.avgHours !== null && sleep.avgHours <= prevSleep.avgHours - 0.5) ||
     (sleep.avgFatigue !== null && prevSleep.avgFatigue !== null && sleep.avgFatigue >= prevSleep.avgFatigue + 0.75) ||
     (sleep.avgSoreness !== null && prevSleep.avgSoreness !== null && sleep.avgSoreness >= prevSleep.avgSoreness + 0.75));
  if (training.sessions >= training.target && prevTraining.sessions >= prevTraining.target && recoveryDown) {
    insights.push({
      key: "training_recovery", tone: "caution",
      title: "Consistent training, declining recovery",
      text: `You met your session target in both periods, while ${sleep.avgHours !== null && prevSleep.avgHours !== null ? `average sleep went from ${prevSleep.avgHours} h to ${sleep.avgHours} h` : "fatigue or soreness rose"}. Recovery may be lagging the training load — sleep, stress or intensity could all contribute.`,
    });
  }

  if (series.length >= 6) {
    const end = trendAsOf(series, to);
    const twoWeeksAgo = trendAsOf(series, addDays(to, -14));
    const recent = series.filter((p) => p.date > addDays(to, -14) && p.date <= to).length;
    if (end !== null && twoWeeksAgo !== null && recent >= 4 && diffDays(series[0].date, to) >= 21 &&
        Math.abs(end - twoWeeksAgo) < 0.5) {
      insights.push({
        key: "weight_stall", tone: "neutral",
        title: "Weight trend has levelled off",
        text: `Your 7-day average moved ${round(end - twoWeeksAgo, 1)} lb over the last two weeks. Plateaus are common; water retention, sleep, activity changes, or how intake is estimated can all play a part. If it holds for several more weeks, it may be worth reviewing the plan.`,
      });
    }
  }

  // Business patterns compare 28-day windows so weekly noise doesn't dominate.
  if (business) {
    const w2 = periodFinance(l, addDays(to, -27), to);
    const w1 = periodFinance(l, addDays(to, -55), addDays(to, -28));
    if (w1.revenue > 0 && w2.revenue > w1.revenue) {
      const m1 = (w1.profit / w1.revenue) * 100;
      const m2 = (w2.profit / w2.revenue) * 100;
      if (m2 <= m1 - 10) {
        insights.push({
          key: "revenue_margin", tone: "caution",
          title: "Revenue up, margin down",
          text: `Revenue rose from ${money(w1.revenue)} to ${money(w2.revenue)} over the last 28 days, while profit margin fell from ${round(m1, 0)}% to ${round(m2, 0)}%. Delivery costs, ad spend or tools scaling faster than revenue are possible explanations.`,
        });
      }
    }
    const content = (from_: ISODate, to_: ISODate) => activityTotals(data, from_, to_).filter((a) => a.kind === "content").reduce((s, a) => s + a.count, 0);
    const leads = (from_: ISODate, to_: ISODate) =>
      activityTotals(data, from_, to_).filter((a) => a.kind === "audience").reduce((s, a) => s + a.count, 0) +
      periodFinance(l, from_, to_).salesCount;
    const c2 = content(addDays(to, -27), to), c1 = content(addDays(to, -55), addDays(to, -28));
    const l2 = leads(addDays(to, -27), to), l1 = leads(addDays(to, -55), addDays(to, -28));
    if (c2 >= 5 && c2 >= c1 * 1.25 && l2 <= l1) {
      insights.push({
        key: "content_conversion", tone: "neutral",
        title: "More content, flat conversion",
        text: `Content output rose to ${c2} pieces (from ${c1}) over 28 days, while leads and sales went from ${l1} to ${l2}. Calls to action, offer fit or timing may matter — or results may simply lag the content.`,
      });
    }
    const outreach = data.metrics.filter((m) => m.active && m.kind === "outreach" && (m.weekly_target || m.daily_target));
    if (outreach.length) {
      const hit: number[] = [], miss: number[] = [];
      for (let w = weekStart(addDays(to, -55)); addDays(w, 6) <= to; w = addDays(w, 7)) {
        const totals = activityTotals(data, w, addDays(w, 6)).filter((a) => a.kind === "outreach" && a.target);
        const done = totals.reduce((s, a) => s + a.count, 0);
        const target = totals.reduce((s, a) => s + (a.target ?? 0), 0);
        const rev = periodFinance(l, w, addDays(w, 6)).grossSales;
        if (target > 0) (done >= target * 0.8 ? hit : miss).push(rev);
      }
      const ah = avg(hit), am = avg(miss);
      if (hit.length >= 2 && miss.length >= 2 && ah !== null && am !== null && ah > am * 1.25 && ah > 0) {
        insights.push({
          key: "activity_sales", tone: "neutral",
          title: "Outreach weeks and sales move together",
          text: `In the ${hit.length} weeks you hit 80%+ of outreach targets, sales averaged ${money(ah)}/week, versus ${money(am)} in the ${miss.length} weeks you didn't. That's a correlation over a few weeks, not proof of cause — but worth watching.`,
        });
      }
    }
  }

  if (habits.pct !== null && prevHabits.pct !== null && habits.pct <= prevHabits.pct - 15) {
    insights.push({
      key: "habits_drop", tone: "caution",
      title: "Habit completion dipped",
      text: `Completion went from ${prevHabits.pct}% to ${habits.pct}%. Schedule changes, travel, or too many habits at once are common reasons — consider trimming or rescheduling rather than pushing harder.`,
    });
  } else if (habits.pct !== null && prevHabits.pct !== null && habits.pct >= prevHabits.pct + 10) {
    insights.push({
      key: "habits_up", tone: "positive",
      title: "Execution improved",
      text: `Habit completion rose from ${prevHabits.pct}% to ${habits.pct}%.`,
    });
  }

  const alert = injuryAlert(data.athletic, symptomSummary(data.symptoms, to));
  if (alert.level === "assess") insights.push({ key: "symptoms", tone: "caution", title: alert.title, text: alert.message });

  // ── priorities for the next period
  const priorities: string[] = [];
  if (alert.level === "assess") priorities.push("Get the ankle (or any persistent pain) assessed before adding running.");
  if (weight && weight.weighIns < Math.min(3, days)) priorities.push("Weigh in on at least 3–4 mornings so the 7-day average stays reliable.");
  if (training.sessions < training.target) {
    priorities.push(`Schedule ${data.athletic?.weekly_session_target ?? 3} sessions next week on your planned training days.`);
  }
  const weakest = habitRows.filter((r) => r.pct !== null && r.pct < 70).sort((a, b) => (a.pct! - b.pct!))[0];
  if (weakest) priorities.push(`Focus on “${weakest.name}” — ${weakest.pct}% this period. Make it smaller or reschedule it if needed.`);
  if (sleep.nights >= 3 && sleep.avgHours !== null && sleep.avgHours < 7) priorities.push(`Protect sleep: you averaged ${sleep.avgHours} h.`);
  if (business) {
    const behind = business.activity.filter((a) => a.target && a.count < a.target * 0.8 && a.kind === "outreach");
    if (behind.length) priorities.push(`Outreach: ${behind.map((a) => `${a.label} ${a.count}/${a.target}`).join(", ")}. Block time for it.`);
    const settings = data.businessSettings;
    if (settings) {
      const g = goalStatus(l, settings, today);
      if (g.remaining > 0) {
        const ways = salesToClose(g.remaining, data.offers).slice(0, 2).map((s) => `${s.count} × ${s.offer.name}`);
        priorities.push(`${METRIC_LABEL[g.metric]} this month: ${money(g.remaining)} to the goal${ways.length ? ` — e.g. ${ways.join(" or ")}` : ""}.`);
      }
    }
  }
  if (!priorities.length) priorities.push(`Keep the system running — repeat what worked through ${fmtShort(to)}.`);

  return { from, to, days, weight, training, sleep, habits, habitRows, business, milestones, setbacks, insights, priorities: priorities.slice(0, 5) };
}

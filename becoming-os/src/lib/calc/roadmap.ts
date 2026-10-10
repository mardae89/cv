// The seven-month roadmap: eight chapters from Oct 10, 2026 to May 24, 2027.
// Targets are planning aids. The original plan is anchored at the confirmed
// starting data; future chapters are re-planned from current results at a
// sustainable pace, never compressed to fit the calendar.
import { diffDays, minDate, MISSION_END, MISSION_START, monthStart } from "../dates";
import { num, round } from "../format";
import type { ISODate, Phase, RoadmapNote, UserData } from "../types";
import { isSession, runningUnlocked } from "./athletic";
import { metricValue, monthFinance, type Ledger } from "./business";
import { indexHabits, periodScore } from "./habits";
import { paceRate, trendAsOf, weightProgress } from "./weight";

export interface ChapterDef {
  key: string;
  start: ISODate;
  end: ISODate;
  title: string;
  objective: string;
  habitFocus: string;
  athleticFocus: string;
  athleticPhase: Phase;
  suggestedActions: string[];
}

export const CHAPTERS: ChapterDef[] = [
  {
    key: "2026-10", start: MISSION_START, end: "2026-10-31", title: "Establish the baseline",
    objective: "Set up profiles, record starting weights, establish current business numbers and expenses, document training readiness, and begin logging every day.",
    habitFocus: "Daily logging",
    athleticFocus: "Document readiness; get the ankle assessed if pain persists",
    athleticPhase: "foundation",
    suggestedActions: ["Confirm starting weight and waist", "Enter current monthly revenue and expenses", "Book an ankle assessment if symptoms persist", "Log something every day"],
  },
  {
    key: "2026-11", start: "2026-11-01", end: "2026-11-30", title: "Build consistency",
    objective: "Establish repeatable nutrition, strength, recovery, outreach and content routines.",
    habitFocus: "Repeatable weekly routine",
    athleticFocus: "Consistent strength and low-impact conditioning",
    athleticPhase: "foundation",
    suggestedActions: ["Hit the weekly session target", "Plan meals and log protein", "Keep daily outreach targets", "Complete every weekly review"],
  },
  {
    key: "2026-12", start: "2026-12-01", end: "2026-12-31", title: "Strengthen the system",
    objective: "Review the first two months of data, improve adherence, and refine offers and marketing.",
    habitFocus: "Adherence through the holidays",
    athleticFocus: "Protect the routine; progress only if recovering well",
    athleticPhase: "foundation",
    suggestedActions: ["Review Oct–Nov trends", "Drop or simplify habits under 60% completion", "Refine one offer", "Plan holiday training days"],
  },
  {
    key: "2027-01", start: "2027-01-01", end: "2027-01-31", title: "Build momentum",
    objective: "Set quarterly targets, evaluate weight trends, develop aerobic conditioning, and focus on the activities most connected to sales.",
    habitFocus: "Quarterly targets",
    athleticFocus: "Aerobic conditioning; return to running only with clearance",
    athleticPhase: "return_to_running",
    suggestedActions: ["Set Q1 targets", "Double down on the activity that converts best", "Review the weight trend vs plan"],
  },
  {
    key: "2027-02", start: "2027-02-01", end: "2027-02-28", title: "Increase capacity",
    objective: "Progress training only when ready, increase consistency, strengthen customer acquisition, and review profitability.",
    habitFocus: "Consistency under load",
    athleticFocus: "Build the aerobic base if running is going well",
    athleticPhase: "aerobic_base",
    suggestedActions: ["Review margins by business", "Add one acquisition channel", "Keep recovery days scheduled"],
  },
  {
    key: "2027-03", start: "2027-03-01", end: "2027-03-31", title: "Prepare for execution",
    objective: "Develop 10K-specific conditioning if medically and physically appropriate. Improve conversion and recurring revenue.",
    habitFocus: "Execution",
    athleticFocus: "10K preparation, if appropriate",
    athleticPhase: "10k_specific",
    suggestedActions: ["Choose a race date", "Improve proposal-to-close rate", "Grow recurring revenue"],
  },
  {
    key: "2027-04", start: "2027-04-01", end: "2027-04-30", title: "Performance and optimization",
    objective: "Work toward race readiness, protect recovery, and evaluate the business against the monthly target.",
    habitFocus: "Recovery and sleep",
    athleticFocus: "Race readiness; protect recovery",
    athleticPhase: "race_ready",
    suggestedActions: ["Evaluate the month against the revenue goal", "Rehearse race logistics", "Prioritise sleep"],
  },
  {
    key: "2027-05", start: "2027-05-01", end: MISSION_END, title: "Complete the mission",
    objective: "Finish the planned race if ready, review the physical and financial transformation, celebrate milestones, and write the next 90-day plan.",
    habitFocus: "Finish strong",
    athleticFocus: "Race, if ready",
    athleticPhase: "race_ready",
    suggestedActions: ["Race day (if ready)", "Full transformation review", "Write the next 90-day plan"],
  },
];

export type ChapterStatus = "upcoming" | "in_progress" | "complete" | "not_started" | "adjusted";

export interface ChapterView {
  def: ChapterDef;
  note: RoadmapNote | null;
  status: ChapterStatus;
  /** Weight target at chapter end from the original plan (anchored at the start). */
  weightPlanned: number | null;
  /** Re-planned target from current results (future chapters only). */
  weightAdjusted: number | null;
  /** Monthly business target for this chapter's month. */
  revenuePlanned: number | null;
  revenueAdjusted: number | null;
  athletic: string;
  actual: {
    weightEnd: number | null;
    weightChange: number | null;
    revenue: number | null;
    sessions: number;
    habitPct: number | null;
    milestones: number;
  };
}

function weightTargetAt(start: number, startDate: ISODate, goalWeight: number, rate: number, at: ISODate): number {
  const weeks = Math.max(0, diffDays(startDate, at) / 7);
  return round(Math.max(goalWeight, start - rate * weeks), 1);
}

export function buildRoadmap(data: UserData, today: ISODate, unlockedDates: ISODate[]): ChapterView[] {
  const wp = weightProgress(data.goals, data.weights);
  const l: Ledger = { transactions: data.transactions, payments: data.payments };
  const metric = data.businessSettings?.goal_metric ?? "revenue";
  const goal = num(data.businessSettings?.goal_amount) || 10000;
  const baseline = data.businessSettings?.baseline_revenue ?? null;
  const idx = indexHabits(data.completions, data.restDays);
  const pace = data.goals?.pace ?? "steady";
  const readiness = data.athletic?.readiness ?? null;

  // Original weight plan: from the confirmed start, at the lesser of the
  // required rate and the sustainable pace.
  let origRate = 0;
  if (wp) {
    const startDate = wp.goal.startDate ?? MISSION_START;
    const weeks = Math.max(1, diffDays(startDate, MISSION_END) / 7);
    origRate = Math.min(wp.goal.targetLoss / weeks, paceRate(pace, wp.goal.start));
  }
  // Adjusted plan: from today's 7-day average.
  let adjRate = 0;
  if (wp) {
    const weeks = Math.max(1, diffDays(today, MISSION_END) / 7);
    const remaining = Math.max(0, wp.trend - wp.goal.targetWeight);
    adjRate = Math.min(remaining / weeks, paceRate(pace, wp.trend));
  }

  // Revenue ramp: baseline in the first month to the goal by April 2027.
  const months = CHAPTERS.map((c) => monthStart(c.start));
  const goalIdx = months.indexOf("2027-04-01");
  const currentIdx = months.findIndex((m) => m === monthStart(today));
  const lastComplete = currentIdx > 0 ? metricValue(monthFinance(l, months[currentIdx - 1]), metric) : null;

  return CHAPTERS.map((def, i) => {
    const note = data.roadmapNotes.find((n) => n.chapter_key === def.key) ?? null;
    const started = today >= def.start;
    const ended = today > def.end;
    let status: ChapterStatus = ended ? "complete" : started ? "in_progress" : "upcoming";
    if (note?.status_override) status = note.status_override === "not_started" ? "not_started" : note.status_override;

    let weightPlanned: number | null = null;
    let weightAdjusted: number | null = null;
    let weightEnd: number | null = null;
    let weightChange: number | null = null;
    if (wp) {
      const startDate = wp.goal.startDate ?? MISSION_START;
      weightPlanned = weightTargetAt(wp.goal.start, startDate, wp.goal.targetWeight, origRate, def.end);
      if (!ended) weightAdjusted = weightTargetAt(wp.trend, today, wp.goal.targetWeight, adjRate, def.end);
      if (started) {
        weightEnd = trendAsOf(wp.series, minDate(def.end, today));
        const before = trendAsOf(wp.series, def.start) ?? wp.goal.start;
        if (weightEnd !== null) weightChange = round(weightEnd - before, 1);
      }
    }

    let revenuePlanned: number | null = null;
    let revenueAdjusted: number | null = null;
    if (data.profile.business_enabled) {
      const b = baseline === null ? 0 : num(baseline);
      const steps = goalIdx + 1;
      revenuePlanned = i >= goalIdx ? goal : round(b + ((goal - b) * (i + 1)) / steps, -2);
      if (!ended && lastComplete !== null && i >= currentIdx && currentIdx >= 0) {
        const remainingSteps = Math.max(1, goalIdx - currentIdx + 1);
        const k = i - currentIdx + 1;
        revenueAdjusted = i >= goalIdx ? goal : round(Math.max(0, lastComplete) + ((goal - Math.max(0, lastComplete)) * k) / remainingSteps, -2);
      }
    }

    const needsClearance = def.athleticPhase !== "foundation" && !runningUnlocked(readiness);
    const athletic = needsClearance
      ? "Running phases are paused until the ankle has been assessed and a clinician agrees. Focus on pain-free strength, mobility and low-impact conditioning."
      : def.athleticFocus;

    const to = minDate(def.end, today);
    return {
      def, note, status, weightPlanned, weightAdjusted, revenuePlanned, revenueAdjusted, athletic,
      actual: {
        weightEnd,
        weightChange,
        revenue: started && data.profile.business_enabled ? metricValue(monthFinance(l, def.start), metric) : null,
        sessions: data.workouts.filter((w) => isSession(w) && w.workout_date >= def.start && w.workout_date <= to).length,
        habitPct: started ? periodScore(data.habits, idx, def.start, to).pct : null,
        milestones: unlockedDates.filter((d) => d >= def.start && d <= def.end).length,
      },
    };
  });
}

export function currentChapter(today: ISODate): ChapterDef | null {
  return CHAPTERS.find((c) => today >= c.start && today <= c.end) ?? null;
}


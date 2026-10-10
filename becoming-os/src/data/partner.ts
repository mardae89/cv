// What a partner can see. Each person's records stay in their own private
// space; the only thing the other person can read is this summary, which the
// owner's own app writes from their sharing settings. A category set to
// hidden never leaves the owner's private space.
import { isRun, isSession } from "@/lib/calc/athletic";
import { goalStatus } from "@/lib/calc/business";
import { dayScore, indexHabits, periodScore } from "@/lib/calc/habits";
import type { Evaluation } from "@/lib/calc/milestones";
import { goalView, weightProgress } from "@/lib/calc/weight";
import { weekStart } from "@/lib/dates";
import { num, round } from "@/lib/format";
import type {
  AchievementRow, ISODate, JournalEntry, PartnerOverview, Review, ShareSettings, UserData, Workout,
} from "@/lib/types";

export interface SharedSummary extends PartnerOverview {
  updated_at: string;
  achievements: Pick<AchievementRow, "id" | "key" | "category" | "tier" | "title" | "achieved_on">[];
  journal: Pick<JournalEntry, "id" | "entry_date" | "kind" | "title" | "body">[];
  reviews: Pick<Review, "id" | "period" | "period_start" | "went_well" | "difficult" | "learned" | "change_next" | "proud">[];
  weights: { date: ISODate; weight: number; trend: number }[];
  workouts: Pick<Workout, "id" | "workout_date" | "activity" | "title" | "duration_min" | "distance_mi">[];
}

const rank = (lvl: string) => ({ percent: 1, summary: 1, pounds: 2, full: 3 } as Record<string, number>)[lvl] ?? 0;

export const DEFAULT_SHARE: ShareSettings = {
  user_id: "", weight: "percent", training: "summary", habits: "summary", health: "none", photos: "none", milestones: "full", business: "none",
};

/** Build the summary this person publishes, containing only what their settings allow. */
export function buildSummary(data: UserData, ev: Evaluation, today: ISODate, share: ShareSettings | null, uid: string): SharedSummary {
  const s = share ?? DEFAULT_SHARE;
  const ws = weekStart(today);
  const out: SharedSummary = {
    partner_id: uid,
    display_name: data.profile.display_name,
    today,
    demo_mode: data.profile.demo_mode,
    levels: {
      weight: s.weight, training: s.training, habits: s.habits, health: s.health, photos: s.photos,
      milestones: s.milestones, business: s.business,
    },
    updated_at: new Date().toISOString(),
    achievements: [],
    journal: [],
    reviews: [],
    weights: [],
    workouts: [],
  };

  if (s.weight !== "none") {
    const g = goalView(data.goals);
    const wp = weightProgress(data.goals, data.weights);
    if (g && wp) {
      out.weight = {
        has_goal: true,
        pct_primary: round(wp.pctPrimary, 1),
        pct_stretch: wp.pctStretch === null ? null : round(wp.pctStretch, 1),
      };
      if (rank(s.weight) >= 2) {
        Object.assign(out.weight, {
          lost: wp.lost, target_loss: g.targetLoss, stretch_loss: g.stretchLoss, remaining: wp.remaining,
          next_milestone: wp.nextMilestone,
        });
      }
      if (s.weight === "full") {
        Object.assign(out.weight, {
          start_weight: g.start, current_trend: wp.latest ? wp.trend : null, target_weight: g.targetWeight,
          latest_entry: wp.latest?.date,
        });
        out.weights = wp.series.slice(-120).map((p) => ({ date: p.date, weight: p.weight, trend: p.trend }));
      }
    } else out.weight = { has_goal: false };
  }

  if (s.training !== "none") {
    const ap = data.athletic;
    const week = data.workouts.filter((w) => w.workout_date >= ws && w.workout_date <= today);
    out.training = {
      week_start: ws,
      sessions_week: week.filter(isSession).length,
      session_target: ap?.weekly_session_target ?? 3,
      run_miles_week: round(week.filter(isRun).reduce((a, w) => a + num(w.distance_mi), 0), 2),
      longest_run: round(data.workouts.filter(isRun).reduce((m, w) => Math.max(m, num(w.distance_mi)), 0), 2),
      strength_week: week.filter((w) => w.activity === "strength").length,
      total_workouts: data.workouts.filter(isSession).length,
      phase: ap?.phase ?? "foundation",
      goal_text: ap?.goal_text ?? "Complete a 10K",
      race_name: ap?.race_name ?? null,
      race_date: ap?.race_date ?? null,
    };
    if (s.training === "full") {
      out.workouts = [...data.workouts].sort((a, b) => (a.workout_date < b.workout_date ? 1 : -1)).slice(0, 40)
        .map((w) => ({ id: w.id, workout_date: w.workout_date, activity: w.activity, title: w.title, duration_min: w.duration_min, distance_mi: w.distance_mi }));
    }
  }

  if (s.habits !== "none") {
    const idx = indexHabits(data.completions, data.restDays);
    const day = dayScore(data.habits, idx, [], today);
    const week = periodScore(data.habits, idx, ws, today);
    out.habits = {
      today_scheduled: day.habitsScheduled, today_done: day.habitsDone,
      week_scheduled: week.scheduled, week_done: week.done, week_pct: week.pct,
    };
  }

  if (s.business !== "none" && data.profile.business_enabled) {
    const settings = data.businessSettings ?? { goal_metric: "revenue" as const, goal_amount: 10000 };
    const g = goalStatus({ transactions: data.transactions, payments: data.payments }, settings, today);
    out.business = { month: today.slice(0, 8) + "01", metric: g.metric, goal: g.goal, value: g.value };
  }

  if (s.milestones === "full") {
    const business = rank(s.business) >= 1 && data.profile.business_enabled;
    // A few habit milestones are really about another category, so they
    // follow that category's setting too.
    const allowed = (m: { key: string; category: string }) =>
      m.category === "weight" ? rank(s.weight) >= 2
        : m.category === "business" ? business
        : m.category === "athletic" ? rank(s.training) >= 1
        : m.category === "habit" ? rank(s.habits) >= 1 &&
          (m.key !== "habit.workouts_30" || rank(s.training) >= 1) &&
          (m.key !== "habit.biz_30" || business) &&
          (m.key !== "habit.sleep_recovery" || s.health === "full")
        : true;
    out.achievements = ev.unlocked.filter(allowed).slice(-60)
      .map((m) => ({ id: m.key, key: m.key, category: m.category, tier: m.tier, title: m.title, achieved_on: m.achievedOn! }));
  }

  out.journal = data.journal.filter((j) => j.shared).sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1)).slice(0, 8)
    .map((j) => ({ id: j.id, entry_date: j.entry_date, kind: j.kind, title: j.title, body: j.body.slice(0, 2000) }));
  out.reviews = data.reviews.filter((r) => r.shared && r.completed_at).sort((a, b) => (a.period_start < b.period_start ? 1 : -1)).slice(0, 6)
    .map((r) => ({
      id: r.id, period: r.period, period_start: r.period_start,
      went_well: r.went_well?.slice(0, 1500) ?? null, difficult: r.difficult?.slice(0, 1500) ?? null,
      learned: r.learned?.slice(0, 1500) ?? null, change_next: r.change_next?.slice(0, 1500) ?? null, proud: r.proud?.slice(0, 1500) ?? null,
    }));
  return out;
}

/** The summary minus volatile fields, for "did anything change?" checks. */
export function summaryFingerprint(s: SharedSummary): string {
  const { updated_at: _u, ...rest } = s;
  void _u;
  return JSON.stringify(rest);
}

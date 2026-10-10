// In-app reminders. These are computed when the app opens and saved to the
// notification centre (deduplicated per day/week). Nothing here sends push
// notifications or email.
import { injuryAlert, isSession, symptomSummary } from "./calc/athletic";
import type { Evaluation } from "./calc/milestones";
import { currentChapter } from "./calc/roadmap";
import { addDays, addMonths, diffDays, dow, fmtMonth, fmtWeekRange, monthStart, weekStart } from "./dates";
import { loggingDates } from "./calc/milestones";
import type { ISODate, ReminderSettings, UserData } from "./types";

export interface ReminderDraft {
  kind: string;
  title: string;
  body: string;
  link: string;
  dedupe_key: string;
}

export function computeReminders(data: UserData, ev: Evaluation, today: ISODate, hour: number, s: ReminderSettings): ReminderDraft[] {
  const out: ReminderDraft[] = [];
  const logged = loggingDates(data);

  if (s.daily_logging && hour >= s.daily_logging_hour && !logged.has(today)) {
    out.push({
      kind: "daily_logging", dedupe_key: `daily:${today}`, link: "/log",
      title: "Nothing logged today yet",
      body: "A weigh-in, a habit or a quick check-in keeps your trends and streaks accurate.",
    });
  }

  const ap = data.athletic;
  if (s.workouts && ap && ap.training_days.includes(dow(today)) && hour >= 9 &&
      !data.workouts.some((w) => w.workout_date === today) && !data.restDays.some((r) => r.rest_date === today)) {
    out.push({
      kind: "workouts", dedupe_key: `workout:${today}`, link: "/log?tab=training",
      title: "Planned training day",
      body: "Log the session when it's done — or mark a rest day if your body needs one.",
    });
  }

  if (s.weekly_review) {
    const d = dow(today);
    const week = d === 0 ? weekStart(today) : d <= 2 ? addDays(weekStart(today), -7) : null;
    if (week && week >= weekStart(data.profile.created_at.slice(0, 10)) &&
        !data.reviews.some((r) => r.period === "week" && r.period_start === week && r.completed_at)) {
      out.push({
        kind: "weekly_review", dedupe_key: `weekly:${week}`, link: `/reviews?week=${week}`,
        title: "Weekly review",
        body: `Review ${fmtWeekRange(week)}: what went well, what was hard, and next week's priorities.`,
      });
    }
  }

  if (s.monthly_review) {
    const dom = Number(today.slice(8, 10));
    const month = dom <= 3 ? addMonths(monthStart(today), -1) : null;
    if (month && month >= monthStart(data.profile.created_at.slice(0, 10)) &&
        !data.reviews.some((r) => r.period === "month" && r.period_start === month && r.completed_at)) {
      out.push({
        kind: "monthly_review", dedupe_key: `monthly:${month}`, link: `/reviews?period=month&month=${month}`,
        title: `Close out ${fmtMonth(month)}`,
        body: "Your monthly review and chapter reflection are ready.",
      });
    }
    const ch = currentChapter(today);
    if (ch && diffDays(ch.start, today) <= 2) {
      out.push({
        kind: "roadmap", dedupe_key: `chapter:${ch.key}`, link: "/roadmap",
        title: `New chapter: ${ch.title}`,
        body: ch.objective,
      });
    }
  }

  if (s.milestones) {
    for (const m of ev.milestones) {
      if (m.achievedOn || !m.progress || m.progress.target <= 0) continue;
      const r = m.progress.current / m.progress.target;
      if (r >= 0.85 && r < 1 && m.progress.current > 0) {
        out.push({
          kind: "milestones", dedupe_key: `near:${m.key}`, link: "/achievements",
          title: `Close: ${m.title}`,
          body: m.requirement,
        });
      }
    }
  }

  if (s.business_targets && data.profile.business_enabled && dow(today) >= 4) {
    const ws = weekStart(today);
    const behind = data.metrics.filter((m) => m.active && m.weekly_target).filter((m) => {
      const n = data.activityLogs.filter((a) => a.metric_id === m.id && a.log_date >= ws && a.log_date <= today)
        .reduce((x, a) => x + a.count, 0);
      return n < (m.weekly_target ?? 0) * 0.5;
    });
    if (behind.length) {
      out.push({
        kind: "business_targets", dedupe_key: `biz:${ws}`, link: "/business",
        title: "Business activity behind pace",
        body: `Under half of this week's target: ${behind.slice(0, 3).map((m) => m.label).join(", ")}${behind.length > 3 ? "…" : ""}.`,
      });
    }
  }

  if (s.recovery) {
    const from = addDays(today, -6);
    const sessions = data.workouts.filter((w) => isSession(w) && w.workout_date >= from).length;
    const rested = data.restDays.some((r) => r.rest_date >= from) ||
      data.workouts.some((w) => w.activity === "recovery" && w.workout_date >= from);
    if (sessions >= 6 && !rested) {
      out.push({
        kind: "recovery", dedupe_key: `recovery:${weekStart(today)}`, link: "/habits",
        title: "Schedule a recovery day",
        body: `${sessions} sessions in the last 7 days and no rest day logged.`,
      });
    }
    const alert = injuryAlert(data.athletic, symptomSummary(data.symptoms, today));
    if (alert.level === "assess") {
      out.push({ kind: "recovery", dedupe_key: `injury:${weekStart(today)}`, link: "/train", title: alert.title, body: alert.message });
    }
  }

  if (s.race_checkpoints && ap?.race_date) {
    const until = diffDays(today, ap.race_date);
    const bucket = [1, 7, 14, 28, 56].find((n) => until >= 0 && until <= n);
    if (bucket !== undefined) {
      out.push({
        kind: "race_checkpoints", dedupe_key: `race:${ap.race_date}:${bucket}`, link: "/train",
        title: until === 0 ? "Race day" : `${until} day${until === 1 ? "" : "s"} to ${ap.race_name || "race day"}`,
        body: until === 0 ? "Only start if you're healthy. Run your own race." : "Check readiness, recovery and logistics. Adjust if symptoms appear.",
      });
    }
  }

  return out;
}

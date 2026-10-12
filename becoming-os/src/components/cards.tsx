import { ArrowRight } from "lucide-react";
import { Link } from "@/components/AppLink";
import { useStore } from "@/data/store";
import { longestRun, PHASES, trainingWeek } from "@/lib/calc/athletic";
import { fmtChange, fmtCount, PLATFORMS, summarize } from "@/lib/calc/audience";
import { settingsOf } from "@/lib/calc/power";
import { METRICS, reachedOn, trafficWeek } from "@/lib/calc/traffic";
import { goalStatus, METRIC_LABEL, monthFinance } from "@/lib/calc/business";
import { nextMilestone } from "@/lib/calc/milestones";
import { weightProgress } from "@/lib/calc/weight";
import { fmtDate, fmtMonth } from "@/lib/dates";
import { lb, money, pct, signed } from "@/lib/format";
import type { PartnerOverview } from "@/lib/types";
import { Card, Eyebrow, Meter, Stat } from "./ui";

function CardHead({ eyebrow, title, to }: { eyebrow: string; title: string; to?: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <Eyebrow className="mb-1">{eyebrow}</Eyebrow>
        <h3 className="text-[24px] leading-none">{title}</h3>
      </div>
      {to && <Link to={to} className="rounded-lg p-1.5 text-faint hover:text-gold" aria-label={`Open ${title}`}><ArrowRight className="h-4 w-4" /></Link>}
    </div>
  );
}

export function FitnessCard() {
  const { data, ev } = useStore();
  const wp = weightProgress(data.goals, data.weights);
  if (!wp) {
    return (
      <Card>
        <CardHead eyebrow="Body" title="My fitness" />
        <p className="text-[13px] text-mute">Confirm your starting weight and goal to start the meters.</p>
        <Link to="/settings#body" className="link mt-3 inline-block text-[13px]">Set starting weight →</Link>
      </Card>
    );
  }
  const g = wp.goal;
  const next = nextMilestone(ev.milestones, "weight");
  return (
    <Card>
      <CardHead eyebrow="Body" title="My fitness" to="/progress" />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Start" value={lb(g.start)} sub={g.startDate ? fmtDate(g.startDate) : undefined} />
        <Stat label="7-day avg" value={lb(wp.trend)} sub={wp.latest ? `Scale ${lb(wp.latest.weight)}` : "No weigh-ins yet"} />
        <Stat label="Target" value={g.stretchWeight ? `${g.stretchWeight}–${g.targetWeight}` : lb(g.targetWeight)} sub={g.stretchWeight ? "lb range" : undefined} />
      </div>
      <div className="mt-5 flex items-baseline gap-2">
        <span className="display-num text-[52px] leading-none text-gold">{Math.max(0, wp.lost).toFixed(1)}</span>
        <span className="text-[14px] text-mute">lb lost{wp.lost < 0 ? ` (${signed(-wp.lost)} lb above start)` : ""}</span>
      </div>
      <div className="mt-4 space-y-3">
        <Meter value={wp.pctPrimary} label={`${g.targetLoss} lb goal`} right={pct(wp.pctPrimary)}
          sub={wp.remaining > 0 ? `${wp.remaining} lb to go` : `Goal reached${wp.pctPrimaryRaw > 100 ? ` · ${pct(wp.pctPrimaryRaw)} of goal` : ""}`} />
        {g.stretchLoss && wp.pctStretch !== null && (
          <Meter thin value={wp.pctStretch} label={`${g.stretchLoss} lb stretch goal`} right={pct(wp.pctStretch)} />
        )}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-hair pt-3 text-[12.5px]">
        <span className="text-mute">Next: <span className="text-bone">{next?.title ?? `${wp.nextMilestone} lb lost`}</span></span>
        <span className="num text-gold">{wp.toNextMilestone > 0 ? `${wp.toNextMilestone} lb away` : ""}</span>
      </div>
      {wp.weekChange !== null && <p className="mt-1 text-[11.5px] text-faint">7-day average {signed(wp.weekChange)} lb vs a week earlier.</p>}
    </Card>
  );
}

export function PartnerFitnessCard({ o }: { o: PartnerOverview }) {
  const w = o.weight;
  return (
    <Card>
      <CardHead eyebrow="Together" title={`${o.display_name || "Partner"}'s progress`} to="/together" />
      {!w ? (
        <p className="text-[13px] text-mute">{o.display_name || "Your partner"} keeps weight progress private.</p>
      ) : !w.has_goal ? (
        <p className="text-[13px] text-mute">{o.display_name || "Your partner"} hasn't set a weight goal yet.</p>
      ) : (
        <>
          {w.lost !== undefined && (
            <div className="mb-4 flex items-baseline gap-2">
              <span className="display-num text-[44px] leading-none text-gold">{Math.max(0, w.lost).toFixed(1)}</span>
              <span className="text-[14px] text-mute">lb lost</span>
            </div>
          )}
          <Meter value={w.pct_primary ?? 0} label={w.target_loss ? `${w.target_loss} lb goal` : "Weight goal"} right={pct(w.pct_primary)}
            sub={w.remaining !== undefined ? `${w.remaining} lb to go · next milestone ${w.next_milestone} lb` : "Shared as a percentage only"} />
          {w.current_trend !== undefined && w.current_trend !== null && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Stat label="Start" value={lb(w.start_weight)} />
              <Stat label="7-day avg" value={lb(w.current_trend)} />
              <Stat label="Target" value={lb(w.target_weight)} />
            </div>
          )}
        </>
      )}
      {o.habits && (
        <div className="mt-4 border-t border-hair pt-3 text-[12.5px] text-mute">
          Today {o.habits.today_done}/{o.habits.today_scheduled} habits · week {o.habits.week_pct === null ? "—" : pct(o.habits.week_pct)}
        </div>
      )}
    </Card>
  );
}

export function BusinessCard() {
  const { data, today, ev } = useStore();
  const s = data.businessSettings ?? { goal_metric: "revenue" as const, goal_amount: 10000 };
  const l = { transactions: data.transactions, payments: data.payments };
  const g = goalStatus(l, s, today);
  const m = monthFinance(l, today);
  const next = nextMilestone(ev.milestones, "business");
  return (
    <Card>
      <CardHead eyebrow={fmtMonth(today)} title="Business" to="/business" />
      <div className="flex items-baseline gap-2">
        <span className="display-num text-[48px] leading-none text-gold">{money(g.value)}</span>
        <span className="text-[13px] text-mute">{METRIC_LABEL[g.metric].toLowerCase()}</span>
      </div>
      <Meter className="mt-4" value={g.pct} label={`Goal ${money(g.goal)}/month`} right={pct(g.pct)}
        sub={g.remaining > 0 ? `${money(g.remaining)} to go · next $1K milestone in ${money(g.toNextThousand)}` : "Monthly goal reached"} />
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-hair pt-4">
        <Stat label="Revenue" value={money(m.revenue)} />
        <Stat label="Cash in" value={money(m.cash)} />
        <Stat label="Net profit" value={money(m.profit)} />
      </div>
      {next && <p className="mt-3 text-[12px] text-mute">Next: <span className="text-bone">{next.title}</span></p>}
    </Card>
  );
}

/** Current follower / subscriber / member counts and how they've moved.
 *  `onLogPage` drops the links that would only lead back to the page it's on. */
export function AudienceCard({ compact, onLogPage }: { compact?: boolean; onLogPage?: boolean }) {
  const { data, today, ev } = useStore();
  const sums = summarize(data.audience, today);
  const next = nextMilestone(ev.milestones, "audience");
  return (
    <Card>
      <CardHead eyebrow="Instagram · YouTube · Skool" title="Audience" to={onLogPage ? undefined : "/log?tab=audience"} />
      <div className="grid grid-cols-3 gap-3">
        {PLATFORMS.map((p) => {
          const s = sums.find((x) => x.platform.key === p.key);
          return (
            <Stat key={p.key} label={p.name} value={s ? fmtCount(s.current.count) : "—"}
              sub={!s ? `No ${p.unit} yet`
                : s.change30 !== null ? `${fmtChange(s.change30)} in 30 days`
                : s.readings > 1 ? `${fmtChange(s.sinceStart)} since ${fmtDate(s.first.date)}`
                : `${p.unit} · ${fmtDate(s.current.date)}`} />
          );
        })}
      </div>
      {!compact && sums.length > 0 && (
        <p className="mt-3 text-[12px] text-mute">
          Last recorded {fmtDate(sums.map((s) => s.current.date).sort().pop()!)}
          {next && <> · Next: <span className="text-bone">{next.title}</span></>}
        </p>
      )}
      {!onLogPage && <Link to="/log?tab=audience" className="link mt-3 inline-block text-[13px]">{sums.length ? "Update counts" : "Record your counts"} →</Link>}
    </Card>
  );
}

/** The Traffic Engine's four numbers for this week, and today's daily ten. */
export function TrafficCard() {
  const { data, today } = useStore();
  const target = settingsOf(data).reach_per_day;
  const w = trafficWeek(data.traffic, today);
  const reached = reachedOn(data.traffic, today);
  return (
    <Card>
      <CardHead eyebrow="Traffic Engine · this week" title="The four numbers" to="/traffic" />
      <div className="grid grid-cols-4 gap-2">
        {METRICS.map((m) => <Stat key={m.key} label={m.short === "Conversations" ? "Convos" : m.short} value={w.totals[m.key].toLocaleString("en-US")} accent={m.key === "members"} />)}
      </div>
      <Meter className="mt-4" value={reached} max={Math.max(1, target)} label="New people today" right={`${reached} / ${target}`} />
      <Link to="/traffic" className="link mt-3 inline-block text-[13px]">Log numbers →</Link>
    </Card>
  );
}

export function AthleticCard() {
  const { data, today, ev } = useStore();
  const target = data.athletic?.weekly_session_target ?? 3;
  const wk = trainingWeek(data.workouts, today, target, today);
  const lr = longestRun(data.workouts);
  const next = nextMilestone(ev.milestones, "athletic");
  const phase = PHASES.find((p) => p.key === (data.athletic?.phase ?? "foundation"))!;
  return (
    <Card>
      <CardHead eyebrow={`Phase · ${phase.name}`} title="Training" to="/train" />
      <Meter value={wk.sessions} max={target} label="This week" right={`${wk.sessions} / ${target} sessions`} />
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Run miles" value={wk.runMiles.toFixed(1)} sub="this week" />
        <Stat label="Longest run" value={lr.distance ? `${lr.distance} mi` : "—"} sub={lr.date ? fmtDate(lr.date) : "all time"} />
        <Stat label="Strength" value={wk.strength} sub="this week" />
      </div>
      {next && (
        <div className="mt-4 border-t border-hair pt-3">
          <div className="text-[12px] text-mute">Next: <span className="text-bone">{next.title}</span></div>
          {next.progress && <Meter thin className="mt-2" value={next.progress.current} max={next.progress.target} />}
        </div>
      )}
    </Card>
  );
}

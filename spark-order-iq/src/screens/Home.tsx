import { useMemo, useState } from "react";
import { Header } from "../components/Header";
import { Banner, Button, Card, Field, NumberInput, ProgressBar, SectionLabel, Sheet, Stat } from "../components/ui";
import { hourly as fmtHourly, money, num, percent } from "../lib/format";
import { GOAL_PRESETS } from "../lib/settings";
import { projectedFinish } from "../lib/stats";
import type { DailyProgress } from "../lib/types";
import { useStore } from "../state/store";

/** Next round-number checkpoint on the way to the goal. */
function nextMilestone(earned: number, goal: number): number | null {
  const step = goal >= 200 ? 50 : 25;
  const next = Math.floor(earned / step) * step + step;
  return next < goal ? next : null;
}

export function Home({
  progress,
  onAnalyze,
  onAddEarnings,
  onSeeStats,
}: {
  progress: DailyProgress;
  onAnalyze: () => void;
  onAddEarnings: () => void;
  onSeeStats: () => void;
}) {
  const { settings, updateSettings, orders, loadSampleData, hasSampleData } = useStore();
  const [goalOpen, setGoalOpen] = useState(false);
  const [customGoal, setCustomGoal] = useState<number | null>(settings.dailyGoal);

  const projected = useMemo(() => projectedFinish(progress, settings), [progress, settings]);
  const milestone = nextMilestone(progress.earned, progress.goal);
  const reached = progress.earned >= progress.goal && progress.goal > 0;
  const close = !reached && progress.remaining > 0 && progress.remaining <= Math.max(progress.goal * 0.12, 15);

  const today = new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="anim-rise">
      <Header title="SPARK ORDER IQ" subtitle={today} />

      <Card className="relative overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="label">🔥 Today's mission</span>
          <button type="button" onClick={() => setGoalOpen(true)} className="tnum text-sm font-bold text-gold">
            {money(progress.goal, 2)} GOAL ›
          </button>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <div className="tnum text-5xl font-black leading-none text-white">{money(progress.earned)}</div>
            <div className="label mt-2">Earned</div>
          </div>
          <div className="text-right">
            <div className="tnum text-2xl font-bold leading-none text-gold">{money(progress.remaining)}</div>
            <div className="label mt-1.5">Remaining</div>
          </div>
        </div>

        <div className="mt-4">
          <ProgressBar percent={progress.percent} tone={reached ? "take" : "gold"} height="h-4" />
          <div className="mt-1.5 flex justify-between text-xs text-mute tnum">
            <span>{percent(progress.percent, 1)}</span>
            <span>{fmtHourly(progress.hourly)} current pace</span>
          </div>
        </div>
      </Card>

      {reached ? (
        <div className="mt-3 anim-pop">
          <Banner tone="gold" title="🏆 Goal reached">
            {money(progress.earned)} against a {money(progress.goal, 0)} goal. Everything from here is on top.
          </Banner>
        </div>
      ) : null}

      {close ? (
        <div className="mt-3 anim-pop">
          <Banner tone="gold" title="⚡ You're close">
            {money(progress.earned)} / {money(progress.goal, 0)} — {money(progress.remaining)} to go. One decent offer finishes
            the day.
          </Banner>
        </div>
      ) : null}

      <div className="mt-4">
        <Button size="lg" full onClick={onAnalyze}>
          📸 ANALYZE OFFER
        </Button>
        <Button size="md" variant="secondary" full className="mt-2" onClick={onAddEarnings}>
          + ADD EARNINGS
        </Button>
      </div>

      <div className="mt-5">
        <SectionLabel>Order status</SectionLabel>
        <Card>
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gold" />
            <div className="text-sm text-mute">
              Waiting for your next offer. Screenshot it in Spark, then tap Analyze.
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-5">
        <SectionLabel right={<button type="button" onClick={onSeeStats} className="text-xs font-semibold text-gold">All stats ›</button>}>
          Today's stats
        </SectionLabel>
        <Card>
          <div className="grid grid-cols-2 gap-y-4">
            <Stat label="Orders" value={progress.orders} />
            <Stat label="Earned" value={money(progress.earned)} tone="gold" />
            <Stat label="Miles" value={num(progress.miles)} sub="logged" />
            <Stat label="Per hour" value={fmtHourly(progress.hourly)} sub="from logged time" />
          </div>
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Card>
          <div className="label">Projected finish</div>
          <div className="tnum mt-1 text-2xl font-bold text-white">{projected === null ? "—" : money(projected)}</div>
          <div className="mt-1 text-xs text-mute">
            {projected === null
              ? "Log an order to see a pace"
              : `At your pace, up to a ${settings.typicalShiftHours}h day`}
          </div>
        </Card>
        <Card>
          <div className="label">Next milestone</div>
          <div className="tnum mt-1 text-2xl font-bold text-gold">
            {reached ? money(progress.earned) : milestone === null ? money(progress.goal, 0) : money(milestone, 0)}
          </div>
          <div className="mt-1 text-xs text-mute">
            {reached
              ? "Goal cleared"
              : `${money(Math.max((milestone ?? progress.goal) - progress.earned, 0))} away`}
          </div>
        </Card>
      </div>

      {orders.length === 0 ? (
        <div className="mt-5">
          <Banner tone="info" title="Nothing logged yet">
            Analyze an offer, or load sample data to see how the dashboard behaves.
            <div className="mt-3">
              <Button size="sm" variant="secondary" onClick={loadSampleData}>
                Load sample data
              </Button>
            </div>
          </Banner>
        </div>
      ) : null}

      {hasSampleData ? (
        <p className="mt-4 px-1 text-center text-xs text-mute">
          Some rows are sample data. Clear them from Settings when you're ready.
        </p>
      ) : null}

      <Sheet open={goalOpen} onClose={() => setGoalOpen(false)} title="Daily goal">
        <div className="grid grid-cols-3 gap-2">
          {GOAL_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                updateSettings({ dailyGoal: preset });
                setCustomGoal(preset);
                setGoalOpen(false);
              }}
              className={`tnum h-14 rounded-xl border text-lg font-bold ${
                settings.dailyGoal === preset ? "border-gold bg-gold text-ink" : "border-line bg-panel-2 text-white"
              }`}
            >
              ${preset}
            </button>
          ))}
        </div>
        <div className="mt-4">
          <Field label="Custom goal">
            <NumberInput value={customGoal} onValueChange={setCustomGoal} prefix="$" step="5" />
          </Field>
          <Button
            full
            className="mt-3"
            onClick={() => {
              if (customGoal !== null && customGoal > 0) updateSettings({ dailyGoal: customGoal });
              setGoalOpen(false);
            }}
          >
            SET GOAL
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

import { hourly as fmtHourly, minutes as fmtMinutes, money, num, perMile } from "../lib/format";
import type { Evaluation } from "../lib/scoring";
import type { Decision, OfferDraft } from "../lib/types";
import { Banner, Button, Card, ProgressBar, SectionLabel, Stat } from "./ui";

const TONE: Record<Decision, { text: string; border: string; bg: string; dot: string }> = {
  TAKE: { text: "text-take", border: "border-take/50", bg: "bg-take/10", dot: "bg-take" },
  CONSIDER: { text: "text-consider", border: "border-consider/50", bg: "bg-consider/10", dot: "bg-consider" },
  SKIP: { text: "text-skip", border: "border-skip/50", bg: "bg-skip/10", dot: "bg-skip" },
};

export function ResultView({
  evaluation,
  draft,
  onLog,
  onAnalyzeAnother,
  onEdit,
}: {
  evaluation: Evaluation;
  draft: OfferDraft;
  onLog: () => void;
  onAnalyzeAnother: () => void;
  onEdit: () => void;
}) {
  const tone = TONE[evaluation.decision];
  const { economics: econ, goalImpact: goal } = evaluation;

  return (
    <div className="space-y-4">
      <div className={`anim-pop rounded-card border ${tone.border} ${tone.bg} p-6 text-center`}>
        <div className="label">Order result</div>
        <div className={`mt-3 flex items-center justify-center gap-3 text-5xl font-black tracking-tight ${tone.text}`}>
          <span className={`h-3.5 w-3.5 rounded-full ${tone.dot}`} />
          {evaluation.decision}
        </div>
        <div className="mt-4 flex items-baseline justify-center gap-1">
          <span className="tnum text-6xl font-black leading-none">{evaluation.score}</span>
          <span className="text-xl font-bold text-mute">/100</span>
        </div>
        <p className="mt-3 text-xs text-mute">Based on your settings and the details you supplied.</p>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-y-5">
          <Stat label="Pay" value={money(draft.payout)} tone="gold" />
          <Stat label="Est. total miles" value={num(econ.totalMiles)} sub={`${num(draft.offerMiles)} offer + ${num(draft.pickupDistanceMiles)} pickup`} />
          <Stat label="Per mile" value={perMile(econ.payPerMile)} />
          <Stat label="Est. hourly" value={fmtHourly(econ.estimatedHourly)} sub={econ.totalMinutes === null ? "no time given" : fmtMinutes(econ.totalMinutes)} />
        </div>
      </Card>

      <Card>
        <SectionLabel>Estimated profit</SectionLabel>
        <div className="space-y-2 text-sm">
          <Row label="Gross" value={money(draft.payout)} />
          <Row label="Est. vehicle cost" value={`-${money(econ.estimatedVehicleCost)}`} muted />
          <div className="h-px bg-line" />
          <Row label="Est. profit" value={money(econ.estimatedProfit)} bold tone={econ.estimatedProfit > 0 ? "text-take" : "text-skip"} />
        </div>
        <p className="mt-3 text-xs text-mute">
          An estimate: {num(econ.totalMiles)} est. miles at your vehicle cost. It isn't a measured expense.
        </p>
      </Card>

      <Card>
        <SectionLabel>Goal impact</SectionLabel>
        <div className="flex items-center gap-2 text-2xl font-bold tnum">
          <span className="text-mute">{money(goal.current)}</span>
          <span className="text-gold">→</span>
          <span className={goal.reachesGoal ? "text-take" : "text-white"}>{money(goal.afterOrder)}</span>
        </div>
        <div className="mt-3">
          <ProgressBar percent={goal.percentAfter} tone={goal.reachesGoal || goal.alreadyReached ? "take" : "gold"} />
        </div>
        <p className="mt-2 text-sm text-mute tnum">
          {goal.alreadyReached
            ? "Daily goal already met — this is on top."
            : goal.reachesGoal
              ? `🏆 Finishes today's ${money(goal.goal, 0)} goal`
              : `${money(goal.remainingAfter)} would still be remaining`}
        </p>
      </Card>

      <Card>
        <SectionLabel>Why</SectionLabel>
        <ul className="space-y-2 text-sm">
          {evaluation.reasons.map((reason, i) => (
            <li key={i} className="flex gap-2.5">
              <span className={reason.tone === "pass" ? "text-take" : reason.tone === "warn" ? "text-consider" : "text-skip"}>
                {reason.tone === "pass" ? "✓" : reason.tone === "warn" ? "⚠" : "✕"}
              </span>
              <span className={reason.tone === "fail" ? "text-white" : "text-mute"}>{reason.text}</span>
            </li>
          ))}
          {evaluation.reasons.length === 0 ? <li className="text-mute">No rules are switched on — this is score only.</li> : null}
        </ul>
      </Card>

      <Card>
        <SectionLabel>Score breakdown</SectionLabel>
        <div className="space-y-3">
          {evaluation.components
            .filter((c) => c.max > 0)
            .map((component) => (
              <div key={component.key}>
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">{component.label}</span>
                  <span className="tnum text-mute">
                    {component.score.toFixed(0)}/{component.max}
                  </span>
                </div>
                <div className="mt-1.5">
                  <ProgressBar percent={(component.score / component.max) * 100} height="h-2" />
                </div>
                <div className="mt-1 text-xs text-mute">{component.detail}</div>
              </div>
            ))}
        </div>
        <p className="mt-4 text-xs text-mute">
          A decision-support score built from your thresholds — not a guarantee that an order will be profitable.
        </p>
      </Card>

      {evaluation.warnings.length > 0 ? (
        <Banner tone="warn" title="Worth knowing">
          <ul className="mt-1 space-y-1">
            {evaluation.warnings.map((warning, i) => (
              <li key={i}>• {warning}</li>
            ))}
          </ul>
        </Banner>
      ) : null}

      <div className="space-y-2 pt-1">
        <Button size="lg" full onClick={onLog}>
          + ADD ORDER TO TODAY
        </Button>
        <Button size="md" variant="secondary" full onClick={onAnalyzeAnother}>
          ANALYZE ANOTHER
        </Button>
        <Button size="sm" variant="ghost" full onClick={onEdit}>
          Edit these details
        </Button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  bold,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-mute" : ""}>{label}</span>
      <span className={`tnum ${bold ? "text-lg font-bold" : ""} ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

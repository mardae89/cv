import { RULE_META } from "./settings";
import type { DailyProgress, Decision, PickupType, RuleKey, ScoreKey, Settings } from "./types";

/**
 * The scoring engine. Deliberately free of React, DOM and storage so it can be
 * unit-tested and tuned on its own.
 *
 * Nothing here claims an order *will* be profitable. Every number is an
 * estimate built from what the driver supplied plus their own configured
 * thresholds.
 */

export interface EvaluationInput {
  payout: number;
  offerMiles: number;
  pickupDistanceMiles: number;
  estimatedMinutes: number | null;
  items: number | null;
  orders: number | null;
  stops: number | null;
  shopping: boolean;
  heavyItems: boolean;
  pickupType: PickupType;
}

export interface Economics {
  totalMiles: number;
  payPerMile: number | null;
  pickupMinutes: number;
  totalMinutes: number | null;
  estimatedHourly: number | null;
  estimatedVehicleCost: number;
  estimatedProfit: number;
  estimatedProfitPerHour: number | null;
}

export interface RuleCheck {
  key: RuleKey;
  label: string;
  /** null when the offer is missing the data this rule needs. */
  passed: boolean | null;
  enabled: boolean;
  actual: number | null;
  threshold: number;
  /** Relative slack against the threshold: 0.12 = 12% better than required. */
  margin: number | null;
  text: string;
}

export interface ScoreComponent {
  key: ScoreKey;
  label: string;
  score: number;
  max: number;
  detail: string;
}

export interface GoalImpact {
  goal: number;
  current: number;
  afterOrder: number;
  remainingBefore: number;
  remainingAfter: number;
  reachesGoal: boolean;
  alreadyReached: boolean;
  percentBefore: number;
  percentAfter: number;
  /** Share of what's left on the day that this one offer would cover, 0–1. */
  coversRemaining: number;
}

export interface Reason {
  tone: "pass" | "warn" | "fail";
  text: string;
}

export interface Evaluation {
  decision: Decision;
  score: number;
  economics: Economics;
  components: ScoreComponent[];
  checks: RuleCheck[];
  goalImpact: GoalImpact;
  reasons: Reason[];
  warnings: string[];
  /** Fields that could not be evaluated because data was missing. */
  unknowns: string[];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Maps "how does the actual value compare to the driver's threshold" onto a
 * 0..max score. Meeting the threshold exactly earns most of the points; beating
 * it by `stretch` earns all of them.
 */
function ramp(ratio: number, max: number, floor = 0.6, atTarget = 0.72, stretch = 1.6): number {
  if (!Number.isFinite(ratio)) return 0;
  if (ratio <= floor) return 0;
  if (ratio < 1) return max * atTarget * ((ratio - floor) / (1 - floor));
  if (ratio >= stretch) return max;
  return max * (atTarget + (1 - atTarget) * ((ratio - 1) / (stretch - 1)));
}

export function computeEconomics(input: EvaluationInput, settings: Settings): Economics {
  const totalMiles = input.offerMiles + input.pickupDistanceMiles;
  const payPerMile = totalMiles > 0 ? input.payout / totalMiles : null;
  const pickupMinutes = input.pickupDistanceMiles * settings.pickupMinutesPerMile;
  const totalMinutes =
    input.estimatedMinutes === null
      ? null
      : input.estimatedMinutes + (settings.includePickupTimeInHourly ? pickupMinutes : 0);
  const estimatedHourly = totalMinutes && totalMinutes > 0 ? input.payout / (totalMinutes / 60) : null;
  const estimatedVehicleCost = totalMiles * settings.vehicleCostPerMile;
  const estimatedProfit = input.payout - estimatedVehicleCost;
  return {
    totalMiles,
    payPerMile,
    pickupMinutes,
    totalMinutes,
    estimatedHourly,
    estimatedVehicleCost,
    estimatedProfit,
    estimatedProfitPerHour: totalMinutes && totalMinutes > 0 ? estimatedProfit / (totalMinutes / 60) : null,
  };
}

function minCheck(
  key: RuleKey,
  actual: number | null,
  settings: Settings,
  format: (n: number) => string,
): RuleCheck {
  const rule = settings.rules[key];
  const meta = RULE_META[key];
  const margin = actual === null || rule.value <= 0 ? null : actual / rule.value - 1;
  return {
    key,
    label: meta.label,
    enabled: rule.enabled,
    actual,
    threshold: rule.value,
    margin,
    passed: actual === null ? null : actual >= rule.value,
    text: `${format(rule.value)} minimum`,
  };
}

function maxCheck(
  key: RuleKey,
  actual: number | null,
  settings: Settings,
  format: (n: number) => string,
): RuleCheck {
  const rule = settings.rules[key];
  const meta = RULE_META[key];
  const margin = actual === null || actual <= 0 ? null : rule.value / actual - 1;
  return {
    key,
    label: meta.label,
    enabled: rule.enabled,
    actual,
    threshold: rule.value,
    margin,
    passed: actual === null ? null : actual <= rule.value,
    text: `${format(rule.value)} maximum`,
  };
}

export function buildChecks(input: EvaluationInput, econ: Economics, settings: Settings): RuleCheck[] {
  return [
    minCheck("minPayout", input.payout, settings, (n) => `$${n.toFixed(2)}`),
    minCheck("minPerMile", econ.payPerMile, settings, (n) => `$${n.toFixed(2)}/mi`),
    minCheck("minHourly", econ.estimatedHourly, settings, (n) => `$${n.toFixed(0)}/hr`),
    maxCheck("maxTotalMiles", econ.totalMiles, settings, (n) => `${n} mi`),
    maxCheck("maxPickupDistance", input.pickupDistanceMiles, settings, (n) => `${n} mi`),
    maxCheck("maxItems", input.items, settings, (n) => `${n} items`),
    minCheck("minProfit", econ.estimatedProfit, settings, (n) => `$${n.toFixed(2)}`),
  ];
}

export function computeGoalImpact(payout: number, progress: DailyProgress): GoalImpact {
  const goal = Math.max(progress.goal, 0);
  const current = progress.earned;
  const remainingBefore = Math.max(goal - current, 0);
  const afterOrder = current + payout;
  const remainingAfter = Math.max(goal - afterOrder, 0);
  return {
    goal,
    current,
    afterOrder,
    remainingBefore,
    remainingAfter,
    reachesGoal: remainingBefore > 0 && afterOrder >= goal,
    alreadyReached: remainingBefore <= 0,
    percentBefore: goal > 0 ? clamp((current / goal) * 100, 0, 999) : 0,
    percentAfter: goal > 0 ? clamp((afterOrder / goal) * 100, 0, 999) : 0,
    coversRemaining: remainingBefore > 0 ? clamp(payout / remainingBefore, 0, 1) : 1,
  };
}

function complexityScore(input: EvaluationInput, settings: Settings, max: number): ScoreComponent {
  const notes: string[] = [];
  let penalty = 0;

  const itemBenchmark = Math.max(settings.rules.maxItems.value, 10);
  if (input.items !== null) {
    const over = clamp((input.items - 15) / Math.max(itemBenchmark - 15, 1), 0, 1.25);
    const deduct = over * max * 0.4;
    if (deduct > 0.2) notes.push(`${input.items} items`);
    penalty += deduct;
  }
  if (input.shopping) {
    penalty += max * 0.2;
    notes.push("shop + deliver");
  }
  if (input.heavyItems) {
    penalty += max * 0.2;
    notes.push("heavy/bulky");
  }
  const extraStops = Math.max((input.stops ?? input.orders ?? 1) - 1, 0);
  if (extraStops > 0) {
    penalty += clamp(extraStops, 0, 2) * max * 0.13;
    notes.push(`${extraStops + 1} stops`);
  }

  const score = clamp(max - penalty, 0, max);
  return {
    key: "complexity",
    label: "Complexity",
    score,
    max,
    detail: notes.length ? notes.join(" · ") : "Straightforward drop-off",
  };
}

export function evaluateOrder(
  input: EvaluationInput,
  settings: Settings,
  progress: DailyProgress,
): Evaluation {
  const econ = computeEconomics(input, settings);
  const checks = buildChecks(input, econ, settings);
  const goalImpact = computeGoalImpact(input.payout, progress);
  const byKey = (k: RuleKey) => checks.find((c) => c.key === k)!;
  const w = settings.weights;
  const unknowns: string[] = [];

  // Pay — payout against the driver's floor.
  const pay: ScoreComponent = {
    key: "pay",
    label: "Pay",
    score: ramp(input.payout / Math.max(settings.rules.minPayout.value, 1), w.pay),
    max: w.pay,
    detail: `$${input.payout.toFixed(2)} vs $${settings.rules.minPayout.value.toFixed(0)} min`,
  };

  // Distance — mostly $/mile, partly how much of the mileage budget it eats.
  const perMileRatio = econ.payPerMile === null ? 0 : econ.payPerMile / Math.max(settings.rules.minPerMile.value, 0.01);
  const mileageRatio =
    econ.totalMiles > 0 ? Math.max(settings.rules.maxTotalMiles.value, 1) / econ.totalMiles : 0;
  const distance: ScoreComponent = {
    key: "distance",
    label: "Distance",
    score: ramp(perMileRatio, w.distance) * 0.7 + ramp(mileageRatio, w.distance) * 0.3,
    max: w.distance,
    detail:
      econ.payPerMile === null
        ? "No mileage supplied"
        : `$${econ.payPerMile.toFixed(2)}/mi over ${econ.totalMiles.toFixed(1)} est. mi`,
  };

  // Hourly — only scored when the offer supplied an estimated time.
  let hourly: ScoreComponent;
  if (econ.estimatedHourly === null) {
    unknowns.push("Estimated time wasn't provided, so the hourly rate is unknown.");
    hourly = { key: "hourly", label: "Hourly", score: 0, max: 0, detail: "No estimated time" };
  } else {
    hourly = {
      key: "hourly",
      label: "Hourly",
      score: ramp(econ.estimatedHourly / Math.max(settings.rules.minHourly.value, 1), w.hourly),
      max: w.hourly,
      detail: `$${econ.estimatedHourly.toFixed(2)}/hr vs $${settings.rules.minHourly.value.toFixed(0)} min`,
    };
  }

  const complexity = complexityScore(input, settings, w.complexity);
  if (input.items === null && input.shopping) {
    unknowns.push("Item count wasn't read, so shopping time is a rough guess.");
  }

  const goal: ScoreComponent = {
    key: "goal",
    label: "Goal progress",
    score: goalImpact.alreadyReached
      ? w.goal * 0.7
      : w.goal * clamp(0.3 + 0.7 * goalImpact.coversRemaining, 0, 1),
    max: w.goal,
    detail: goalImpact.alreadyReached
      ? "Daily goal already met"
      : goalImpact.reachesGoal
        ? "Finishes today's goal"
        : `Covers ${(goalImpact.coversRemaining * 100).toFixed(0)}% of what's left`,
  };

  const components = [pay, distance, hourly, complexity, goal];
  const maxTotal = components.reduce((a, c) => a + c.max, 0);
  const rawTotal = components.reduce((a, c) => a + c.score, 0);
  const score = maxTotal > 0 ? Math.round((rawTotal / maxTotal) * 100) : 0;

  // --- Decision -------------------------------------------------------------
  // Rules the driver switched off never block a decision; they still inform the
  // score, because the thresholds double as benchmarks.
  const active = checks.filter((c) => c.enabled);
  const failures = active.filter((c) => c.passed === false);
  const blindSpots = active.filter((c) => c.passed === null);

  let decision: Decision;
  if (failures.length >= 2) {
    decision = "SKIP";
  } else if (failures.length === 1) {
    const only = failures[0]!;
    const narrow = only.margin !== null && only.margin > -0.08;
    decision = narrow && score >= 62 ? "CONSIDER" : "SKIP";
  } else if (score >= 78) {
    // Everything the driver's active rules could check passed. A rule that
    // couldn't be checked at all holds the call back to CONSIDER rather than
    // letting the app overpromise on data it never saw.
    decision = blindSpots.length > 0 ? "CONSIDER" : "TAKE";
  } else {
    decision = "CONSIDER";
  }

  // --- Explanations ---------------------------------------------------------
  const reasons: Reason[] = [];
  const warnings: string[] = [];

  const describe = (check: RuleCheck, strongText: string, okText: string, failText: string) => {
    if (!check.enabled || check.passed === null) return;
    if (check.passed === false) {
      reasons.push({ tone: "fail", text: failText });
      return;
    }
    const strong = (check.margin ?? 0) >= 0.25;
    const tight = (check.margin ?? 0) < 0.08;
    reasons.push({ tone: tight ? "warn" : "pass", text: strong ? strongText : okText });
    if (tight) warnings.push(`${check.label} is right at your limit.`);
  };

  describe(
    byKey("minPayout"),
    `Strong payout at $${input.payout.toFixed(2)}`,
    `Meets your $${settings.rules.minPayout.value.toFixed(0)} minimum payout`,
    `Below your $${settings.rules.minPayout.value.toFixed(0)} minimum payout`,
  );
  describe(
    byKey("minPerMile"),
    `Strong $/mile at ${econ.payPerMile?.toFixed(2)}`,
    `$${econ.payPerMile?.toFixed(2)}/mi clears your minimum`,
    `Below your $${settings.rules.minPerMile.value.toFixed(2)}/mi minimum`,
  );
  describe(
    byKey("minHourly"),
    `Strong estimated hourly at $${econ.estimatedHourly?.toFixed(2)}`,
    `Estimated $${econ.estimatedHourly?.toFixed(2)}/hr clears your minimum`,
    `Estimated hourly below your $${settings.rules.minHourly.value.toFixed(0)}/hr target`,
  );
  describe(
    byKey("maxTotalMiles"),
    `Well within your ${settings.rules.maxTotalMiles.value} mile limit`,
    `Within your ${settings.rules.maxTotalMiles.value} mile limit`,
    `${econ.totalMiles.toFixed(1)} est. miles is over your ${settings.rules.maxTotalMiles.value} mile limit`,
  );
  describe(
    byKey("maxPickupDistance"),
    `Short ${input.pickupDistanceMiles.toFixed(1)} mi drive to the store`,
    `Pickup drive within your limit`,
    `${input.pickupDistanceMiles.toFixed(1)} mi to pickup is past your limit`,
  );
  describe(
    byKey("maxItems"),
    `Light item count`,
    `Item count within your limit`,
    `${input.items ?? 0} items is over your limit`,
  );
  describe(
    byKey("minProfit"),
    `Estimated profit of $${econ.estimatedProfit.toFixed(2)} after vehicle cost`,
    `Estimated profit clears your minimum`,
    `Estimated profit of $${econ.estimatedProfit.toFixed(2)} is below your minimum`,
  );

  if (goalImpact.reachesGoal) {
    reasons.push({ tone: "pass", text: "Finishes today's goal" });
  } else if (!goalImpact.alreadyReached && goalImpact.coversRemaining >= 0.4) {
    reasons.push({ tone: "pass", text: "Meaningful progress toward today's goal" });
  }

  if (input.shopping) warnings.push("Shop-and-deliver: the estimated time may not cover a slow pick.");
  if (input.heavyItems) warnings.push("Heavy or bulky items flagged on this offer.");
  for (const spot of blindSpots) {
    warnings.push(`${spot.label} couldn't be checked — that value is missing.`);
  }
  warnings.push(...unknowns);

  return {
    decision,
    score,
    economics: econ,
    components,
    checks,
    goalImpact,
    reasons,
    warnings,
    unknowns,
  };
}

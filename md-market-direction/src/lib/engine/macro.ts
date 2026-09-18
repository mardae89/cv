import type { Asset, EvidenceItem, MacroSnapshot } from "@/lib/types";
import { clamp } from "./indicators";

/**
 * MACRO ENGINE.
 *
 * Each asset declares a sensitivity (beta) to six macro factors. The macro
 * reading is the beta-weighted average of the current factor readings, so the
 * same macro snapshot produces opposite conclusions for, say, gold and the
 * dollar — as it should.
 */

const FACTOR_LABELS: Record<keyof Asset["macroBetas"], string> = {
  dollar: "US dollar",
  realYields: "Real yields",
  riskAppetite: "Risk appetite",
  inflation: "Inflation",
  growth: "Growth",
  rates: "Rate expectations",
};

export interface MacroReadingResult {
  strength: number;
  drivers: EvidenceItem[];
  available: boolean;
}

export function analyseMacro(asset: Asset, macro: MacroSnapshot): MacroReadingResult {
  const factors: Record<keyof Asset["macroBetas"], number> = {
    dollar: macro.dollar,
    realYields: macro.realYields,
    riskAppetite: macro.riskAppetite,
    inflation: macro.inflation,
    growth: macro.growth,
    rates: macro.policyStance,
  };

  let weighted = 0;
  let total = 0;
  const contributions: { key: keyof Asset["macroBetas"]; value: number; factor: number; beta: number }[] = [];

  (Object.keys(factors) as (keyof Asset["macroBetas"])[]).forEach((key) => {
    const beta = asset.macroBetas[key];
    if (!beta) return;
    const contribution = beta * factors[key];
    weighted += contribution;
    total += Math.abs(beta);
    contributions.push({ key, value: contribution, factor: factors[key], beta });
  });

  if (total === 0) return { strength: 0, drivers: [], available: false };

  const strength = clamp(weighted / total, -1, 1);

  const drivers: EvidenceItem[] = contributions
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 4)
    .map((c) => {
      const factorWord = c.factor > 0.15 ? "rising" : c.factor < -0.15 ? "easing" : "broadly stable";
      const effect = c.value > 0.08 ? "Supportive" : c.value < -0.08 ? "A headwind" : "Neutral";
      return {
        label: FACTOR_LABELS[c.key],
        detail: `${FACTOR_LABELS[c.key]} is ${factorWord}. ${asset.symbol} typically moves ${c.beta > 0 ? "with" : "against"} this factor, so the current setting is ${effect.toLowerCase()}.`,
        impact: clamp(c.value, -1, 1),
      };
    });

  return { strength, drivers, available: true };
}

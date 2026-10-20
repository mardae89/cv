import type { MacroSnapshot } from "@/lib/types";
import { rng } from "@/lib/utils/random";

const DAY = 24 * 60 * 60_000;

/**
 * DEMO MACRO STATE.
 *
 * A slowly-wandering but deterministic macro picture. The same snapshot drives
 * the news generator, so headlines and the macro dashboard always tell a
 * consistent story — which is exactly what a real day looks like.
 */
export interface MacroNarrative {
  policyStance: number; // + hawkish
  inflation: number; // + hotter
  growth: number; // + stronger
  dollar: number; // + stronger
  realYields: number; // + rising
  riskAppetite: number; // + risk-on
}

const FACTORS: (keyof MacroNarrative)[] = [
  "policyStance",
  "inflation",
  "growth",
  "dollar",
  "realYields",
  "riskAppetite",
];

export function macroNarrative(now = Date.now()): MacroNarrative {
  const dayIndex = Math.floor(now / DAY);
  const out = {} as MacroNarrative;
  FACTORS.forEach((f, i) => {
    const seed = rng(`macro:${f}`);
    const phase = seed() * Math.PI * 2;
    const slow = Math.sin((2 * Math.PI * dayIndex) / 63 + phase);
    const fast = Math.sin((2 * Math.PI * dayIndex) / 17 + phase * 1.7) * 0.45;
    const jitter = (rng(`macro:${f}:${dayIndex}`)() - 0.5) * 0.25;
    out[f] = Math.max(-1, Math.min(1, (slow + fast) / 1.45 + jitter + i * 0));
  });
  // Internal consistency: hawkish policy lifts real yields and the dollar and
  // weighs on risk appetite. These are tendencies, not identities.
  out.realYields = clampRange(out.realYields * 0.55 + out.policyStance * 0.45);
  out.dollar = clampRange(out.dollar * 0.55 + out.policyStance * 0.3 + out.growth * 0.15);
  out.riskAppetite = clampRange(out.riskAppetite * 0.6 - out.policyStance * 0.25 + out.growth * 0.15);
  return out;
}

function clampRange(v: number) {
  return Math.max(-1, Math.min(1, v));
}

function tone(v: number) {
  return Math.max(-1, Math.min(1, v));
}

export function buildMacroSnapshot(now = Date.now()): MacroSnapshot {
  const n = macroNarrative(now);
  const fedFunds = 5.25 - n.policyStance * -0.0 + 0;
  const cpi = 3.1 + n.inflation * 0.9;
  const core = 3.5 + n.inflation * 0.7;
  const unemployment = 4.0 - n.growth * 0.5;
  const gdp = 2.1 + n.growth * 1.4;
  const tenY = 4.3 + n.realYields * 0.6;
  const realY = 1.9 + n.realYields * 0.55;
  const dxy = 104.3 + n.dollar * 3.2;
  const vix = 15.5 - n.riskAppetite * 5.5;

  return {
    asOf: now,
    policyStance: n.policyStance,
    inflation: n.inflation,
    growth: n.growth,
    dollar: n.dollar,
    realYields: n.realYields,
    riskAppetite: n.riskAppetite,
    demo: true,
    readings: [
      {
        label: "Fed policy expectations",
        value: n.policyStance > 0.2 ? "Hawkish lean" : n.policyStance < -0.2 ? "Dovish lean" : "Balanced",
        detail:
          n.policyStance > 0.2
            ? "Market pricing has pushed rate cuts further out."
            : n.policyStance < -0.2
              ? "Market pricing has pulled rate cuts forward."
              : "Rate-cut pricing is broadly unchanged.",
        tone: tone(n.policyStance),
      },
      {
        label: "Fed funds rate",
        value: `${fedFunds.toFixed(2)}%`,
        detail: "Current target midpoint.",
        tone: 0,
      },
      {
        label: "Headline CPI (y/y)",
        value: `${cpi.toFixed(1)}%`,
        detail: n.inflation > 0 ? "Running above the recent trend." : "Cooling versus the recent trend.",
        tone: tone(n.inflation),
      },
      {
        label: "Core CPI (y/y)",
        value: `${core.toFixed(1)}%`,
        detail: "Core excludes food and energy.",
        tone: tone(n.inflation * 0.8),
      },
      {
        label: "Unemployment rate",
        value: `${unemployment.toFixed(1)}%`,
        detail: n.growth > 0 ? "Labour market holding firm." : "Labour market loosening.",
        tone: tone(n.growth),
      },
      {
        label: "GDP growth (annualised)",
        value: `${gdp.toFixed(1)}%`,
        detail: n.growth > 0 ? "Growth surprising to the upside." : "Growth surprising to the downside.",
        tone: tone(n.growth),
      },
      {
        label: "US 10Y yield",
        value: `${tenY.toFixed(2)}%`,
        detail: n.realYields > 0 ? "Yields have been rising." : "Yields have been easing.",
        tone: tone(n.realYields),
      },
      {
        label: "10Y real yield",
        value: `${realY.toFixed(2)}%`,
        detail: "Nominal yield less breakeven inflation.",
        tone: tone(n.realYields),
      },
      {
        label: "US Dollar Index",
        value: dxy.toFixed(2),
        detail: n.dollar > 0 ? "Dollar firm across the majors." : "Dollar softening across the majors.",
        tone: tone(n.dollar),
      },
      {
        label: "VIX",
        value: vix.toFixed(2),
        detail: vix > 20 ? "Elevated — hedging demand is up." : "Contained — no broad stress signal.",
        tone: tone(-((vix - 15.5) / 6)),
      },
    ],
  };
}

import type {
  Asset,
  DirectionChange,
  EventRiskResult,
  MdScore,
  TimeframeStructure,
  TimeframeTechnical,
} from "@/lib/types";
import { fmtPrice } from "@/lib/utils/format";

/**
 * PLAIN-ENGLISH EXPLANATION ENGINE.
 *
 * This runs with no AI provider configured. It turns the structured evidence into
 * the sentences a trader actually needs, using the product's risk language:
 * "directional bias", "current conditions", "evidence", "alignment" — never
 * "will rise", never a probability.
 */

function directionWord(direction: string) {
  switch (direction) {
    case "bullish": return "a bullish directional bias";
    case "bearish": return "a bearish directional bias";
    case "mixed": return "a mixed picture";
    default: return "no clear directional bias";
  }
}

export function buildWhy(
  asset: Asset,
  score: MdScore,
  technical: TimeframeTechnical[],
  structure: TimeframeStructure[],
  eventRisk: EventRiskResult,
): string {
  const parts: string[] = [];
  const bullish = score.direction === "bullish";
  const bearish = score.direction === "bearish";

  parts.push(
    `${asset.name} currently shows ${directionWord(score.direction)} with an MD Direction Score of ${score.score} — ${score.label.toLowerCase()}.`,
  );

  // Observations are sorted into those that support the read and those that argue
  // against it, so the explanation never lists contradictory facts as if they all
  // pointed the same way.
  const supporting: string[] = [];
  const opposing: string[] = [];
  const agrees = (positive: boolean) => (bullish ? positive : bearish ? !positive : null);

  const push = (positive: boolean, text: string) => {
    const side = agrees(positive);
    if (side === null) (positive ? supporting : opposing).push(text);
    else if (side) supporting.push(text);
    else opposing.push(text);
  };

  const daily = technical.find((t) => t.timeframe === "1D");
  if (daily?.ma50 != null && daily.priceVsMa50) {
    push(daily.priceVsMa50 === "above", `price is ${daily.priceVsMa50} its 50 MA on the daily chart`);
    if (daily.ma50Slope && daily.ma50Slope !== "flat") {
      push(daily.ma50Slope === "rising", `the daily 50 MA is ${daily.ma50Slope}`);
    }
  }
  for (const tf of ["1W", "1D", "4H"] as const) {
    const st = structure.find((x) => x.timeframe === tf);
    if (st && st.bias !== "neutral") {
      push(st.bias === "bullish", `${tf === "1W" ? "weekly" : tf === "1D" ? "daily" : "4H"} market structure is ${st.bias}`);
    }
  }
  for (const c of score.categories) {
    if (!c.available || c.key === "eventRisk" || c.key === "technical" || c.key === "structure") continue;
    if (Math.abs(c.strength) < 0.12) continue;
    push(c.points > 0, `${c.label.toLowerCase()} is ${c.points > 0 ? "supportive" : "a headwind"}`);
  }

  if (supporting.length) {
    parts.push(
      score.direction === "neutral" || score.direction === "mixed"
        ? `On the supportive side, ${supporting.slice(0, 4).join(", ")}.`
        : `This is because ${supporting.slice(0, 4).join(", ")}.`,
    );
  }
  if (opposing.length) {
    parts.push(`Working against it, ${opposing.slice(0, 3).join(", ")} — which is why the score is not higher.`);
  }

  if (score.conflict.conflicted && score.conflict.message) {
    parts.push(`${score.conflict.message} That disagreement is why this is not treated as strong alignment.`);
  }

  if (eventRisk.nextEvent && eventRisk.hoursUntil != null && eventRisk.risk !== "none") {
    parts.push(
      `The main near-term risk is ${eventRisk.nextEvent.name} in about ${Math.round(eventRisk.hoursUntil)} hours, which can create volatility in either direction.`,
    );
  }

  parts.push(
    "This is an assessment of current evidence alignment, not a forecast or a probability of any outcome.",
  );

  return parts.join(" ");
}

export function buildWhatCouldChangeIt(
  asset: Asset,
  score: MdScore,
  technical: TimeframeTechnical[],
  structure: TimeframeStructure[],
  eventRisk: EventRiskResult,
): string[] {
  const out: string[] = [];
  const daily = technical.find((t) => t.timeframe === "1D");
  const dailyStruct = structure.find((s) => s.timeframe === "1D");

  if (daily?.ma50 != null) {
    const side = daily.priceVsMa50 === "above" ? "back below" : "back above";
    out.push(`A daily close ${side} the 50 MA at ${fmtPrice(daily.ma50, asset.precision)}.`);
  }
  if (dailyStruct?.lastSwingLow != null && dailyStruct?.lastSwingHigh != null) {
    out.push(
      score.direction === "bearish"
        ? `A break above the last daily swing high at ${fmtPrice(dailyStruct.lastSwingHigh, asset.precision)} would flip daily structure.`
        : `A break below the last daily swing low at ${fmtPrice(dailyStruct.lastSwingLow, asset.precision)} would flip daily structure.`,
    );
  }
  if (eventRisk.nextEvent) {
    out.push(`${eventRisk.nextEvent.name} (${eventRisk.nextEvent.importance} impact) — a surprise in either direction can reset the read.`);
  }
  const macroCat = score.categories.find((c) => c.key === "macro");
  if (macroCat?.available && macroCat.evidence[0]) {
    out.push(`A change in ${macroCat.evidence[0].label.toLowerCase()} would change the macro contribution.`);
  }
  if (score.conflict.conflicted) {
    out.push("Lower timeframes realigning with the higher timeframes would remove the conflict penalty.");
  }
  return out.slice(0, 5);
}

/**
 * DIRECTION CHANGE DETECTION.
 * Compares the current score with the same analysis run 24 hours earlier.
 */
export function buildChange(
  current: MdScore,
  previous: { score: number; direction: string } | null,
  reasons: string[],
): DirectionChange | null {
  if (!previous) return null;
  const delta = current.score - previous.score;
  const crossedNeutral =
    (previous.score < 45 && current.score >= 60) || (previous.score > 55 && current.score <= 40);

  if (crossedNeutral || (previous.direction !== current.direction && Math.abs(delta) >= 8)) {
    return {
      kind: "shift",
      headline: "DIRECTION SHIFT DETECTED",
      delta,
      reasons,
    };
  }
  if (delta <= -10) {
    return {
      kind: "weakening",
      headline: `${current.direction === "bearish" ? "BEARISH" : "BULLISH"} MOMENTUM WEAKENING`,
      delta,
      reasons,
    };
  }
  if (delta >= 10) {
    return {
      kind: "strengthening",
      headline: `${current.direction === "bearish" ? "BEARISH" : "BULLISH"} ALIGNMENT STRENGTHENING`,
      delta,
      reasons,
    };
  }
  return { kind: "stable", headline: "Little change since yesterday", delta, reasons };
}

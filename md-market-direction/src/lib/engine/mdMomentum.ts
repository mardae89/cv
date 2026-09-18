import type { AssetAnalysis, Candle, Direction } from "@/lib/types";
import { MD_MOMENTUM_RULES } from "@/lib/config/scoring";
import { clamp } from "./indicators";

/**
 * MD MOMENTUM MODE.
 *
 * A configurable model of the higher-timeframe momentum-continuation approach:
 * the weekly leads, the daily and 4H must not contradict it, and the 1H is used
 * only for confirmation. Every check is a -1..1 reading, NOT a hard rule — the
 * weights in `MD_MOMENTUM_RULES` decide how much each one matters.
 */

export interface MomentumCheck {
  key: keyof typeof MD_MOMENTUM_RULES;
  label: string;
  state: Direction;
  value: string;
  detail: string;
  weight: number;
  reading: number;
  contribution: number;
}

export interface MdMomentumResult {
  symbol: string;
  name: string;
  score: number;
  direction: Direction;
  checks: MomentumCheck[];
  aligned: number;
  total: number;
  summary: string;
}

function stateOf(reading: number): Direction {
  return reading > 0.2 ? "bullish" : reading < -0.2 ? "bearish" : "neutral";
}

function word(reading: number) {
  return reading > 0.2 ? "Bullish" : reading < -0.2 ? "Bearish" : "Neutral";
}

export function evaluateMdMomentum(analysis: AssetAnalysis, weeklyCandles: Candle[]): MdMomentumResult {
  const tech = (tf: string) => analysis.technical.find((t) => t.timeframe === tf);
  const struct = (tf: string) => analysis.structure.find((s) => s.timeframe === tf);
  const momo = (tf: string) => analysis.momentum.find((m) => m.timeframe === tf);

  const weeklyTech = tech("1W");
  const weeklyStruct = struct("1W");
  const dailyStruct = struct("1D");
  const fourStruct = struct("4H");
  const oneTech = tech("1H");
  const oneStruct = struct("1H");

  // The previous CLOSED weekly candle — the current week is still forming.
  const prevWeekly = weeklyCandles[weeklyCandles.length - 2];
  const prevWeeklyReading = prevWeekly
    ? clamp(((prevWeekly.c - prevWeekly.o) / (prevWeekly.h - prevWeekly.l || 1)) * 2, -1, 1)
    : 0;

  const ma50Reading = (() => {
    if (!weeklyTech || weeklyTech.ma50 == null) return 0;
    const dist = (weeklyTech.price - weeklyTech.ma50) / (weeklyTech.atr || weeklyTech.price * 0.02);
    return clamp(dist / 3, -1, 1);
  })();

  const oneHourReading = clamp((oneTech?.strength ?? 0) * 0.5 + (oneStruct?.strength ?? 0) * 0.5, -1, 1);
  const momentumReading = clamp((momo("1D")?.strength ?? 0) * 0.6 + (momo("4H")?.strength ?? 0) * 0.4, -1, 1);
  const newsCat = analysis.score.categories.find((c) => c.key === "news");
  const newsReading = newsCat?.available ? newsCat.strength : 0;

  const raw: { key: keyof typeof MD_MOMENTUM_RULES; label: string; reading: number; value: string; detail: string }[] = [
    {
      key: "weeklyDirection",
      label: "Weekly Direction",
      reading: weeklyTech?.strength ?? 0,
      value: word(weeklyTech?.strength ?? 0),
      detail: weeklyTech
        ? `Weekly trend read from price versus the 50 and 200 MA and their slopes (50 MA ${weeklyTech.ma50Slope ?? "—"}).`
        : "Weekly data unavailable.",
    },
    {
      key: "previousWeeklyCandle",
      label: "Previous Weekly Candle",
      reading: prevWeeklyReading,
      value: prevWeekly ? (prevWeekly.c >= prevWeekly.o ? "Bullish close" : "Bearish close") : "Data unavailable",
      detail: "The last completed weekly candle. A continuation setup prefers this to agree with the intended direction.",
    },
    {
      key: "priceVsMa50Weekly",
      label: "Price vs 50 MA (Weekly)",
      reading: ma50Reading,
      value: weeklyTech?.priceVsMa50 ? weeklyTech.priceVsMa50.toUpperCase() : "Data unavailable",
      detail: "Distance from the weekly 50 MA, measured in ATR so it is comparable across markets.",
    },
    {
      key: "weeklyStructure",
      label: "Weekly Structure",
      reading: weeklyStruct?.strength ?? 0,
      value: word(weeklyStruct?.strength ?? 0),
      detail: weeklyStruct
        ? `${weeklyStruct.higherHigh ? "Higher high" : weeklyStruct.lowerHigh ? "Lower high" : "Equal highs"}, ${weeklyStruct.higherLow ? "higher low" : weeklyStruct.lowerLow ? "lower low" : "equal lows"}.`
        : "Weekly structure unavailable.",
    },
    {
      key: "dailyStructure",
      label: "Daily Structure",
      reading: dailyStruct?.strength ?? 0,
      value: word(dailyStruct?.strength ?? 0),
      detail: dailyStruct ? `State: ${dailyStruct.state}.` : "Daily structure unavailable.",
    },
    {
      key: "fourHourStructure",
      label: "4H Structure",
      reading: fourStruct?.strength ?? 0,
      value: word(fourStruct?.strength ?? 0),
      detail: fourStruct ? `State: ${fourStruct.state}.` : "4H structure unavailable.",
    },
    {
      key: "oneHourConfirmation",
      label: "1H Confirmation",
      reading: oneHourReading,
      value: word(oneHourReading),
      detail: "Used only to confirm entry timing — it never overrides the higher timeframes.",
    },
    {
      key: "momentum",
      label: "Momentum",
      reading: momentumReading,
      value: Math.abs(momentumReading) > 0.45 ? `${word(momentumReading)} — strong` : word(momentumReading),
      detail: "Daily and 4H RSI, MACD and rate of change combined.",
    },
    {
      key: "news",
      label: "News",
      reading: newsReading,
      value: newsCat?.available ? word(newsReading) : "No relevant coverage",
      detail: newsCat?.available ? "Relevance-weighted news effect for this market." : "No sufficiently relevant news found.",
    },
  ];

  const totalWeight = Object.values(MD_MOMENTUM_RULES).reduce((a, b) => a + b, 0);
  let weighted = 0;
  const checks: MomentumCheck[] = raw.map((r) => {
    const weight = MD_MOMENTUM_RULES[r.key];
    const contribution = (r.reading * weight) / totalWeight;
    weighted += contribution;
    return {
      key: r.key,
      label: r.label,
      state: stateOf(r.reading),
      value: r.value,
      detail: r.detail,
      weight,
      reading: r.reading,
      contribution: contribution * 100,
    };
  });

  const score = clamp(Math.round(50 + weighted * 50), 0, 100);
  const direction: Direction = score >= 60 ? "bullish" : score <= 40 ? "bearish" : "neutral";
  const sign = Math.sign(weighted || 1);
  const aligned = checks.filter((c) => Math.sign(c.reading) === sign && Math.abs(c.reading) > 0.2).length;

  const summary =
    direction === "neutral"
      ? "Conditions do not currently line up for an MD Momentum continuation setup in either direction."
      : `${aligned} of ${checks.length} MD Momentum checks line up ${direction}. The weekly picture carries the most weight; the 1H is confirmation only.`;

  return {
    symbol: analysis.asset.symbol,
    name: analysis.asset.name,
    score,
    direction,
    checks,
    aligned,
    total: checks.length,
    summary,
  };
}

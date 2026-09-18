import type { AssetAnalysis, GlobalDirection } from "@/lib/types";
import type { AnalysisContext } from "./context";
import { radar } from "./market";
import { untilLabel } from "@/lib/utils/format";

/**
 * DAILY MARKET BRIEF — the "open the app and know where you stand" summary.
 */
export interface DailyBrief {
  greeting: string;
  global: GlobalDirection;
  strongest: { symbol: string; name: string; score: number }[];
  weakest: { symbol: string; name: string; score: number }[];
  events: { name: string; when: string; importance: string }[];
  biggestChanges: { symbol: string; delta: number; headline: string; reasons: string[] }[];
  headlines: { headline: string; source: string; impact: string }[];
  generatedAt: number;
  demo: boolean;
}

function greetingFor(now: number): string {
  const hour = new Date(now).getUTCHours();
  if (hour < 11) return "GOOD MORNING";
  if (hour < 17) return "GOOD AFTERNOON";
  return "GOOD EVENING";
}

export function buildBrief(ctx: AnalysisContext, analyses: AssetAnalysis[], global: GlobalDirection): DailyBrief {
  const { bullish, bearish } = radar(analyses, 4);
  const changes = analyses
    .filter((a) => a.change && a.change.kind !== "stable")
    .sort((a, b) => Math.abs(b.change!.delta) - Math.abs(a.change!.delta))
    .slice(0, 4);

  return {
    greeting: greetingFor(ctx.now),
    global,
    strongest: bullish.map((a) => ({ symbol: a.asset.symbol, name: a.asset.name, score: a.score.score })),
    weakest: bearish.map((a) => ({ symbol: a.asset.symbol, name: a.asset.name, score: a.score.score })),
    events: ctx.events
      .filter((e) => e.time > ctx.now && e.time < ctx.now + 36 * 3_600_000)
      .slice(0, 5)
      .map((e) => ({ name: e.name, when: untilLabel(e.time, ctx.now), importance: e.importance })),
    biggestChanges: changes.map((a) => ({
      symbol: a.asset.symbol,
      delta: a.change!.delta,
      headline: a.change!.headline,
      reasons: a.change!.reasons,
    })),
    headlines: ctx.news.slice(0, 5).map((n) => ({ headline: n.headline, source: n.source, impact: n.impact })),
    generatedAt: Date.now(),
    demo: ctx.demo,
  };
}

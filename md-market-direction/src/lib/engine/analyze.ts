import type {
  AssetAnalysis,
  Candle,
  CategoryKey,
  Direction,
  MdScore,
  Timeframe,
  TimeframeMomentum,
  TimeframeStructure,
  TimeframeTechnical,
  TradingMode,
} from "@/lib/types";
import { ALL_TIMEFRAMES } from "@/lib/config/scoring";
import { resolveAsset } from "@/lib/data/universe";
import type { AnalysisContext } from "./context";
import { analyseMomentum, analyseTechnical } from "./technical";
import { analyseStructure } from "./structure";
import { analyseNews } from "./news";
import { analyseMacro } from "./macro";
import { analyseEventRisk } from "./eventRisk";
import { analyseCrossMarket } from "./crossMarket";
import { buildScore, detectConflict, weightByMode, type CategoryInput } from "./score";
import { buildChange, buildWhatCouldChangeIt, buildWhy } from "./narrative";
import { clamp } from "./indicators";
import { singleton, TtlCache } from "@/lib/utils/cache";

/** How many bars represent 24 hours on each timeframe — used for "yesterday's" run. */
const BARS_PER_DAY: Record<Timeframe, number> = {
  "5M": 288, "15M": 96, "1H": 24, "4H": 6, "1D": 1, "1W": 0,
};

const analysisCache = singleton("analysisCache", () => new TtlCache<AssetAnalysis>(45_000, 400));

function truncate(candles: Candle[], tf: Timeframe): Candle[] {
  const drop = BARS_PER_DAY[tf];
  if (!drop || candles.length - drop < 60) return candles;
  return candles.slice(0, candles.length - drop);
}

interface CoreReadings {
  technical: TimeframeTechnical[];
  structure: TimeframeStructure[];
  momentum: TimeframeMomentum[];
}

function readCore(series: Record<Timeframe, Candle[]>): CoreReadings {
  const technical: TimeframeTechnical[] = [];
  const structure: TimeframeStructure[] = [];
  const momentum: TimeframeMomentum[] = [];
  for (const tf of ALL_TIMEFRAMES) {
    const candles = series[tf];
    if (!candles || candles.length < 30) continue;
    technical.push(analyseTechnical(candles, tf));
    structure.push(analyseStructure(candles, tf));
    momentum.push(analyseMomentum(candles, tf));
  }
  return { technical, structure, momentum };
}

function summarise(key: CategoryKey, strength: number, extra?: string): string {
  const word = strength > 0.35 ? "clearly bullish" : strength > 0.12 ? "mildly bullish"
    : strength < -0.35 ? "clearly bearish" : strength < -0.12 ? "mildly bearish" : "neutral";
  return extra ? `${word} — ${extra}` : word;
}

export interface AnalyseOptions {
  mode?: TradingMode;
  withPrevious?: boolean;
  /** Skip the cache (used by the alert evaluator). */
  fresh?: boolean;
}

export async function analyseAsset(
  ctx: AnalysisContext,
  symbol: string,
  opts: AnalyseOptions = {},
): Promise<AssetAnalysis | null> {
  const mode = opts.mode ?? "swing";
  const asset = resolveAsset(symbol);
  if (!asset) return null;

  const cacheKey = `${asset.symbol}|${mode}|${opts.withPrevious ? "prev" : "now"}`;
  if (!opts.fresh) {
    const hit = analysisCache.get(cacheKey);
    if (hit) return hit.value;
  }

  const loaded = await Promise.all(ALL_TIMEFRAMES.map((tf) => ctx.candles(asset.symbol, tf)));
  const series = {} as Record<Timeframe, Candle[]>;
  ALL_TIMEFRAMES.forEach((tf, i) => (series[tf] = loaded[i]));
  if (!series["1D"]?.length) return null;

  const core = readCore(series);
  const quote = await ctx.quote(asset.symbol);
  if (!quote) return null;

  const newsReading = analyseNews(asset, ctx.news, ctx.now);
  const macroReading = analyseMacro(asset, ctx.macro);
  const eventRisk = analyseEventRisk(asset, ctx.events, ctx.now);
  const cross = await analyseCrossMarket(ctx, asset);

  const score = assemble({
    mode,
    core,
    news: newsReading,
    macro: macroReading,
    cross,
    eventDampening: eventRisk.dampening,
    ctxDemo: !ctx.isLive(asset.symbol),
  });

  /* ---------------- previous-day comparison for change detection ---------------- */
  let previous: { score: number; direction: Direction } | null = null;
  let changeReasons: string[] = [];
  if (opts.withPrevious) {
    const prevSeries = {} as Record<Timeframe, Candle[]>;
    for (const tf of ALL_TIMEFRAMES) prevSeries[tf] = truncate(series[tf] ?? [], tf);
    const prevCore = readCore(prevSeries);
    const prevNews = analyseNews(asset, ctx.news.filter((a) => a.publishedAt <= ctx.now - 86_400_000), ctx.now - 86_400_000);
    const prevScore = assemble({
      mode,
      core: prevCore,
      news: prevNews,
      macro: macroReading,
      cross,
      eventDampening: eventRisk.dampening,
      ctxDemo: !ctx.isLive(asset.symbol),
    });
    previous = { score: prevScore.score, direction: prevScore.direction };
    changeReasons = diffReasons(prevCore, core, asset.precision);
  }

  const momentumStrength = weightByMode(core.momentum, mode);
  const analysis: AssetAnalysis = {
    asset,
    quote,
    mode,
    score,
    technical: core.technical,
    structure: core.structure,
    momentum: core.momentum,
    news: newsReading.items,
    macro: ctx.macro,
    macroDrivers: macroReading.drivers,
    crossMarket: cross.readings,
    eventRisk,
    momentumScore: Math.round(((momentumStrength + 1) / 2) * 100),
    why: buildWhy(asset, score, core.technical, core.structure, eventRisk),
    whatCouldChangeIt: buildWhatCouldChangeIt(asset, score, core.technical, core.structure, eventRisk),
    previous,
    change: buildChange(score, previous, changeReasons),
    generatedAt: Date.now(),
    // Per asset: a live feed may cover gold but not the Hang Seng.
    demo: !ctx.isLive(asset.symbol),
  };

  analysisCache.set(cacheKey, analysis);
  return analysis;
}

interface AssembleParams {
  mode: TradingMode;
  core: CoreReadings;
  news: ReturnType<typeof analyseNews>;
  macro: ReturnType<typeof analyseMacro>;
  cross: Awaited<ReturnType<typeof analyseCrossMarket>>;
  eventDampening: number;
  ctxDemo: boolean;
}

function assemble({ mode, core, news, macro, cross, eventDampening, ctxDemo }: AssembleParams): MdScore {
  const techStrength = weightByMode(core.technical, mode);
  const structStrength = weightByMode(core.structure, mode);
  const momoStrength = weightByMode(core.momentum, mode);

  // Conflict detection uses trend + structure together, per timeframe.
  const combined = core.technical.map((t) => {
    const s = core.structure.find((x) => x.timeframe === t.timeframe);
    return { timeframe: t.timeframe, strength: clamp(t.strength * 0.5 + (s?.strength ?? 0) * 0.5, -1, 1) };
  });
  const conflict = detectConflict(combined);

  const categories: CategoryInput[] = [
    {
      key: "technical",
      strength: techStrength,
      available: core.technical.length > 0,
      evidence: core.technical
        .filter((t) => ["1W", "1D", "4H", "1H"].includes(t.timeframe))
        .map((t) => ({
          label: `${t.timeframe} trend`,
          detail: `Price ${t.priceVsMa50 ?? "—"} the 50 MA, 50 MA ${t.ma50Slope ?? "—"}, volatility ${t.volatility}.`,
          impact: t.strength,
        })),
      summary: summarise("technical", techStrength),
    },
    {
      key: "structure",
      strength: structStrength,
      available: core.structure.some((s) => s.state !== "undefined"),
      evidence: core.structure
        .filter((s) => ["1W", "1D", "4H", "1H"].includes(s.timeframe))
        .map((s) => ({
          label: `${s.timeframe} structure`,
          detail: `${s.higherHigh ? "Higher high" : s.lowerHigh ? "Lower high" : "Equal highs"}, ${s.higherLow ? "higher low" : s.lowerLow ? "lower low" : "equal lows"}${s.breakOfStructure ? `, ${s.breakOfStructure} break of structure` : ""}${s.changeOfCharacter ? `, ${s.changeOfCharacter} change of character` : ""}. State: ${s.state}.`,
          impact: s.strength,
        })),
      summary: summarise("structure", structStrength),
    },
    {
      key: "momentum",
      strength: momoStrength,
      available: core.momentum.length > 0,
      evidence: core.momentum
        .filter((m) => ["1D", "4H", "1H"].includes(m.timeframe))
        .map((m) => ({
          label: `${m.timeframe} momentum`,
          detail: `RSI ${m.rsi?.toFixed(1) ?? "—"}, MACD ${m.macdState ?? "—"}, 10-bar rate of change ${m.roc?.toFixed(2) ?? "—"}%.`,
          impact: m.strength,
        })),
      summary: summarise("momentum", momoStrength),
    },
    {
      key: "news",
      strength: news.strength,
      available: news.available,
      evidence: news.evidence,
      summary: news.available
        ? summarise("news", news.strength, `${news.items.length} related stories in the last 72h`)
        : "No sufficiently relevant news coverage found for this market.",
    },
    {
      key: "macro",
      strength: macro.strength,
      available: macro.available,
      evidence: macro.drivers,
      summary: macro.available ? summarise("macro", macro.strength) : "Macro sensitivities not defined for this market.",
    },
    {
      key: "crossMarket",
      strength: cross.strength,
      available: cross.available,
      evidence: cross.evidence,
      summary: cross.available ? summarise("crossMarket", cross.strength) : "No cross-market relationships defined.",
    },
    {
      key: "eventRisk",
      strength: -eventDampening,
      available: eventDampening > 0,
      evidence: [],
      summary: eventDampening > 0 ? "Scheduled event risk is reducing conviction." : "No material scheduled event risk.",
    },
  ];

  const qualityNotes: string[] = [];
  if (ctxDemo) qualityNotes.push("Demo data — not live market data");
  if (!news.available) qualityNotes.push("No relevant news coverage");

  return buildScore({ categories, conflict, eventDampening, qualityNotes });
}

function diffReasons(prev: CoreReadings, now: CoreReadings, precision: number): string[] {
  const out: string[] = [];
  for (const tf of ["1W", "1D", "4H", "1H"] as Timeframe[]) {
    const a = prev.technical.find((t) => t.timeframe === tf);
    const b = now.technical.find((t) => t.timeframe === tf);
    if (a && b && a.priceVsMa50 && b.priceVsMa50 && a.priceVsMa50 !== b.priceVsMa50) {
      out.push(`Price crossed ${b.priceVsMa50} the 50 MA on the ${tf} chart.`);
    }
    const sa = prev.structure.find((s) => s.timeframe === tf);
    const sb = now.structure.find((s) => s.timeframe === tf);
    if (sa && sb && sa.bias !== sb.bias) {
      out.push(`${tf} market structure shifted from ${sa.bias} to ${sb.bias}.`);
    }
    if (sb?.breakOfStructure && !sa?.breakOfStructure) {
      out.push(`${tf} recorded a ${sb.breakOfStructure} break of structure.`);
    }
  }
  const ma = prev.momentum.find((m) => m.timeframe === "1D");
  const mb = now.momentum.find((m) => m.timeframe === "1D");
  if (ma?.macdState && mb?.macdState && ma.macdState !== mb.macdState) {
    out.push(`Daily MACD flipped ${mb.macdState}.`);
  }
  void precision;
  return out.slice(0, 4);
}

import type { AssetAnalysis, GlobalDirection } from "@/lib/types";
import { ASSETS, getAsset } from "@/lib/data/universe";
import { fmtPrice, untilLabel } from "@/lib/utils/format";
import { getLlm, HOUSE_RULES } from "./llm";
import type { AnalysisContext } from "@/lib/engine/context";
import { analyseAsset } from "@/lib/engine/analyze";

/**
 * AI MARKET ANALYST.
 *
 * The analyst answers ONLY from the structured analysis the engine produced. The
 * question is first resolved to the relevant markets, those markets are analysed,
 * and the resulting facts are handed to the model as a CONTEXT block. With no LLM
 * configured the same facts are rendered by a deterministic answerer, so the
 * feature still works and still never invents anything.
 */

const ALIASES: Record<string, string> = {
  gold: "XAU/USD", xau: "XAU/USD", silver: "XAG/USD", xag: "XAG/USD",
  bitcoin: "BTC/USD", btc: "BTC/USD", ethereum: "ETH/USD", eth: "ETH/USD",
  solana: "SOL/USD", nasdaq: "NDX", "s&p": "SPX", "s&p 500": "SPX", sp500: "SPX",
  spx: "SPX", dow: "DJI", russell: "RUT", dax: "DAX", ftse: "FTSE", nikkei: "NIKKEI",
  "hang seng": "HSI", dollar: "DXY", "us dollar": "DXY", greenback: "DXY", dxy: "DXY",
  oil: "WTI", crude: "WTI", brent: "BRENT", "natural gas": "NATGAS", copper: "COPPER",
  yields: "US10Y", "10 year": "US10Y", "10y": "US10Y", "2 year": "US02Y",
  vix: "VIX", volatility: "VIX", apple: "AAPL", nvidia: "NVDA", tesla: "TSLA",
  microsoft: "MSFT", amazon: "AMZN", meta: "META", google: "GOOGL", alphabet: "GOOGL",
  euro: "EUR/USD", sterling: "GBP/USD", pound: "GBP/USD", yen: "USD/JPY", cable: "GBP/USD",
};

export function extractSymbols(question: string, limit = 4): string[] {
  const q = question.toLowerCase();
  const found = new Set<string>();

  for (const [alias, symbol] of Object.entries(ALIASES)) {
    if (q.includes(alias)) found.add(symbol);
  }
  for (const asset of ASSETS) {
    const sym = asset.symbol.toLowerCase();
    if (q.includes(sym)) found.add(asset.symbol);
    else if (sym.includes("/") && q.includes(sym.replace("/", ""))) found.add(asset.symbol);
    else if (q.includes(asset.name.toLowerCase())) found.add(asset.symbol);
  }
  return Array.from(found).slice(0, limit);
}

export interface AnalystContextData {
  symbols: string[];
  analyses: AssetAnalysis[];
  global: GlobalDirection;
  upcomingEvents: { name: string; time: number; importance: string; country: string }[];
  headlines: { headline: string; source: string; impact: string; theme: string }[];
  demo: boolean;
}

export async function buildAnalystContext(
  ctx: AnalysisContext,
  question: string,
  global: GlobalDirection,
  mode: AssetAnalysis["mode"],
  fallbackSymbols: string[] = [],
): Promise<AnalystContextData> {
  let symbols = extractSymbols(question);
  if (!symbols.length) symbols = fallbackSymbols.slice(0, 3);
  const analyses: AssetAnalysis[] = [];
  for (const s of symbols) {
    const a = await analyseAsset(ctx, s, { mode, withPrevious: true });
    if (a) analyses.push(a);
  }
  return {
    symbols,
    analyses,
    global,
    upcomingEvents: ctx.events
      .filter((e) => e.time > ctx.now)
      .slice(0, 6)
      .map((e) => ({ name: e.name, time: e.time, importance: e.importance, country: e.country })),
    headlines: ctx.news.slice(0, 8).map((n) => ({ headline: n.headline, source: n.source, impact: n.impact, theme: n.theme })),
    demo: ctx.demo,
  };
}

/** Compact, factual context block. Nothing outside this may be used in an answer. */
export function renderContext(data: AnalystContextData): string {
  const lines: string[] = [];
  lines.push(`DATA MODE: ${data.demo ? "DEMO DATA (clearly labelled synthetic data, not live market data)" : "LIVE DATA"}`);
  lines.push(
    `GLOBAL: direction ${data.global.direction}, MD Direction Score ${data.global.score} (${data.global.label}). Regime: ${data.global.regime.primary}. ${data.global.regime.explanation}`,
  );
  lines.push(`GROUPS: ${data.global.groups.map((g) => `${g.group} ${g.direction} ${g.score}`).join("; ")}`);

  for (const a of data.analyses) {
    const d = a.technical.find((t) => t.timeframe === "1D");
    const w = a.structure.find((s) => s.timeframe === "1W");
    const ds = a.structure.find((s) => s.timeframe === "1D");
    lines.push(
      [
        `ASSET ${a.asset.symbol} (${a.asset.name}):`,
        `price ${fmtPrice(a.quote.price, a.asset.precision)} (${a.quote.changePct.toFixed(2)}% today)`,
        `MD Direction Score ${a.score.score} — ${a.score.label}`,
        `direction ${a.score.direction}`,
        `evidence quality ${a.score.evidenceQuality}`,
        d ? `daily 50MA ${fmtPrice(d.ma50, a.asset.precision)} price ${d.priceVsMa50 ?? "—"}, 50MA ${d.ma50Slope ?? "—"}, 200MA ${fmtPrice(d.ma200, a.asset.precision)}` : "",
        w ? `weekly structure ${w.bias}` : "",
        ds ? `daily structure ${ds.bias} (${ds.state})` : "",
        `momentum score ${a.momentumScore}/100`,
        `categories: ${a.score.categories.map((c) => `${c.label} ${c.points >= 0 ? "+" : ""}${c.points.toFixed(1)}/${c.weight}${c.available ? "" : " (unavailable)"}`).join(", ")}`,
        a.score.conflict.conflicted ? `CONFLICT: ${a.score.conflict.message}` : "",
        a.eventRisk.nextEvent
          ? `next event ${a.eventRisk.nextEvent.name} ${untilLabel(a.eventRisk.nextEvent.time)}, risk ${a.eventRisk.risk}`
          : "no scheduled event risk",
        a.previous ? `score 24h ago ${a.previous.score} (${a.previous.direction})` : "",
        a.change?.reasons.length ? `changes: ${a.change.reasons.join(" ")}` : "",
        `top news: ${a.news.slice(0, 3).map((n) => `"${n.article.headline}" (${n.assetSentiment >= 0 ? "supportive" : "headwind"})`).join("; ") || "none relevant"}`,
      ]
        .filter(Boolean)
        .join(" | "),
    );
  }

  lines.push(
    `UPCOMING EVENTS: ${data.upcomingEvents.map((e) => `${e.name} (${e.country}, ${e.importance}) ${untilLabel(e.time)}`).join("; ") || "none"}`,
  );
  lines.push(`RECENT HEADLINES: ${data.headlines.map((h) => `"${h.headline}" [${h.theme}, ${h.impact} impact, ${h.source}]`).join("; ")}`);
  return lines.join("\n");
}

/* ------------------------- deterministic fallback -------------------------- */

function describe(a: AssetAnalysis): string {
  // `why` already opens with the symbol, score and band label, so prefixing it
  // again just makes the answer read like a machine repeating itself.
  return a.why;
}

export function deterministicAnswer(question: string, data: AnalystContextData): string {
  const q = question.toLowerCase();
  const parts: string[] = [];

  if (/strongest|best|most bullish|top/.test(q)) {
    const top = [...data.analyses].sort((a, b) => b.score.score - a.score.score);
    if (top.length) {
      parts.push("Strongest bullish alignment in the markets you asked about:");
      parts.push(top.map((a) => `• ${a.asset.symbol} — ${a.score.score} (${a.score.label})`).join("\n"));
    } else {
      parts.push(
        `Across all markets the global read is ${data.global.direction} at ${data.global.score}. Open the Market Radar for the ranked list.`,
      );
    }
  } else if (/weakest|most bearish|worst/.test(q)) {
    const bottom = [...data.analyses].sort((a, b) => a.score.score - b.score.score);
    parts.push(
      bottom.length
        ? bottom.map((a) => `• ${a.asset.symbol} — ${a.score.score} (${a.score.label})`).join("\n")
        : `Global read is ${data.global.direction} at ${data.global.score}. Open the Market Radar for the ranked list.`,
    );
  } else if (/event|calendar|today|happening/.test(q)) {
    parts.push(
      data.upcomingEvents.length
        ? `Next scheduled events:\n${data.upcomingEvents.map((e) => `• ${e.name} (${e.country}, ${e.importance} impact) — ${untilLabel(e.time)}`).join("\n")}`
        : "No scheduled events found in the current calendar window.",
    );
  } else if (/chang|shift|different/.test(q)) {
    const changed = data.analyses.filter((a) => a.change && a.change.kind !== "stable");
    parts.push(
      changed.length
        ? changed.map((a) => `• ${a.asset.symbol}: ${a.change!.headline} (${a.change!.delta >= 0 ? "+" : ""}${a.change!.delta} points). ${a.change!.reasons.join(" ")}`).join("\n")
        : "No material direction changes detected in the markets you asked about over the last 24 hours.",
    );
  } else if (data.analyses.length >= 2 && /compare|versus|vs\b/.test(q)) {
    parts.push(data.analyses.map(describe).join("\n\n"));
    const [a, b] = data.analyses;
    parts.push(
      `${a.score.score > b.score.score ? a.asset.symbol : b.asset.symbol} currently has the stronger directional alignment of the two. That is a comparison of current evidence, not a recommendation.`,
    );
  } else if (data.analyses.length) {
    parts.push(data.analyses.map(describe).join("\n\n"));
    const first = data.analyses[0];
    if (first.whatCouldChangeIt.length) {
      parts.push(`What could change it:\n${first.whatCouldChangeIt.map((r) => `• ${r}`).join("\n")}`);
    }
  } else {
    parts.push(
      `Global market direction is ${data.global.direction} with an MD Direction Score of ${data.global.score} — ${data.global.label}. Market regime: ${data.global.regime.primary}. ${data.global.regime.explanation}`,
    );
    parts.push("Ask about a specific market (for example \"why is gold bullish?\") for a detailed breakdown.");
  }

  if (data.demo) parts.push("Note: this instance is running on clearly-labelled demo data, not live market data.");
  parts.push("This is a directional analysis of current evidence, not a forecast or investment advice.");
  return parts.join("\n\n");
}

export async function answerQuestion(
  question: string,
  data: AnalystContextData,
  history: { role: "user" | "assistant"; content: string }[] = [],
): Promise<{ answer: string; grounded: boolean; usedLlm: boolean }> {
  const llm = getLlm();
  if (!llm) {
    return { answer: deterministicAnswer(question, data), grounded: true, usedLlm: false };
  }
  try {
    const answer = await llm.complete({
      system: `${HOUSE_RULES}\n\nCONTEXT (the only facts you may use):\n${renderContext(data)}`,
      messages: [...history.slice(-6), { role: "user", content: question }],
      maxTokens: 700,
    });
    if (!answer) throw new Error("Empty response");
    return { answer, grounded: true, usedLlm: true };
  } catch {
    return { answer: deterministicAnswer(question, data), grounded: true, usedLlm: false };
  }
}

export function suggestedQuestions(): string[] {
  return [
    "Why is gold bullish?",
    "What is driving the dollar today?",
    "Which markets have the strongest bullish alignment?",
    "What major events are happening today?",
    "Compare gold and Bitcoin.",
    "What's changing in the market?",
  ];
}

export function symbolExists(symbol: string): boolean {
  return Boolean(getAsset(symbol));
}

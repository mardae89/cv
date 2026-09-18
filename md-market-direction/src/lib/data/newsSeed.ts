import type { Impact, NewsArticle, NewsCategory } from "@/lib/types";
import { rng } from "@/lib/utils/random";
import { macroNarrative, type MacroNarrative } from "./macroSeed";

const HOUR = 60 * 60_000;

/**
 * DEMO NEWS STREAM.
 *
 * Headlines are generated from themed templates and, crucially, are *anchored to
 * the same macro narrative that drives the macro dashboard*. A hawkish day
 * produces hawkish headlines. This keeps the news → market mapping engine
 * demonstrable end-to-end without pretending to be a live feed.
 */

interface ThemeTemplate {
  theme: string;
  category: NewsCategory;
  impact: Impact;
  /** Which macro factor the theme's sentiment tracks (optional). */
  driver?: keyof MacroNarrative;
  /** Flip if the theme moves opposite to its driver. */
  invert?: boolean;
  bullish: string[];
  bearish: string[];
  symbols?: string[];
  summaryBull: string;
  summaryBear: string;
}

const SOURCES = [
  "MD Newsdesk",
  "Global Wire",
  "Markets Daily",
  "Macro Report",
  "Capital Feed",
  "The Trading Desk",
];

const TEMPLATES: ThemeTemplate[] = [
  {
    theme: "rates-hawkish",
    category: "central-banks",
    impact: "high",
    driver: "policyStance",
    bullish: [
      "Federal Reserve signals higher-for-longer interest rates",
      "Fed officials push back on near-term rate cut expectations",
      "Policymakers stress patience as inflation progress stalls",
    ],
    bearish: [
      "Fed opens the door to earlier rate cuts",
      "Policymakers strike a softer tone on the policy path",
      "Rate-cut expectations pulled forward after dovish remarks",
    ],
    summaryBull:
      "Tighter-for-longer policy expectations typically support the dollar and front-end yields, and tend to weigh on long-duration assets such as growth stocks, gold and bonds.",
    summaryBear:
      "A softer policy path typically weighs on the dollar and yields, and tends to support long-duration assets such as growth stocks, gold and bonds.",
  },
  {
    theme: "inflation-hot",
    category: "macro",
    impact: "high",
    driver: "inflation",
    bullish: [
      "US inflation comes in hotter than forecast",
      "Core price pressures prove stickier than expected",
      "Services inflation re-accelerates in latest print",
    ],
    bearish: [
      "Inflation cools more than expected",
      "Core CPI undershoots consensus",
      "Disinflation trend resumes in latest data",
    ],
    summaryBull:
      "Hotter inflation raises the risk of tighter policy for longer. It can support real-asset exposure but usually pressures bonds and rate-sensitive equities.",
    summaryBear:
      "Cooler inflation reduces pressure on policymakers, which typically supports bonds and rate-sensitive equities and softens the dollar.",
  },
  {
    theme: "growth-strong",
    category: "macro",
    impact: "high",
    driver: "growth",
    bullish: [
      "Payrolls beat expectations as hiring stays resilient",
      "Activity surveys point to firmer growth momentum",
      "Retail sales top forecasts",
    ],
    bearish: [
      "Jobless claims rise as labour demand softens",
      "Activity surveys slip back into contraction",
      "Retail sales miss as consumer spending slows",
    ],
    summaryBull:
      "Stronger growth supports cyclical equities and commodities, though it can also keep policy tighter for longer.",
    summaryBear:
      "Weaker growth pressures cyclical equities and commodities, but can bring policy easing expectations forward.",
  },
  {
    theme: "risk-sentiment",
    category: "markets",
    impact: "medium",
    driver: "riskAppetite",
    bullish: [
      "Global equities extend gains as risk appetite improves",
      "Investors add exposure as volatility drops",
      "Broad risk rally lifts cyclical assets",
    ],
    bearish: [
      "Risk assets slide as investors reduce exposure",
      "Volatility picks up, defensives outperform",
      "Global equities pull back from highs",
    ],
    summaryBull: "Improving risk appetite tends to support equities, high-beta FX and crypto, and weigh on defensive havens.",
    summaryBear: "Deteriorating risk appetite tends to support havens such as the yen, the franc and gold, and weigh on high-beta assets.",
  },
  {
    theme: "dollar",
    category: "forex",
    impact: "medium",
    driver: "dollar",
    bullish: [
      "Dollar index climbs to a multi-week high",
      "Greenback firms broadly against the majors",
      "Dollar demand picks up as yields hold up",
    ],
    bearish: [
      "Dollar slips as yields ease",
      "Greenback softens broadly against the majors",
      "Dollar retreats from recent highs",
    ],
    symbols: ["DXY", "EUR/USD", "XAU/USD"],
    summaryBull: "A firmer dollar typically pressures dollar-denominated commodities and non-USD currency pairs.",
    summaryBear: "A softer dollar typically supports dollar-denominated commodities and non-USD currency pairs.",
  },
  {
    theme: "geopolitics",
    category: "geopolitics",
    impact: "high",
    bullish: [
      "Shipping-lane disruption raises supply concerns",
      "Regional tensions escalate, raising energy supply risk",
      "New export restrictions announced on strategic goods",
    ],
    bearish: [
      "De-escalation talks make progress",
      "Ceasefire framework agreed, easing supply concerns",
      "Trade restrictions partially rolled back",
    ],
    summaryBull: "Escalation tends to support havens and energy, and weigh on risk assets and cyclical currencies.",
    summaryBear: "De-escalation tends to unwind haven and energy premiums and support risk assets.",
  },
  {
    theme: "oil-supply",
    category: "commodities",
    impact: "high",
    bullish: [
      "OPEC+ extends production cuts",
      "Crude inventories draw more than expected",
      "Supply outage curbs regional output",
    ],
    bearish: [
      "Crude inventories build more than expected",
      "Producers signal higher output quotas",
      "Demand outlook trimmed by forecasters",
    ],
    symbols: ["WTI", "BRENT", "XOM", "USD/CAD"],
    summaryBull: "Tighter supply supports crude prices and energy equities, and tends to support commodity currencies.",
    summaryBear: "Looser supply weighs on crude prices and energy equities.",
  },
  {
    theme: "gold-demand",
    category: "commodities",
    impact: "medium",
    bullish: [
      "Central bank gold buying continues at a strong pace",
      "Gold ETF holdings rise for a third straight week",
      "Physical demand picks up in key markets",
    ],
    bearish: [
      "Gold ETF outflows accelerate",
      "Central bank purchases slow from record pace",
      "Physical demand cools in key markets",
    ],
    symbols: ["XAU/USD", "GLD", "XAG/USD"],
    summaryBull: "Persistent official-sector and ETF demand is a structural support for gold.",
    summaryBear: "Fading investment demand removes a structural support from gold.",
  },
  {
    theme: "crypto-adoption",
    category: "crypto",
    impact: "medium",
    bullish: [
      "Spot crypto ETF inflows hit a new weekly record",
      "Major institution expands digital-asset custody offering",
      "Network activity climbs to a multi-month high",
    ],
    bearish: [
      "Crypto ETF flows turn negative for the week",
      "Institution scales back digital-asset plans",
      "On-chain activity falls to a multi-month low",
    ],
    symbols: ["BTC/USD", "ETH/USD"],
    summaryBull: "Stronger structural demand is supportive for major crypto assets, though it does not remove macro sensitivity.",
    summaryBear: "Weaker structural demand removes a support from major crypto assets.",
  },
  {
    theme: "regulation-crypto",
    category: "crypto",
    impact: "high",
    bullish: [
      "Regulator clarifies framework for digital-asset listings",
      "Court ruling reduces regulatory uncertainty for token issuers",
    ],
    bearish: [
      "Regulator opens enforcement action against major platform",
      "New disclosure rules proposed for digital-asset firms",
    ],
    symbols: ["BTC/USD", "XRP/USD", "ETH/USD"],
    summaryBull: "Reduced regulatory uncertainty is typically supportive for exchange-listed digital assets.",
    summaryBear: "Rising regulatory uncertainty typically weighs on exchange-listed digital assets.",
  },
  {
    theme: "earnings-tech",
    category: "stocks",
    impact: "high",
    bullish: [
      "Cloud revenue beats expectations at a mega-cap platform",
      "Tech guidance raised on stronger enterprise demand",
      "Advertising revenue re-accelerates",
    ],
    bearish: [
      "Guidance disappoints despite in-line quarter",
      "Enterprise spending commentary turns cautious",
      "Margin pressure flagged on higher capex",
    ],
    symbols: ["MSFT", "GOOGL", "META", "AAPL", "NDX"],
    summaryBull: "Stronger tech fundamentals support the index heavyweights that dominate US benchmarks.",
    summaryBear: "Weaker tech fundamentals weigh on the index heavyweights that dominate US benchmarks.",
  },
  {
    theme: "semis",
    category: "stocks",
    impact: "high",
    bullish: [
      "AI accelerator demand outlook raised for the coming year",
      "Foundry utilisation rises on stronger orders",
      "New AI chip announced with higher memory bandwidth",
    ],
    bearish: [
      "Export restrictions widened on advanced chips",
      "Order lead times shorten, pointing to cooling demand",
      "Inventory build flagged across the supply chain",
    ],
    symbols: ["NVDA", "AMD", "NDX"],
    summaryBull: "Semiconductor demand strength supports the AI complex and, through index weighting, the Nasdaq.",
    summaryBear: "Semiconductor demand weakness pressures the AI complex and, through index weighting, the Nasdaq.",
  },
  {
    theme: "china-growth",
    category: "macro",
    impact: "medium",
    bullish: ["Beijing unveils fresh stimulus measures", "China factory activity returns to expansion"],
    bearish: ["China factory activity contracts again", "Property sector drag deepens"],
    symbols: ["HSI", "COPPER", "AUD/USD"],
    summaryBull: "Stronger Chinese demand supports industrial commodities and commodity-linked currencies.",
    summaryBear: "Weaker Chinese demand pressures industrial commodities and commodity-linked currencies.",
  },
  {
    theme: "central-bank-ecb",
    category: "central-banks",
    impact: "high",
    bullish: ["ECB officials signal caution on cutting rates", "Euro-area wage data keeps the ECB patient"],
    bearish: ["ECB signals readiness to ease policy", "Euro-area inflation undershoot opens the door to cuts"],
    symbols: ["EUR/USD", "EUR/JPY", "DAX"],
    summaryBull: "A more patient ECB is typically supportive for the euro.",
    summaryBear: "A more dovish ECB is typically a headwind for the euro.",
  },
  {
    theme: "central-bank-boj",
    category: "central-banks",
    impact: "high",
    bullish: ["BOJ signals further policy normalisation", "Japanese officials step up intervention warnings"],
    bearish: ["BOJ reiterates accommodative stance", "Japanese officials play down near-term policy change"],
    symbols: ["USD/JPY", "GBP/JPY", "NIKKEI"],
    summaryBull: "A more hawkish BOJ is typically supportive for the yen and a headwind for yen crosses.",
    summaryBear: "A more dovish BOJ is typically a headwind for the yen and supportive for yen crosses.",
  },
  {
    theme: "central-bank-boe",
    category: "central-banks",
    impact: "medium",
    bullish: ["BOE holds a hawkish line on services inflation", "UK wage growth keeps the BOE cautious"],
    bearish: ["BOE signals scope to begin easing", "UK inflation undershoot opens the door to cuts"],
    symbols: ["GBP/USD", "GBP/JPY", "FTSE"],
    summaryBull: "A more patient BOE is typically supportive for sterling.",
    summaryBear: "A more dovish BOE is typically a headwind for sterling.",
  },
  {
    theme: "earnings-generic",
    category: "stocks",
    impact: "medium",
    bullish: ["Banks report stronger net interest income", "Energy majors beat on higher realisations"],
    bearish: ["Loan loss provisions rise across large banks", "Energy majors miss on weaker refining margins"],
    symbols: ["JPM", "XOM", "SPX"],
    summaryBull: "Better sector fundamentals support the relevant index constituents.",
    summaryBear: "Weaker sector fundamentals weigh on the relevant index constituents.",
  },
  {
    theme: "energy-demand",
    category: "commodities",
    impact: "low",
    bullish: ["Colder forecasts lift heating demand expectations", "Power burn rises above seasonal norms"],
    bearish: ["Milder forecasts trim heating demand expectations", "Storage levels run above the five-year average"],
    symbols: ["NATGAS"],
    summaryBull: "Stronger demand expectations support natural gas.",
    summaryBear: "Weaker demand expectations weigh on natural gas.",
  },
];

export const NEWS_THEMES = TEMPLATES.map((t) => t.theme);

const IMPACT_ORDER: Record<Impact, number> = { low: 0, medium: 1, high: 2 };

export function generateNews(now = Date.now(), hoursBack = 72): NewsArticle[] {
  const narrative = macroNarrative(now);
  const hourBucket = Math.floor(now / HOUR);
  const articles: NewsArticle[] = [];

  for (let h = 0; h < hoursBack; h++) {
    const bucket = hourBucket - h;
    const next = rng(`news:${bucket}`);
    // Roughly one or two stories an hour, deterministic per hour bucket.
    const count = next() > 0.45 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const tpl = TEMPLATES[Math.floor(next() * TEMPLATES.length) % TEMPLATES.length];
      const driverValue = tpl.driver ? narrative[tpl.driver] : (next() - 0.5) * 1.6;
      const noise = (next() - 0.5) * 0.7;
      let sentiment = Math.max(-1, Math.min(1, driverValue * 0.75 + noise));
      if (tpl.invert) sentiment = -sentiment;
      const bullish = sentiment >= 0;
      const pool = bullish ? tpl.bullish : tpl.bearish;
      const headline = pool[Math.floor(next() * pool.length) % pool.length];
      const minutes = Math.floor(next() * 59);
      articles.push({
        id: `demo-${bucket}-${k}`,
        headline,
        source: SOURCES[Math.floor(next() * SOURCES.length) % SOURCES.length],
        publishedAt: bucket * HOUR + minutes * 60_000,
        theme: tpl.theme,
        category: tpl.category,
        sentiment,
        impact: tpl.impact,
        symbols: tpl.symbols ?? [],
        summary: bullish ? tpl.summaryBull : tpl.summaryBear,
        demo: true,
      });
    }
  }

  return articles
    .filter((a) => a.publishedAt <= now)
    .sort((a, b) => b.publishedAt - a.publishedAt || IMPACT_ORDER[b.impact] - IMPACT_ORDER[a.impact]);
}

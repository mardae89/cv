import type { Asset, AssetClass, CrossMarketLink, MacroBetas } from "@/lib/types";
import { normalizeSymbol, symbolMatches } from "@/lib/symbols";

/**
 * THE ASSET UNIVERSE.
 *
 * This build is for forex and futures traders, and nothing else: the 28 forex
 * pairs, the index futures, metals and energy. No individual stocks, no ETFs,
 * no crypto.
 *
 * Each asset carries the metadata the analysis engine needs:
 *  - macroBetas  : how it historically responds to macro factors
 *  - related     : the cross-market relationships used for confirmation
 *  - eventTags   : which economic events create event risk for it
 *  - aliases     : the other names traders type for it (NQ, US100, GOLD …)
 *
 * The dollar index, VIX and the US 10-year yield stay in as REFERENCE markets.
 * Nobody trades them here, but the cross-market and regime reads lean on them,
 * and every forex trader looks at the DXY anyway.
 */

type Betas = Partial<MacroBetas>;

const ZERO: MacroBetas = {
  dollar: 0,
  realYields: 0,
  riskAppetite: 0,
  inflation: 0,
  growth: 0,
  rates: 0,
};

function betas(b: Betas): MacroBetas {
  return { ...ZERO, ...b };
}

function rel(symbol: string, sign: 1 | -1, weight: number, label: string): CrossMarketLink {
  return { symbol, sign, weight, label };
}

interface AssetInput extends Omit<Asset, "macroBetas" | "related" | "eventTags" | "aliases"> {
  macroBetas: Betas;
  related?: CrossMarketLink[];
  eventTags?: string[];
  aliases?: string[];
}

function asset(a: AssetInput): Asset {
  return {
    ...a,
    macroBetas: betas(a.macroBetas),
    related: a.related ?? [],
    eventTags: a.eventTags ?? [],
    aliases: a.aliases ?? [],
  };
}

const US_EVENTS = ["fed", "us-inflation", "us-jobs", "us-growth"];

/* -------------------------------------------------------------------------- */
/*  FOREX MINORS — generated from per-currency profiles                        */
/* -------------------------------------------------------------------------- */
/**
 * All 21 crosses among the eight major currencies are derived rather than
 * written out one at a time, so the set is complete by construction: with the
 * seven USD majors below, the app covers the full 28 pairs a forex trader
 * expects.
 *
 * A cross is a ratio, so its response to any factor is the base currency's
 * response minus the quote currency's.
 *
 * The USD majors stay hand-written: they carry dollar-specific anchors (DXY,
 * copper, crude) that do not fall out of a subtraction.
 */
interface CurrencyProfile {
  name: string;
  /** Value of one unit in USD. Keeps generated demo prices arbitrage-free. */
  usd: number;
  /** Demo-mode drift of the currency itself; a cross gets base minus quote. */
  drift: number;
  /** Demo-mode volatility contribution; a cross adds the two in quadrature. */
  vol: number;
  /** Currencies that trade together, so their crosses are quieter than that. */
  bloc: "europe" | "commodity" | "haven";
  macro: Betas;
  events: string[];
  /** Markets that move WITH this currency. A cross inherits them signed. */
  anchors: Array<[symbol: string, weight: number, label: string]>;
}

const CURRENCIES: Record<string, CurrencyProfile> = {
  EUR: {
    name: "Euro", usd: 1.0842, drift: 0.05, vol: 0.054, bloc: "europe",
    macro: { rates: 0.15, realYields: -0.05, riskAppetite: 0.05, growth: 0.25 },
    events: ["ecb", "eu-inflation", "eu-growth"],
    anchors: [["GER40", 0.45, "European equities"]],
  },
  GBP: {
    name: "British Pound", usd: 1.2718, drift: 0.17, vol: 0.066, bloc: "europe",
    macro: { rates: 0.2, riskAppetite: 0.15, growth: 0.3 },
    events: ["boe", "uk-inflation", "uk-growth"],
    anchors: [["UK100", 0.3, "UK equities"]],
  },
  AUD: {
    name: "Australian Dollar", usd: 0.6592, drift: 0.03, vol: 0.078, bloc: "commodity",
    macro: { rates: 0.1, riskAppetite: 0.45, growth: 0.45, inflation: 0.2 },
    events: ["rba", "china"],
    anchors: [["COPPER", 0.6, "Copper"], ["HK50", 0.5, "China proxy"]],
  },
  NZD: {
    name: "New Zealand Dollar", usd: 0.6088, drift: 0, vol: 0.078, bloc: "commodity",
    macro: { rates: 0.1, riskAppetite: 0.45, growth: 0.4, inflation: 0.1 },
    events: ["rbnz", "china"],
    anchors: [["COPPER", 0.4, "Copper"], ["HK50", 0.4, "China proxy"]],
  },
  CAD: {
    name: "Canadian Dollar", usd: 1 / 1.3588, drift: -0.05, vol: 0.054, bloc: "commodity",
    macro: { rates: 0.15, riskAppetite: 0.15, growth: 0.2, inflation: 0.3 },
    events: ["boc", "oil"],
    anchors: [["WTI", 0.7, "Crude oil"]],
  },
  CHF: {
    name: "Swiss Franc", usd: 1 / 0.8964, drift: 0.29, vol: 0.054, bloc: "europe",
    macro: { rates: -0.05, realYields: -0.1, riskAppetite: -0.35 },
    events: ["snb"],
    anchors: [["XAU/USD", 0.4, "Gold"], ["VIX", 0.4, "Volatility"]],
  },
  JPY: {
    name: "Japanese Yen", usd: 1 / 151.42, drift: -0.25, vol: 0.078, bloc: "haven",
    macro: { rates: -0.3, realYields: -0.45, riskAppetite: -0.5, growth: -0.1 },
    events: ["boj", "jp-inflation"],
    anchors: [["VIX", 0.5, "Volatility"]],
  },
};

/**
 * Market convention for which currency is quoted first. Every pair in the
 * 28 reads base-before-quote in this order (EUR/AUD, not AUD/EUR).
 */
const QUOTE_ORDER = ["EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY"];

/** How each currency is quoted against the dollar, for the cross-market links. */
const USD_MAJOR: Record<string, { symbol: string; baseIsUsd: boolean }> = {
  EUR: { symbol: "EUR/USD", baseIsUsd: false },
  GBP: { symbol: "GBP/USD", baseIsUsd: false },
  AUD: { symbol: "AUD/USD", baseIsUsd: false },
  NZD: { symbol: "NZD/USD", baseIsUsd: false },
  CAD: { symbol: "USD/CAD", baseIsUsd: true },
  CHF: { symbol: "USD/CHF", baseIsUsd: true },
  JPY: { symbol: "USD/JPY", baseIsUsd: true },
};

/** Correlated currencies make for quieter crosses than independence implies. */
const BLOC_DAMPENING = 0.65;

function round(value: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

/** Subtract two factor maps: a pair responds as base minus quote. */
function subtract(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const v = round((a[key] ?? 0) - (b[key] ?? 0), 2);
    if (v !== 0) out[key] = v;
  }
  return out;
}

function crossAsset(baseCode: string, quoteCode: string): Asset {
  const base = CURRENCIES[baseCode];
  const quote = CURRENCIES[quoteCode];
  const precision = quoteCode === "JPY" ? 3 : 5;

  // Anchors net out when both legs share one, so AUD/NZD keeps only the
  // copper sensitivity the two do not have in common.
  const anchorWeights = new Map<string, { weight: number; label: string }>();
  for (const [symbol, weight, label] of base.anchors) {
    anchorWeights.set(symbol, { weight, label });
  }
  for (const [symbol, weight, label] of quote.anchors) {
    const prev = anchorWeights.get(symbol);
    anchorWeights.set(symbol, { weight: (prev?.weight ?? 0) - weight, label: prev?.label ?? label });
  }
  const related: CrossMarketLink[] = [];
  for (const [symbol, { weight, label }] of anchorWeights) {
    // Below this the link is noise, and a zero-sign link would be meaningless.
    if (Math.abs(weight) < 0.15) continue;
    related.push(rel(symbol, weight > 0 ? 1 : -1, round(Math.abs(weight), 2), label));
  }
  // Each leg also confirms against its own dollar pair.
  const baseMajor = USD_MAJOR[baseCode];
  const quoteMajor = USD_MAJOR[quoteCode];
  related.push(rel(baseMajor.symbol, baseMajor.baseIsUsd ? -1 : 1, 0.6, `${baseCode} vs dollar`));
  related.push(rel(quoteMajor.symbol, quoteMajor.baseIsUsd ? 1 : -1, 0.6, `${quoteCode} vs dollar`));

  const vol = base.bloc === quote.bloc ? BLOC_DAMPENING : 1;

  return asset({
    symbol: `${baseCode}/${quoteCode}`,
    name: `${base.name} / ${quote.name}`,
    assetClass: "forex",
    group: "Forex Minors",
    precision,
    demoPrice: round(base.usd / quote.usd, precision),
    demoVol: round(Math.hypot(base.vol, quote.vol) * vol, 3),
    demoBias: round(base.drift - quote.drift, 2),
    currencies: [baseCode, quoteCode],
    macroBetas: subtract(base.macro as Record<string, number>, quote.macro as Record<string, number>) as Betas,
    eventTags: Array.from(new Set([...base.events, ...quote.events])),
    related,
  });
}

/** The 21 minors: every pair of the eight majors that is not a dollar pair. */
const CROSS_CODES = QUOTE_ORDER.filter((c) => c !== "USD");
const FOREX_MINORS: Asset[] = CROSS_CODES.flatMap((baseCode, i) =>
  CROSS_CODES.slice(i + 1).map((quoteCode) => crossAsset(baseCode, quoteCode)),
);

export const ASSETS: Asset[] = [
  /* ------------------------------ FOREX MAJORS ------------------------------ */
  asset({
    symbol: "EUR/USD", name: "Euro / US Dollar", assetClass: "forex", group: "Forex Majors",
    precision: 5, demoPrice: 1.0842, demoVol: 0.07, demoBias: 0.18,
    currencies: ["EUR", "USD"], aliases: ["FIBER"],
    macroBetas: { dollar: -0.95, rates: -0.5, realYields: -0.45, growth: 0.25, riskAppetite: 0.2 },
    eventTags: [...US_EVENTS, "ecb", "eu-inflation", "eu-growth"],
    related: [rel("DXY", -1, 1, "Dollar index"), rel("XAU/USD", 1, 0.4, "Gold"), rel("US10Y", -1, 0.5, "US 10Y yield")],
  }),
  asset({
    symbol: "GBP/USD", name: "British Pound / US Dollar", assetClass: "forex", group: "Forex Majors",
    precision: 5, demoPrice: 1.2718, demoVol: 0.08, demoBias: 0.12,
    currencies: ["GBP", "USD"], aliases: ["CABLE"],
    macroBetas: { dollar: -0.9, rates: -0.45, realYields: -0.4, growth: 0.3, riskAppetite: 0.3 },
    eventTags: [...US_EVENTS, "boe", "uk-inflation", "uk-growth"],
    related: [rel("DXY", -1, 1, "Dollar index"), rel("EUR/USD", 1, 0.7, "Euro"), rel("GBP/JPY", 1, 0.5, "Sterling cross")],
  }),
  asset({
    symbol: "USD/JPY", name: "US Dollar / Japanese Yen", assetClass: "forex", group: "Forex Majors",
    precision: 3, demoPrice: 151.42, demoVol: 0.09, demoBias: -0.22,
    currencies: ["USD", "JPY"], aliases: ["GOPHER"],
    macroBetas: { dollar: 0.85, rates: 0.8, realYields: 0.85, riskAppetite: 0.4, growth: 0.3 },
    eventTags: [...US_EVENTS, "boj", "jp-inflation"],
    related: [rel("US10Y", 1, 0.9, "US 10Y yield"), rel("DXY", 1, 0.8, "Dollar index"), rel("XAU/USD", -1, 0.35, "Gold")],
  }),
  asset({
    symbol: "USD/CHF", name: "US Dollar / Swiss Franc", assetClass: "forex", group: "Forex Majors",
    precision: 5, demoPrice: 0.8964, demoVol: 0.07, demoBias: -0.1,
    currencies: ["USD", "CHF"], aliases: ["SWISSY"],
    macroBetas: { dollar: 0.85, rates: 0.6, realYields: 0.6, riskAppetite: 0.35 },
    eventTags: [...US_EVENTS, "snb"],
    related: [rel("DXY", 1, 0.9, "Dollar index"), rel("XAU/USD", -1, 0.4, "Gold")],
  }),
  asset({
    symbol: "AUD/USD", name: "Australian Dollar / US Dollar", assetClass: "forex", group: "Forex Majors",
    precision: 5, demoPrice: 0.6592, demoVol: 0.09, demoBias: 0.14,
    currencies: ["AUD", "USD"], aliases: ["AUSSIE"],
    macroBetas: { dollar: -0.85, riskAppetite: 0.7, growth: 0.6, inflation: 0.2 },
    eventTags: [...US_EVENTS, "rba", "china"],
    related: [rel("HK50", 1, 0.5, "Hang Seng / China proxy"), rel("COPPER", 1, 0.6, "Copper"), rel("DXY", -1, 0.9, "Dollar index")],
  }),
  asset({
    symbol: "USD/CAD", name: "US Dollar / Canadian Dollar", assetClass: "forex", group: "Forex Majors",
    precision: 5, demoPrice: 1.3588, demoVol: 0.07, demoBias: -0.16,
    currencies: ["USD", "CAD"], aliases: ["LOONIE"],
    macroBetas: { dollar: 0.8, riskAppetite: -0.4, growth: -0.3, rates: 0.4 },
    eventTags: [...US_EVENTS, "boc", "oil"],
    related: [rel("WTI", -1, 0.8, "Crude oil"), rel("DXY", 1, 0.85, "Dollar index")],
  }),
  asset({
    symbol: "NZD/USD", name: "New Zealand Dollar / US Dollar", assetClass: "forex", group: "Forex Majors",
    precision: 5, demoPrice: 0.6088, demoVol: 0.09, demoBias: 0.08,
    currencies: ["NZD", "USD"], aliases: ["KIWI"],
    macroBetas: { dollar: -0.85, riskAppetite: 0.7, growth: 0.55 },
    eventTags: [...US_EVENTS, "rbnz", "china"],
    related: [rel("AUD/USD", 1, 0.9, "Aussie dollar"), rel("DXY", -1, 0.85, "Dollar index")],
  }),

  ...FOREX_MINORS,

  /* ----------------------------- INDEX FUTURES ----------------------------- */
  /*  Named the way a trader's platform names them. The aliases cover the      */
  /*  CME contract codes and the other broker spellings, so NQ, US100 and       */
  /*  USTEC all find the Nasdaq.                                                */
  asset({
    symbol: "NAS100", name: "Nasdaq 100", assetClass: "index", group: "Index Futures",
    precision: 2, demoPrice: 18240.3, demoVol: 0.18, demoBias: 0.68,
    aliases: ["NDX", "NQ", "MNQ", "US100", "USTEC", "NASDAQ"],
    macroBetas: { riskAppetite: 1, realYields: -0.85, rates: -0.8, growth: 0.6, inflation: -0.4 },
    eventTags: US_EVENTS,
    related: [rel("US10Y", -1, 0.8, "10Y yield"), rel("SPX500", 1, 0.9, "S&P 500"), rel("VIX", -1, 0.8, "Volatility index")],
  }),
  asset({
    symbol: "SPX500", name: "S&P 500", assetClass: "index", group: "Index Futures",
    precision: 2, demoPrice: 5218.6, demoVol: 0.13, demoBias: 0.5,
    aliases: ["SPX", "ES", "MES", "US500", "SP500", "S&P 500"],
    macroBetas: { riskAppetite: 1, realYields: -0.55, rates: -0.5, growth: 0.7, inflation: -0.3 },
    eventTags: US_EVENTS,
    related: [rel("VIX", -1, 0.9, "Volatility index"), rel("NAS100", 1, 0.9, "Nasdaq 100"), rel("US10Y", -1, 0.5, "10Y yield")],
  }),
  asset({
    symbol: "US30", name: "Dow Jones 30", assetClass: "index", group: "Index Futures",
    precision: 2, demoPrice: 39102.5, demoVol: 0.11, demoBias: 0.35,
    aliases: ["DJI", "YM", "MYM", "DOW", "DJ30", "WALLSTREET"],
    macroBetas: { riskAppetite: 0.85, realYields: -0.35, growth: 0.75, rates: -0.3 },
    eventTags: US_EVENTS,
    related: [rel("SPX500", 1, 0.95, "S&P 500"), rel("VIX", -1, 0.7, "Volatility index")],
  }),
  asset({
    symbol: "US2000", name: "Russell 2000", assetClass: "index", group: "Index Futures",
    precision: 2, demoPrice: 2064.8, demoVol: 0.19, demoBias: 0.1,
    aliases: ["RUT", "RTY", "M2K", "RUSSELL"],
    macroBetas: { riskAppetite: 0.9, realYields: -0.8, rates: -0.85, growth: 0.85 },
    eventTags: US_EVENTS,
    related: [rel("US10Y", -1, 0.7, "US yields"), rel("SPX500", 1, 0.8, "S&P 500")],
  }),
  asset({
    symbol: "GER40", name: "DAX 40 (Germany)", assetClass: "index", group: "Index Futures",
    precision: 2, demoPrice: 18205.1, demoVol: 0.15, demoBias: 0.42,
    aliases: ["DAX", "DE40", "DE30", "GER30", "FDAX"],
    macroBetas: { riskAppetite: 0.9, growth: 0.7, realYields: -0.4, dollar: -0.2 },
    eventTags: ["ecb", "eu-growth", "eu-inflation"],
    related: [rel("SPX500", 1, 0.75, "Global equities"), rel("EUR/USD", 1, 0.3, "Euro")],
  }),
  asset({
    symbol: "UK100", name: "FTSE 100 (UK)", assetClass: "index", group: "Index Futures",
    precision: 2, demoPrice: 8104.2, demoVol: 0.11, demoBias: 0.2,
    aliases: ["FTSE", "UKX", "FOOTSIE"],
    macroBetas: { riskAppetite: 0.7, growth: 0.5, inflation: 0.25 },
    eventTags: ["boe", "uk-inflation", "oil"],
    related: [rel("SPX500", 1, 0.6, "Global equities"), rel("WTI", 1, 0.35, "Energy weighting"), rel("GBP/USD", -1, 0.3, "Sterling")],
  }),
  asset({
    symbol: "JPN225", name: "Nikkei 225 (Japan)", assetClass: "index", group: "Index Futures",
    precision: 2, demoPrice: 39420.7, demoVol: 0.17, demoBias: 0.45,
    aliases: ["NIKKEI", "JP225", "NKY", "NK225"],
    macroBetas: { riskAppetite: 0.85, growth: 0.6, dollar: 0.5 },
    eventTags: ["boj", "jp-inflation"],
    related: [rel("USD/JPY", 1, 0.7, "Weak yen tailwind"), rel("SPX500", 1, 0.7, "Global equities")],
  }),
  asset({
    symbol: "HK50", name: "Hang Seng (Hong Kong)", assetClass: "index", group: "Index Futures",
    precision: 2, demoPrice: 17420.4, demoVol: 0.22, demoBias: -0.28,
    aliases: ["HSI", "HK33", "HANGSENG"],
    macroBetas: { riskAppetite: 0.75, growth: 0.7, dollar: -0.4 },
    eventTags: ["china", "geopolitics"],
    related: [rel("AUD/USD", 1, 0.5, "China proxy"), rel("COPPER", 1, 0.5, "China demand")],
  }),

  /* --------------------------------- METALS -------------------------------- */
  asset({
    symbol: "XAU/USD", name: "Gold", assetClass: "metal", group: "Metals",
    precision: 2, demoPrice: 2338.4, demoVol: 0.14, demoBias: 0.55,
    aliases: ["GOLD", "GC", "MGC"],
    macroBetas: { dollar: -0.85, realYields: -0.9, rates: -0.6, inflation: 0.4, riskAppetite: -0.35 },
    eventTags: ["fed", "us-inflation", "us-jobs", "geopolitics"],
    related: [
      rel("DXY", -1, 1, "US dollar"), rel("US10Y", -1, 0.9, "Real yields proxy"),
      rel("XAG/USD", 1, 0.7, "Silver"), rel("VIX", 1, 0.35, "Risk aversion"),
    ],
  }),
  asset({
    symbol: "XAG/USD", name: "Silver", assetClass: "metal", group: "Metals",
    precision: 3, demoPrice: 27.42, demoVol: 0.24, demoBias: 0.4,
    aliases: ["SILVER", "SI", "SIL"],
    macroBetas: { dollar: -0.75, realYields: -0.7, inflation: 0.45, growth: 0.4, riskAppetite: 0.15 },
    eventTags: ["fed", "us-inflation", "china"],
    related: [rel("XAU/USD", 1, 1, "Gold"), rel("COPPER", 1, 0.5, "Industrial demand"), rel("DXY", -1, 0.8, "US dollar")],
  }),
  asset({
    symbol: "COPPER", name: "Copper", assetClass: "metal", group: "Metals",
    precision: 4, demoPrice: 4.4128, demoVol: 0.26, demoBias: 0.38,
    aliases: ["HG", "XCU", "XCU/USD"],
    macroBetas: { growth: 0.9, dollar: -0.5, inflation: 0.4, riskAppetite: 0.5 },
    eventTags: ["china", "us-growth"],
    related: [rel("HK50", 1, 0.5, "China demand"), rel("AUD/USD", 1, 0.55, "Commodity FX"), rel("XAG/USD", 1, 0.4, "Silver")],
  }),

  /* --------------------------------- ENERGY -------------------------------- */
  asset({
    symbol: "WTI", name: "Crude Oil (WTI)", assetClass: "commodity", group: "Energy",
    precision: 2, demoPrice: 81.6, demoVol: 0.32, demoBias: 0.22,
    aliases: ["USOIL", "CL", "MCL", "CRUDE", "OIL", "WTICO"],
    macroBetas: { growth: 0.75, inflation: 0.6, dollar: -0.4, riskAppetite: 0.35 },
    eventTags: ["oil", "geopolitics", "china", "us-growth"],
    related: [rel("BRENT", 1, 1, "Brent crude"), rel("USD/CAD", -1, 0.5, "Canadian dollar"), rel("DXY", -1, 0.4, "US dollar")],
  }),
  asset({
    symbol: "BRENT", name: "Crude Oil (Brent)", assetClass: "commodity", group: "Energy",
    precision: 2, demoPrice: 85.9, demoVol: 0.31, demoBias: 0.24,
    aliases: ["UKOIL", "BCO", "BZ"],
    macroBetas: { growth: 0.75, inflation: 0.6, dollar: -0.4, riskAppetite: 0.35 },
    eventTags: ["oil", "geopolitics", "china"],
    related: [rel("WTI", 1, 1, "WTI crude")],
  }),
  asset({
    symbol: "NATGAS", name: "Natural Gas", assetClass: "commodity", group: "Energy",
    precision: 3, demoPrice: 2.184, demoVol: 0.7, demoBias: -0.4,
    aliases: ["NG", "GAS", "XNG"],
    macroBetas: { growth: 0.4, inflation: 0.5 },
    eventTags: ["oil", "geopolitics"],
    related: [rel("WTI", 1, 0.4, "Energy complex")],
  }),

  /* ------------------------- MACRO REFERENCE MARKETS ----------------------- */
  /*  Inputs to the cross-market and regime reads. Shown so the evidence can   */
  /*  be checked, but excluded from rankings, radars and the global score.     */
  asset({
    symbol: "DXY", name: "US Dollar Index", assetClass: "index", group: "Macro Reference",
    precision: 3, demoPrice: 104.28, demoVol: 0.06, demoBias: -0.18,
    aliases: ["USDX", "DX"],
    macroBetas: { dollar: 1, rates: 0.7, realYields: 0.7, growth: 0.4 },
    eventTags: US_EVENTS,
    related: [rel("EUR/USD", -1, 0.9, "Euro (largest weight)"), rel("US10Y", 1, 0.6, "US yields"), rel("XAU/USD", -1, 0.5, "Gold")],
  }),
  asset({
    symbol: "VIX", name: "CBOE Volatility Index", assetClass: "index", group: "Macro Reference",
    precision: 2, demoPrice: 14.62, demoVol: 0.8, demoBias: -0.3,
    macroBetas: { riskAppetite: -1, growth: -0.5 },
    eventTags: [...US_EVENTS, "geopolitics"],
    related: [rel("SPX500", -1, 1, "S&P 500")],
  }),
  asset({
    symbol: "US10Y", name: "US 10-Year Treasury Yield", assetClass: "bond", group: "Macro Reference",
    precision: 3, demoPrice: 4.312, demoVol: 0.2, demoBias: -0.2,
    aliases: ["TNX", "YIELDS"],
    macroBetas: { rates: 0.9, inflation: 0.75, growth: 0.7, realYields: 0.95, riskAppetite: 0.3 },
    eventTags: US_EVENTS,
    related: [rel("DXY", 1, 0.5, "US dollar"), rel("USD/JPY", 1, 0.6, "Dollar-yen")],
  }),
];

export const ASSET_MAP: Map<string, Asset> = new Map(ASSETS.map((a) => [a.symbol, a]));

/**
 * Separator-free lookup: "EURUSD", "eur usd" and "eur-usd" all reach EUR/USD,
 * and every alias resolves too — "NQ" and "US100" both reach NAS100. Nobody
 * should have to type a slash on a phone keyboard to find a pair.
 */
const ALIAS_MAP: Map<string, Asset> = new Map(
  ASSETS.flatMap((a) => [a.symbol, ...a.aliases].map((key) => [normalizeSymbol(key), a] as [string, Asset])),
);

export const GROUPS: string[] = Array.from(new Set(ASSETS.map((a) => a.group)));

/** Markets a trader actually takes positions in — the references are inputs. */
export const TRADABLE_ASSETS: Asset[] = ASSETS.filter((a) => a.group !== "Macro Reference");

/** Assets available on the Free tier — enough to demonstrate the product. */
export const FREE_TIER_SYMBOLS = [
  "EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "GBP/JPY", "EUR/JPY",
  "XAU/USD", "NAS100", "SPX500", "US30", "GER40", "WTI",
];

export function getAsset(symbol: string): Asset | undefined {
  return ASSET_MAP.get(symbol.toUpperCase()) ?? ALIAS_MAP.get(normalizeSymbol(symbol));
}

/**
 * Only the curated universe resolves. The stock build synthesised a definition
 * for any ticker typed into the search box; a forex-and-futures app has no
 * business doing that.
 */
export function resolveAsset(symbol: string): Asset | undefined {
  return getAsset(symbol);
}

export function assetsByClass(cls: AssetClass): Asset[] {
  return ASSETS.filter((a) => a.assetClass === cls);
}

export function searchAssets(query: string, limit = 20): Asset[] {
  if (!query.trim()) return ASSETS.slice(0, limit);
  return ASSETS.filter((a) => symbolMatches(query, a.symbol, a.name, a.group, ...a.aliases)).slice(0, limit);
}

/* --------------------------------- PIPS ---------------------------------- */

/**
 * The size of one pip — or one point, for the indices — in price terms.
 *
 * Forex follows the universal convention (0.0001, or 0.01 against the yen).
 * Gold's "pip" is 0.10 at most retail brokers; silver's 0.01; indices count
 * whole points; oil and gas count cents. Brokers do differ on the metals, so
 * the journal always shows R alongside pips, and R does not depend on this.
 */
export function pipSize(symbol: string): number {
  const a = getAsset(symbol);
  if (!a) return 0.0001;
  if (a.assetClass === "forex") return a.currencies?.[1] === "JPY" ? 0.01 : 0.0001;
  switch (a.symbol) {
    case "XAU/USD": return 0.1;
    case "XAG/USD": return 0.01;
    case "COPPER": return 0.0001;
    case "WTI":
    case "BRENT": return 0.01;
    case "NATGAS": return 0.001;
    default: return a.assetClass === "index" ? 1 : 0.01;
  }
}

/** What the pip is called on this market. */
export function pipUnit(symbol: string): "pips" | "points" {
  const a = getAsset(symbol);
  return a?.assetClass === "index" ? "points" : "pips";
}

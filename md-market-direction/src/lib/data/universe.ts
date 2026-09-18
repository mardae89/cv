import type { Asset, AssetClass, CrossMarketLink, MacroBetas } from "@/lib/types";
import { normalizeSymbol, symbolMatches } from "@/lib/symbols";

/**
 * THE ASSET UNIVERSE.
 *
 * Each asset carries the metadata the analysis engine needs:
 *  - macroBetas  : how it historically responds to macro factors
 *  - newsBetas   : how it responds to each news theme (the news → market map)
 *  - related     : the cross-market relationships used for confirmation
 *  - eventTags   : which economic events create event risk for it
 *
 * Stocks are NOT limited to this list — the search endpoint can synthesise an
 * asset definition for any ticker (see `resolveAsset`).
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

interface AssetInput extends Omit<Asset, "macroBetas" | "related" | "newsBetas" | "eventTags"> {
  macroBetas: Betas;
  related?: CrossMarketLink[];
  newsBetas?: Record<string, number>;
  eventTags?: string[];
}

function asset(a: AssetInput): Asset {
  return {
    ...a,
    macroBetas: betas(a.macroBetas),
    related: a.related ?? [],
    newsBetas: a.newsBetas ?? {},
    eventTags: a.eventTags ?? [],
  };
}

const US_EVENTS = ["fed", "us-inflation", "us-jobs", "us-growth"];

/* -------------------------------------------------------------------------- */
/*  FOREX CROSSES — generated from per-currency profiles                       */
/* -------------------------------------------------------------------------- */
/**
 * All 21 crosses among the eight major currencies are derived rather than
 * written out one at a time, so the set is complete by construction: with the
 * seven USD majors above, the app covers the full 28 pairs a forex trader
 * expects.
 *
 * A cross is a ratio, so its response to any factor is the base currency's
 * response minus the quote currency's. The six crosses that used to be
 * hand-tuned here are reproduced by this model to within ~0.15 on every beta,
 * and their demo prices and drifts come out exact — the subtraction is the
 * rule those values were following anyway.
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
  news: Record<string, number>;
  events: string[];
  /** Markets that move WITH this currency. A cross inherits them signed. */
  anchors: Array<[symbol: string, weight: number, label: string]>;
}

const CURRENCIES: Record<string, CurrencyProfile> = {
  EUR: {
    name: "Euro", usd: 1.0842, drift: 0.05, vol: 0.054, bloc: "europe",
    macro: { rates: 0.15, realYields: -0.05, riskAppetite: 0.05, growth: 0.25 },
    news: { "central-bank-ecb": 0.75, "growth-strong": 0.2 },
    events: ["ecb", "eu-inflation", "eu-growth"],
    anchors: [["DAX", 0.45, "European equities"]],
  },
  GBP: {
    name: "British Pound", usd: 1.2718, drift: 0.17, vol: 0.066, bloc: "europe",
    macro: { rates: 0.2, riskAppetite: 0.15, growth: 0.3 },
    news: { "central-bank-boe": 0.75, "risk-sentiment": 0.15 },
    events: ["boe", "uk-inflation", "uk-growth"],
    anchors: [["FTSE", 0.3, "UK equities"]],
  },
  AUD: {
    name: "Australian Dollar", usd: 0.6592, drift: 0.03, vol: 0.078, bloc: "commodity",
    macro: { rates: 0.1, riskAppetite: 0.45, growth: 0.45, inflation: 0.2 },
    news: { "china-growth": 0.75, "risk-sentiment": 0.45, "growth-strong": 0.3 },
    events: ["rba", "china"],
    anchors: [["COPPER", 0.6, "Copper"], ["HSI", 0.5, "China proxy"]],
  },
  NZD: {
    name: "New Zealand Dollar", usd: 0.6088, drift: 0, vol: 0.078, bloc: "commodity",
    macro: { rates: 0.1, riskAppetite: 0.45, growth: 0.4, inflation: 0.1 },
    news: { "china-growth": 0.65, "risk-sentiment": 0.45, "growth-strong": 0.25 },
    events: ["rbnz", "china"],
    anchors: [["COPPER", 0.4, "Copper"], ["HSI", 0.4, "China proxy"]],
  },
  CAD: {
    name: "Canadian Dollar", usd: 1 / 1.3588, drift: -0.05, vol: 0.054, bloc: "commodity",
    macro: { rates: 0.15, riskAppetite: 0.15, growth: 0.2, inflation: 0.3 },
    news: { "oil-supply": 0.65, "energy-demand": 0.4, "risk-sentiment": 0.15 },
    events: ["boc", "oil"],
    anchors: [["WTI", 0.7, "Crude oil"]],
  },
  CHF: {
    name: "Swiss Franc", usd: 1 / 0.8964, drift: 0.29, vol: 0.054, bloc: "europe",
    macro: { rates: -0.05, realYields: -0.1, riskAppetite: -0.35 },
    news: { geopolitics: 0.6, "risk-sentiment": -0.35 },
    events: ["snb"],
    anchors: [["XAU/USD", 0.4, "Gold"], ["VIX", 0.4, "Volatility"]],
  },
  JPY: {
    name: "Japanese Yen", usd: 1 / 151.42, drift: -0.25, vol: 0.078, bloc: "haven",
    macro: { rates: -0.3, realYields: -0.45, riskAppetite: -0.5, growth: -0.1 },
    news: { "central-bank-boj": 0.85, "risk-sentiment": -0.5, geopolitics: 0.45 },
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
    group: "Forex Crosses",
    precision,
    demoPrice: round(base.usd / quote.usd, precision),
    demoVol: round(Math.hypot(base.vol, quote.vol) * vol, 3),
    demoBias: round(base.drift - quote.drift, 2),
    currencies: [baseCode, quoteCode],
    macroBetas: subtract(base.macro as Record<string, number>, quote.macro as Record<string, number>) as Betas,
    newsBetas: subtract(base.news, quote.news),
    eventTags: Array.from(new Set([...base.events, ...quote.events])),
    related,
  });
}

/** The 21 crosses: every pair of the eight majors that is not a dollar pair. */
const CROSS_CODES = QUOTE_ORDER.filter((c) => c !== "USD");
const FOREX_CROSSES: Asset[] = CROSS_CODES.flatMap((baseCode, i) =>
  CROSS_CODES.slice(i + 1).map((quoteCode) => crossAsset(baseCode, quoteCode)),
);


export const ASSETS: Asset[] = [
  /* ------------------------------ FOREX MAJORS ------------------------------ */
  asset({
    symbol: "EUR/USD", name: "Euro / US Dollar", assetClass: "forex", group: "Forex Majors",
    precision: 5, demoPrice: 1.0842, demoVol: 0.07, demoBias: 0.18,
    currencies: ["EUR", "USD"],
    macroBetas: { dollar: -0.95, rates: -0.5, realYields: -0.45, growth: 0.25, riskAppetite: 0.2 },
    newsBetas: { "rates-hawkish": -0.8, dollar: -0.95, "central-bank-ecb": 0.75, "growth-strong": -0.3, "risk-sentiment": 0.25 },
    eventTags: [...US_EVENTS, "ecb", "eu-inflation", "eu-growth"],
    related: [rel("DXY", -1, 1, "Dollar index"), rel("XAU/USD", 1, 0.4, "Gold"), rel("US10Y", -1, 0.5, "US 10Y yield")],
  }),
  asset({
    symbol: "GBP/USD", name: "British Pound / US Dollar", assetClass: "forex", group: "Forex Majors",
    precision: 5, demoPrice: 1.2718, demoVol: 0.08, demoBias: 0.12,
    currencies: ["GBP", "USD"],
    macroBetas: { dollar: -0.9, rates: -0.45, realYields: -0.4, growth: 0.3, riskAppetite: 0.3 },
    newsBetas: { "rates-hawkish": -0.75, dollar: -0.9, "central-bank-boe": 0.75, "risk-sentiment": 0.3 },
    eventTags: [...US_EVENTS, "boe", "uk-inflation", "uk-growth"],
    related: [rel("DXY", -1, 1, "Dollar index"), rel("EUR/USD", 1, 0.7, "Euro"), rel("GBP/JPY", 1, 0.5, "Sterling cross")],
  }),
  asset({
    symbol: "USD/JPY", name: "US Dollar / Japanese Yen", assetClass: "forex", group: "Forex Majors",
    precision: 3, demoPrice: 151.42, demoVol: 0.09, demoBias: -0.22,
    currencies: ["USD", "JPY"],
    macroBetas: { dollar: 0.85, rates: 0.8, realYields: 0.85, riskAppetite: 0.4, growth: 0.3 },
    newsBetas: { "rates-hawkish": 0.85, dollar: 0.9, "central-bank-boj": -0.9, "risk-sentiment": 0.4, geopolitics: -0.4 },
    eventTags: [...US_EVENTS, "boj", "jp-inflation"],
    related: [rel("US10Y", 1, 0.9, "US 10Y yield"), rel("DXY", 1, 0.8, "Dollar index"), rel("XAU/USD", -1, 0.35, "Gold")],
  }),
  asset({
    symbol: "USD/CHF", name: "US Dollar / Swiss Franc", assetClass: "forex", group: "Forex Majors",
    precision: 5, demoPrice: 0.8964, demoVol: 0.07, demoBias: -0.1,
    currencies: ["USD", "CHF"],
    macroBetas: { dollar: 0.85, rates: 0.6, realYields: 0.6, riskAppetite: 0.35 },
    newsBetas: { "rates-hawkish": 0.7, dollar: 0.85, geopolitics: -0.6, "risk-sentiment": 0.35 },
    eventTags: [...US_EVENTS, "snb"],
    related: [rel("DXY", 1, 0.9, "Dollar index"), rel("XAU/USD", -1, 0.4, "Gold")],
  }),
  asset({
    symbol: "AUD/USD", name: "Australian Dollar / US Dollar", assetClass: "forex", group: "Forex Majors",
    precision: 5, demoPrice: 0.6592, demoVol: 0.09, demoBias: 0.14,
    currencies: ["AUD", "USD"],
    macroBetas: { dollar: -0.85, riskAppetite: 0.7, growth: 0.6, inflation: 0.2 },
    newsBetas: { dollar: -0.85, "china-growth": 0.8, "risk-sentiment": 0.7, "rates-hawkish": -0.6 },
    eventTags: [...US_EVENTS, "rba", "china"],
    related: [rel("HSI", 1, 0.5, "Hang Seng / China proxy"), rel("COPPER", 1, 0.6, "Copper"), rel("DXY", -1, 0.9, "Dollar index")],
  }),
  asset({
    symbol: "USD/CAD", name: "US Dollar / Canadian Dollar", assetClass: "forex", group: "Forex Majors",
    precision: 5, demoPrice: 1.3588, demoVol: 0.07, demoBias: -0.16,
    currencies: ["USD", "CAD"],
    macroBetas: { dollar: 0.8, riskAppetite: -0.4, growth: -0.3, rates: 0.4 },
    newsBetas: { dollar: 0.8, "oil-supply": -0.7, "rates-hawkish": 0.6, "boc": -0.7 },
    eventTags: [...US_EVENTS, "boc", "oil"],
    related: [rel("WTI", -1, 0.8, "Crude oil"), rel("DXY", 1, 0.85, "Dollar index")],
  }),
  asset({
    symbol: "NZD/USD", name: "New Zealand Dollar / US Dollar", assetClass: "forex", group: "Forex Majors",
    precision: 5, demoPrice: 0.6088, demoVol: 0.09, demoBias: 0.08,
    currencies: ["NZD", "USD"],
    macroBetas: { dollar: -0.85, riskAppetite: 0.7, growth: 0.55 },
    newsBetas: { dollar: -0.85, "china-growth": 0.7, "risk-sentiment": 0.7, "rates-hawkish": -0.6 },
    eventTags: [...US_EVENTS, "rbnz", "china"],
    related: [rel("AUD/USD", 1, 0.9, "Aussie dollar"), rel("DXY", -1, 0.85, "Dollar index")],
  }),

  ...FOREX_CROSSES,

  /* --------------------------------- METALS -------------------------------- */
  asset({
    symbol: "XAU/USD", name: "Gold", assetClass: "metal", group: "Metals",
    precision: 2, demoPrice: 2338.4, demoVol: 0.14, demoBias: 0.55,
    macroBetas: { dollar: -0.85, realYields: -0.9, rates: -0.6, inflation: 0.4, riskAppetite: -0.35 },
    newsBetas: {
      "rates-hawkish": -0.8, dollar: -0.85, geopolitics: 0.85, "gold-demand": 0.95,
      "inflation-hot": 0.35, "risk-sentiment": -0.35,
    },
    eventTags: ["fed", "us-inflation", "us-jobs", "geopolitics"],
    related: [
      rel("DXY", -1, 1, "US dollar"), rel("US10Y", -1, 0.9, "Real yields proxy"),
      rel("XAG/USD", 1, 0.7, "Silver"), rel("VIX", 1, 0.35, "Risk aversion"),
    ],
  }),
  asset({
    symbol: "XAG/USD", name: "Silver", assetClass: "metal", group: "Metals",
    precision: 3, demoPrice: 27.42, demoVol: 0.24, demoBias: 0.4,
    macroBetas: { dollar: -0.75, realYields: -0.7, inflation: 0.45, growth: 0.4, riskAppetite: 0.15 },
    newsBetas: { "rates-hawkish": -0.7, dollar: -0.8, geopolitics: 0.5, "gold-demand": 0.7, "china-growth": 0.5 },
    eventTags: ["fed", "us-inflation", "china"],
    related: [rel("XAU/USD", 1, 1, "Gold"), rel("COPPER", 1, 0.5, "Industrial demand"), rel("DXY", -1, 0.8, "US dollar")],
  }),

  /* ------------------------------- US INDICES ------------------------------ */
  asset({
    symbol: "SPX", name: "S&P 500", assetClass: "index", group: "US Indices",
    precision: 2, demoPrice: 5218.6, demoVol: 0.13, demoBias: 0.5,
    macroBetas: { riskAppetite: 1, realYields: -0.55, rates: -0.5, growth: 0.7, inflation: -0.3 },
    newsBetas: { "rates-hawkish": -0.7, "growth-strong": 0.55, "risk-sentiment": 0.9, "earnings-tech": 0.6, geopolitics: -0.5 },
    eventTags: US_EVENTS,
    related: [rel("VIX", -1, 0.9, "Volatility index"), rel("NDX", 1, 0.9, "Nasdaq 100"), rel("US10Y", -1, 0.5, "10Y yield")],
  }),
  asset({
    symbol: "NDX", name: "Nasdaq 100", assetClass: "index", group: "US Indices",
    precision: 2, demoPrice: 18240.3, demoVol: 0.18, demoBias: 0.68,
    macroBetas: { riskAppetite: 1, realYields: -0.85, rates: -0.8, growth: 0.6, inflation: -0.4 },
    newsBetas: { "rates-hawkish": -0.9, "earnings-tech": 0.9, semis: 0.8, "risk-sentiment": 0.9, "growth-strong": 0.4 },
    eventTags: US_EVENTS,
    related: [rel("US10Y", -1, 0.8, "10Y yield"), rel("NVDA", 1, 0.7, "Semiconductor leadership"), rel("VIX", -1, 0.8, "Volatility index")],
  }),
  asset({
    symbol: "DJI", name: "Dow Jones Industrial Average", assetClass: "index", group: "US Indices",
    precision: 2, demoPrice: 39102.5, demoVol: 0.11, demoBias: 0.35,
    macroBetas: { riskAppetite: 0.85, realYields: -0.35, growth: 0.75, rates: -0.3 },
    newsBetas: { "growth-strong": 0.7, "risk-sentiment": 0.8, "rates-hawkish": -0.45, geopolitics: -0.45 },
    eventTags: US_EVENTS,
    related: [rel("SPX", 1, 0.95, "S&P 500"), rel("VIX", -1, 0.7, "Volatility index")],
  }),
  asset({
    symbol: "RUT", name: "Russell 2000", assetClass: "index", group: "US Indices",
    precision: 2, demoPrice: 2064.8, demoVol: 0.19, demoBias: 0.1,
    macroBetas: { riskAppetite: 0.9, realYields: -0.8, rates: -0.85, growth: 0.85 },
    newsBetas: { "rates-hawkish": -0.85, "growth-strong": 0.8, "risk-sentiment": 0.85 },
    eventTags: US_EVENTS,
    related: [rel("US02Y", -1, 0.7, "Front-end rates"), rel("SPX", 1, 0.8, "S&P 500")],
  }),

  /* ---------------------------- GLOBAL INDICES ----------------------------- */
  asset({
    symbol: "DAX", name: "DAX 40 (Germany)", assetClass: "index", group: "International Indices",
    precision: 2, demoPrice: 18205.1, demoVol: 0.15, demoBias: 0.42,
    macroBetas: { riskAppetite: 0.9, growth: 0.7, realYields: -0.4, dollar: -0.2 },
    newsBetas: { "risk-sentiment": 0.85, "central-bank-ecb": -0.5, "china-growth": 0.45, geopolitics: -0.6 },
    eventTags: ["ecb", "eu-growth", "eu-inflation"],
    related: [rel("SPX", 1, 0.75, "Global equities"), rel("EUR/USD", 1, 0.3, "Euro")],
  }),
  asset({
    symbol: "FTSE", name: "FTSE 100 (UK)", assetClass: "index", group: "International Indices",
    precision: 2, demoPrice: 8104.2, demoVol: 0.11, demoBias: 0.2,
    macroBetas: { riskAppetite: 0.7, growth: 0.5, inflation: 0.25 },
    newsBetas: { "risk-sentiment": 0.7, "oil-supply": 0.35, "central-bank-boe": -0.4 },
    eventTags: ["boe", "uk-inflation", "oil"],
    related: [rel("SPX", 1, 0.6, "Global equities"), rel("WTI", 1, 0.35, "Energy weighting"), rel("GBP/USD", -1, 0.3, "Sterling")],
  }),
  asset({
    symbol: "NIKKEI", name: "Nikkei 225 (Japan)", assetClass: "index", group: "International Indices",
    precision: 2, demoPrice: 39420.7, demoVol: 0.17, demoBias: 0.45,
    macroBetas: { riskAppetite: 0.85, growth: 0.6, dollar: 0.5 },
    newsBetas: { "risk-sentiment": 0.85, "central-bank-boj": -0.6, semis: 0.5 },
    eventTags: ["boj", "jp-inflation"],
    related: [rel("USD/JPY", 1, 0.7, "Weak yen tailwind"), rel("SPX", 1, 0.7, "Global equities")],
  }),
  asset({
    symbol: "HSI", name: "Hang Seng (Hong Kong)", assetClass: "index", group: "International Indices",
    precision: 2, demoPrice: 17420.4, demoVol: 0.22, demoBias: -0.28,
    macroBetas: { riskAppetite: 0.75, growth: 0.7, dollar: -0.4 },
    newsBetas: { "china-growth": 0.95, "risk-sentiment": 0.7, geopolitics: -0.7 },
    eventTags: ["china", "geopolitics"],
    related: [rel("AUD/USD", 1, 0.5, "China proxy"), rel("COPPER", 1, 0.5, "China demand")],
  }),

  /* --------------------------------- CRYPTO -------------------------------- */
  asset({
    symbol: "BTC/USD", name: "Bitcoin", assetClass: "crypto", group: "Crypto",
    precision: 2, demoPrice: 64820, demoVol: 0.45, demoBias: 0.5,
    macroBetas: { riskAppetite: 0.8, realYields: -0.6, dollar: -0.5, rates: -0.6, inflation: 0.2 },
    newsBetas: { "rates-hawkish": -0.7, "crypto-adoption": 0.95, "regulation-crypto": 0.8, "risk-sentiment": 0.75, dollar: -0.5 },
    eventTags: ["fed", "us-inflation", "crypto"],
    related: [rel("NDX", 1, 0.7, "Risk assets"), rel("DXY", -1, 0.55, "US dollar"), rel("ETH/USD", 1, 0.6, "Ethereum")],
  }),
  asset({
    symbol: "ETH/USD", name: "Ethereum", assetClass: "crypto", group: "Crypto",
    precision: 2, demoPrice: 3145.8, demoVol: 0.52, demoBias: 0.3,
    macroBetas: { riskAppetite: 0.85, realYields: -0.6, dollar: -0.45, rates: -0.6 },
    newsBetas: { "crypto-adoption": 0.9, "regulation-crypto": 0.85, "risk-sentiment": 0.8, "rates-hawkish": -0.7 },
    eventTags: ["fed", "crypto"],
    related: [rel("BTC/USD", 1, 1, "Bitcoin"), rel("NDX", 1, 0.55, "Risk assets")],
  }),
  asset({
    symbol: "SOL/USD", name: "Solana", assetClass: "crypto", group: "Crypto",
    precision: 2, demoPrice: 148.6, demoVol: 0.75, demoBias: 0.6,
    macroBetas: { riskAppetite: 0.95, rates: -0.7, realYields: -0.6 },
    newsBetas: { "crypto-adoption": 0.95, "risk-sentiment": 0.9, "regulation-crypto": 0.8, "rates-hawkish": -0.7 },
    eventTags: ["crypto", "fed"],
    related: [rel("BTC/USD", 1, 0.9, "Bitcoin"), rel("ETH/USD", 1, 0.8, "Ethereum")],
  }),
  asset({
    symbol: "XRP/USD", name: "XRP", assetClass: "crypto", group: "Crypto",
    precision: 4, demoPrice: 0.5284, demoVol: 0.7, demoBias: -0.15,
    macroBetas: { riskAppetite: 0.8, rates: -0.55 },
    newsBetas: { "regulation-crypto": 0.95, "crypto-adoption": 0.7, "risk-sentiment": 0.7 },
    eventTags: ["crypto"],
    related: [rel("BTC/USD", 1, 0.85, "Bitcoin")],
  }),
  asset({
    symbol: "BNB/USD", name: "BNB", assetClass: "crypto", group: "Crypto",
    precision: 2, demoPrice: 574.2, demoVol: 0.6, demoBias: 0.25,
    macroBetas: { riskAppetite: 0.85, rates: -0.5 },
    newsBetas: { "crypto-adoption": 0.8, "regulation-crypto": 0.85, "risk-sentiment": 0.75 },
    eventTags: ["crypto"],
    related: [rel("BTC/USD", 1, 0.85, "Bitcoin")],
  }),
  asset({
    symbol: "ADA/USD", name: "Cardano", assetClass: "crypto", group: "Crypto",
    precision: 4, demoPrice: 0.4612, demoVol: 0.68, demoBias: -0.2,
    macroBetas: { riskAppetite: 0.85, rates: -0.5 },
    newsBetas: { "crypto-adoption": 0.85, "risk-sentiment": 0.75, "regulation-crypto": 0.6 },
    eventTags: ["crypto"],
    related: [rel("BTC/USD", 1, 0.85, "Bitcoin"), rel("ETH/USD", 1, 0.6, "Ethereum")],
  }),

  /* --------------------------------- STOCKS -------------------------------- */
  asset({
    symbol: "AAPL", name: "Apple Inc.", assetClass: "stock", group: "Stocks", sector: "Technology",
    precision: 2, demoPrice: 189.42, demoVol: 0.24, demoBias: 0.18,
    macroBetas: { riskAppetite: 0.8, realYields: -0.5, rates: -0.5, growth: 0.5 },
    newsBetas: { "earnings-tech": 0.9, "rates-hawkish": -0.5, "risk-sentiment": 0.7, "china-growth": 0.4 },
    eventTags: [...US_EVENTS, "earnings"],
    related: [rel("NDX", 1, 0.9, "Nasdaq 100"), rel("SPX", 1, 0.7, "S&P 500")],
  }),
  asset({
    symbol: "NVDA", name: "NVIDIA Corporation", assetClass: "stock", group: "Stocks", sector: "Semiconductors",
    precision: 2, demoPrice: 878.6, demoVol: 0.48, demoBias: 0.8,
    macroBetas: { riskAppetite: 0.95, realYields: -0.6, rates: -0.6, growth: 0.7 },
    newsBetas: { semis: 0.95, "earnings-tech": 0.9, "risk-sentiment": 0.8, "rates-hawkish": -0.55, geopolitics: -0.4 },
    eventTags: [...US_EVENTS, "earnings", "geopolitics"],
    related: [rel("NDX", 1, 0.95, "Nasdaq 100"), rel("AMD", 1, 0.7, "Semiconductor peers")],
  }),
  asset({
    symbol: "MSFT", name: "Microsoft Corporation", assetClass: "stock", group: "Stocks", sector: "Technology",
    precision: 2, demoPrice: 421.3, demoVol: 0.23, demoBias: 0.45,
    macroBetas: { riskAppetite: 0.85, realYields: -0.55, rates: -0.5, growth: 0.55 },
    newsBetas: { "earnings-tech": 0.9, "risk-sentiment": 0.75, "rates-hawkish": -0.5 },
    eventTags: [...US_EVENTS, "earnings"],
    related: [rel("NDX", 1, 0.92, "Nasdaq 100")],
  }),
  asset({
    symbol: "AMZN", name: "Amazon.com, Inc.", assetClass: "stock", group: "Stocks", sector: "Consumer Discretionary",
    precision: 2, demoPrice: 182.4, demoVol: 0.3, demoBias: 0.36,
    macroBetas: { riskAppetite: 0.9, realYields: -0.65, growth: 0.7, rates: -0.6 },
    newsBetas: { "earnings-tech": 0.8, "growth-strong": 0.6, "risk-sentiment": 0.8, "rates-hawkish": -0.6 },
    eventTags: [...US_EVENTS, "earnings"],
    related: [rel("NDX", 1, 0.85, "Nasdaq 100"), rel("RUT", 1, 0.3, "Consumer cyclicality")],
  }),
  asset({
    symbol: "META", name: "Meta Platforms, Inc.", assetClass: "stock", group: "Stocks", sector: "Communication Services",
    precision: 2, demoPrice: 489.7, demoVol: 0.35, demoBias: 0.4,
    macroBetas: { riskAppetite: 0.9, realYields: -0.6, growth: 0.55, rates: -0.55 },
    newsBetas: { "earnings-tech": 0.85, "risk-sentiment": 0.75, "rates-hawkish": -0.55 },
    eventTags: [...US_EVENTS, "earnings"],
    related: [rel("NDX", 1, 0.85, "Nasdaq 100")],
  }),
  asset({
    symbol: "TSLA", name: "Tesla, Inc.", assetClass: "stock", group: "Stocks", sector: "Consumer Discretionary",
    precision: 2, demoPrice: 172.6, demoVol: 0.55, demoBias: -0.45,
    macroBetas: { riskAppetite: 0.95, realYields: -0.75, rates: -0.8, growth: 0.6 },
    newsBetas: { "earnings-tech": 0.7, "risk-sentiment": 0.85, "rates-hawkish": -0.75, "china-growth": 0.5 },
    eventTags: [...US_EVENTS, "earnings", "china"],
    related: [rel("NDX", 1, 0.7, "Nasdaq 100"), rel("US02Y", -1, 0.4, "Front-end rates")],
  }),
  asset({
    symbol: "GOOGL", name: "Alphabet Inc.", assetClass: "stock", group: "Stocks", sector: "Communication Services",
    precision: 2, demoPrice: 165.2, demoVol: 0.26, demoBias: 0.34,
    macroBetas: { riskAppetite: 0.85, realYields: -0.55, growth: 0.55, rates: -0.5 },
    newsBetas: { "earnings-tech": 0.85, "risk-sentiment": 0.75, "rates-hawkish": -0.5 },
    eventTags: [...US_EVENTS, "earnings"],
    related: [rel("NDX", 1, 0.88, "Nasdaq 100")],
  }),
  asset({
    symbol: "AMD", name: "Advanced Micro Devices", assetClass: "stock", group: "Stocks", sector: "Semiconductors",
    precision: 2, demoPrice: 162.8, demoVol: 0.5, demoBias: 0.28,
    macroBetas: { riskAppetite: 0.95, realYields: -0.65, rates: -0.65, growth: 0.6 },
    newsBetas: { semis: 0.95, "earnings-tech": 0.8, "risk-sentiment": 0.8, "rates-hawkish": -0.6 },
    eventTags: [...US_EVENTS, "earnings"],
    related: [rel("NVDA", 1, 0.85, "Semiconductor leadership"), rel("NDX", 1, 0.8, "Nasdaq 100")],
  }),
  asset({
    symbol: "JPM", name: "JPMorgan Chase & Co.", assetClass: "stock", group: "Stocks", sector: "Financials",
    precision: 2, demoPrice: 198.4, demoVol: 0.22, demoBias: 0.3,
    macroBetas: { riskAppetite: 0.7, rates: 0.5, growth: 0.7, realYields: 0.25 },
    newsBetas: { "rates-hawkish": 0.35, "growth-strong": 0.75, "risk-sentiment": 0.7, "earnings-generic": 0.8 },
    eventTags: [...US_EVENTS, "earnings"],
    related: [rel("US10Y", 1, 0.5, "Yield curve"), rel("SPX", 1, 0.8, "S&P 500")],
  }),
  asset({
    symbol: "XOM", name: "Exxon Mobil Corporation", assetClass: "stock", group: "Stocks", sector: "Energy",
    precision: 2, demoPrice: 118.6, demoVol: 0.25, demoBias: 0.36,
    macroBetas: { riskAppetite: 0.4, inflation: 0.6, growth: 0.5 },
    newsBetas: { "oil-supply": 0.9, geopolitics: 0.45, "earnings-generic": 0.6, "growth-strong": 0.4 },
    eventTags: ["oil", "geopolitics", "earnings"],
    related: [rel("WTI", 1, 0.9, "Crude oil"), rel("SPX", 1, 0.4, "S&P 500")],
  }),

  /* ---------------------------------- ETFs --------------------------------- */
  asset({
    symbol: "SPY", name: "SPDR S&P 500 ETF Trust", assetClass: "etf", group: "ETFs",
    precision: 2, demoPrice: 520.1, demoVol: 0.13, demoBias: 0.5,
    macroBetas: { riskAppetite: 1, realYields: -0.55, growth: 0.7, rates: -0.5 },
    newsBetas: { "risk-sentiment": 0.9, "rates-hawkish": -0.7, "growth-strong": 0.55 },
    eventTags: US_EVENTS,
    related: [rel("SPX", 1, 1, "S&P 500"), rel("VIX", -1, 0.85, "Volatility index")],
  }),
  asset({
    symbol: "QQQ", name: "Invesco QQQ Trust", assetClass: "etf", group: "ETFs",
    precision: 2, demoPrice: 444.6, demoVol: 0.18, demoBias: 0.66,
    macroBetas: { riskAppetite: 1, realYields: -0.85, rates: -0.8, growth: 0.6 },
    newsBetas: { "risk-sentiment": 0.9, "earnings-tech": 0.85, semis: 0.7, "rates-hawkish": -0.85 },
    eventTags: US_EVENTS,
    related: [rel("NDX", 1, 1, "Nasdaq 100")],
  }),
  asset({
    symbol: "GLD", name: "SPDR Gold Shares", assetClass: "etf", group: "ETFs",
    precision: 2, demoPrice: 216.4, demoVol: 0.14, demoBias: 0.54,
    macroBetas: { dollar: -0.85, realYields: -0.9, rates: -0.6, inflation: 0.4, riskAppetite: -0.3 },
    newsBetas: { "gold-demand": 0.9, geopolitics: 0.8, "rates-hawkish": -0.8, dollar: -0.85 },
    eventTags: ["fed", "us-inflation", "geopolitics"],
    related: [rel("XAU/USD", 1, 1, "Spot gold")],
  }),
  asset({
    symbol: "TLT", name: "iShares 20+ Year Treasury Bond ETF", assetClass: "etf", group: "ETFs",
    precision: 2, demoPrice: 92.4, demoVol: 0.16, demoBias: -0.35,
    macroBetas: { realYields: -0.95, rates: -0.9, inflation: -0.7, growth: -0.5, riskAppetite: -0.25 },
    newsBetas: { "rates-hawkish": -0.9, "inflation-hot": -0.8, "growth-strong": -0.6, geopolitics: 0.4 },
    eventTags: US_EVENTS,
    related: [rel("US10Y", -1, 1, "10Y yield"), rel("XAU/USD", 1, 0.3, "Duration proxy")],
  }),

  /* ------------------------------- COMMODITIES ----------------------------- */
  asset({
    symbol: "WTI", name: "Crude Oil (WTI)", assetClass: "commodity", group: "Commodities",
    precision: 2, demoPrice: 81.6, demoVol: 0.32, demoBias: 0.22,
    macroBetas: { growth: 0.75, inflation: 0.6, dollar: -0.4, riskAppetite: 0.35 },
    newsBetas: { "oil-supply": 0.95, geopolitics: 0.7, "china-growth": 0.6, "growth-strong": 0.5, dollar: -0.4 },
    eventTags: ["oil", "geopolitics", "china", "us-growth"],
    related: [rel("BRENT", 1, 1, "Brent crude"), rel("XOM", 1, 0.5, "Energy equities"), rel("DXY", -1, 0.4, "US dollar")],
  }),
  asset({
    symbol: "BRENT", name: "Crude Oil (Brent)", assetClass: "commodity", group: "Commodities",
    precision: 2, demoPrice: 85.9, demoVol: 0.31, demoBias: 0.24,
    macroBetas: { growth: 0.75, inflation: 0.6, dollar: -0.4, riskAppetite: 0.35 },
    newsBetas: { "oil-supply": 0.95, geopolitics: 0.75, "china-growth": 0.55, dollar: -0.4 },
    eventTags: ["oil", "geopolitics", "china"],
    related: [rel("WTI", 1, 1, "WTI crude")],
  }),
  asset({
    symbol: "NATGAS", name: "Natural Gas", assetClass: "commodity", group: "Commodities",
    precision: 3, demoPrice: 2.184, demoVol: 0.7, demoBias: -0.4,
    macroBetas: { growth: 0.4, inflation: 0.5 },
    newsBetas: { "oil-supply": 0.5, geopolitics: 0.55, "energy-demand": 0.9 },
    eventTags: ["oil", "geopolitics"],
    related: [rel("WTI", 1, 0.4, "Energy complex")],
  }),
  asset({
    symbol: "COPPER", name: "Copper", assetClass: "commodity", group: "Commodities",
    precision: 4, demoPrice: 4.4128, demoVol: 0.26, demoBias: 0.38,
    macroBetas: { growth: 0.9, dollar: -0.5, inflation: 0.4, riskAppetite: 0.5 },
    newsBetas: { "china-growth": 0.9, "growth-strong": 0.7, dollar: -0.5, "risk-sentiment": 0.5 },
    eventTags: ["china", "us-growth"],
    related: [rel("HSI", 1, 0.5, "China demand"), rel("AUD/USD", 1, 0.55, "Commodity FX"), rel("XAG/USD", 1, 0.4, "Silver")],
  }),

  /* ----------------------------- BONDS / RATES ----------------------------- */
  asset({
    symbol: "US10Y", name: "US 10-Year Treasury Yield", assetClass: "bond", group: "Bonds & Rates",
    precision: 3, demoPrice: 4.312, demoVol: 0.2, demoBias: -0.2,
    macroBetas: { rates: 0.9, inflation: 0.75, growth: 0.7, realYields: 0.95, riskAppetite: 0.3 },
    newsBetas: { "rates-hawkish": 0.9, "inflation-hot": 0.8, "growth-strong": 0.7, geopolitics: -0.4 },
    eventTags: US_EVENTS,
    related: [rel("US02Y", 1, 0.9, "2Y yield"), rel("TLT", -1, 1, "Long bond ETF"), rel("DXY", 1, 0.5, "US dollar")],
  }),
  asset({
    symbol: "US02Y", name: "US 2-Year Treasury Yield", assetClass: "bond", group: "Bonds & Rates",
    precision: 3, demoPrice: 4.684, demoVol: 0.18, demoBias: -0.28,
    macroBetas: { rates: 1, inflation: 0.6, growth: 0.5, realYields: 0.8 },
    newsBetas: { "rates-hawkish": 0.95, "inflation-hot": 0.7, "growth-strong": 0.6 },
    eventTags: US_EVENTS,
    related: [rel("US10Y", 1, 0.9, "10Y yield"), rel("DXY", 1, 0.5, "US dollar")],
  }),

  /* ------------------------- MACRO REFERENCE MARKETS ----------------------- */
  asset({
    symbol: "DXY", name: "US Dollar Index", assetClass: "index", group: "Macro Reference",
    precision: 3, demoPrice: 104.28, demoVol: 0.06, demoBias: -0.18,
    macroBetas: { dollar: 1, rates: 0.7, realYields: 0.7, growth: 0.4 },
    newsBetas: { "rates-hawkish": 0.85, dollar: 1, "growth-strong": 0.5, geopolitics: 0.3 },
    eventTags: US_EVENTS,
    related: [rel("EUR/USD", -1, 0.9, "Euro (largest weight)"), rel("US10Y", 1, 0.6, "US yields"), rel("XAU/USD", -1, 0.5, "Gold")],
  }),
  asset({
    symbol: "VIX", name: "CBOE Volatility Index", assetClass: "index", group: "Macro Reference",
    precision: 2, demoPrice: 14.62, demoVol: 0.8, demoBias: -0.3,
    macroBetas: { riskAppetite: -1, growth: -0.5 },
    newsBetas: { "risk-sentiment": -0.9, geopolitics: 0.8, "rates-hawkish": 0.4 },
    eventTags: [...US_EVENTS, "geopolitics"],
    related: [rel("SPX", -1, 1, "S&P 500")],
  }),
];

export const ASSET_MAP: Map<string, Asset> = new Map(ASSETS.map((a) => [a.symbol, a]));

/**
 * Separator-free lookup: "EURUSD", "eur usd" and "eur-usd" all reach EUR/USD.
 * Nobody should have to type a slash on a phone keyboard to find a pair.
 */
const ALIAS_MAP: Map<string, Asset> = new Map(ASSETS.map((a) => [normalizeSymbol(a.symbol), a]));

export const GROUPS: string[] = Array.from(new Set(ASSETS.map((a) => a.group)));

/** Assets available on the Free tier — enough to demonstrate the product. */
export const FREE_TIER_SYMBOLS = [
  "EUR/USD", "GBP/USD", "USD/JPY", "XAU/USD", "XAG/USD", "SPX",
  "NDX", "BTC/USD", "ETH/USD", "WTI", "AAPL", "NVDA",
];

export function getAsset(symbol: string): Asset | undefined {
  return ASSET_MAP.get(symbol.toUpperCase()) ?? ALIAS_MAP.get(normalizeSymbol(symbol));
}

/**
 * Stocks are searchable beyond the curated list. If an unknown ticker is
 * requested we synthesise a definition with sensible equity defaults so the
 * engine can still analyse it — clearly flagged as demo-generated.
 */
export function resolveAsset(symbol: string): Asset | undefined {
  const upper = symbol.toUpperCase();
  const known = getAsset(upper);
  if (known) return known;
  if (!/^[A-Z]{1,5}$/.test(upper)) return undefined;
  const seed = Array.from(upper).reduce((a, c) => a + c.charCodeAt(0), 0);
  return asset({
    symbol: upper,
    name: `${upper} (searched ticker)`,
    assetClass: "stock",
    group: "Stocks",
    sector: "Unclassified",
    precision: 2,
    demoPrice: 40 + (seed % 260),
    demoVol: 0.22 + ((seed % 17) / 100),
    demoBias: ((seed % 21) - 10) / 20,
    macroBetas: { riskAppetite: 0.8, realYields: -0.5, growth: 0.55, rates: -0.45 },
    newsBetas: { "risk-sentiment": 0.7, "earnings-generic": 0.7, "rates-hawkish": -0.45, "growth-strong": 0.5 },
    eventTags: [...US_EVENTS, "earnings"],
    related: [rel("SPX", 1, 0.8, "S&P 500"), rel("VIX", -1, 0.4, "Volatility index")],
  });
}

export function assetsByClass(cls: AssetClass): Asset[] {
  return ASSETS.filter((a) => a.assetClass === cls);
}

export function searchAssets(query: string, limit = 20): Asset[] {
  if (!query.trim()) return ASSETS.slice(0, limit);
  return ASSETS.filter((a) => symbolMatches(query, a.symbol, a.name, a.group)).slice(0, limit);
}

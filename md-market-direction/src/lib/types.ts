/**
 * MD MARKET DIRECTION — shared domain types.
 *
 * Everything the UI renders is derived from these structures. The golden rule of
 * the product is transparency: no score exists without the evidence that produced it,
 * so every scored object carries its own `evidence` trail.
 */

export type AssetClass =
  | "forex"
  | "metal"
  | "index"
  | "crypto"
  | "stock"
  | "etf"
  | "commodity"
  | "bond";

export type Timeframe = "5M" | "15M" | "1H" | "4H" | "1D" | "1W";

export type TradingMode = "scalper" | "day" | "swing" | "md-momentum";

/**
 * Which timeframes are allowed to define the trend. "htf" limits trend,
 * structure, momentum and conflict detection to the weekly, daily and 4H;
 * "all" folds in the entry charts as well.
 */
export type TrendScope = "htf" | "all";

export type Direction = "bullish" | "bearish" | "neutral" | "mixed";

export type Impact = "low" | "medium" | "high";

export type EvidenceQuality = "high" | "medium" | "low";

export interface Candle {
  /** epoch ms of the bar open */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface Asset {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  /** Display group used by the Markets page. */
  group: string;
  /** Decimal places used for price display. */
  precision: number;
  /** Optional sector, for stocks. */
  sector?: string;
  /** Symbols whose direction is used as cross-market confirmation. */
  related: CrossMarketLink[];
  /** How the asset historically responds to macro factors. Range roughly -1..1. */
  macroBetas: MacroBetas;
  /** Themes in the news graph this asset reacts to, with a signed multiplier. */
  newsBetas: Record<string, number>;
  /** Economic-event categories that create event risk for this asset. */
  eventTags: string[];
  /** Currencies involved (forex + macro linkage). */
  currencies?: string[];
  /** Base price used by the demo data generator. */
  demoPrice: number;
  /** Annualised volatility used by the demo data generator. */
  demoVol: number;
  /** Long-run drift bias used by the demo data generator (-1..1). */
  demoBias: number;
}

export interface CrossMarketLink {
  symbol: string;
  /** +1 = moves with this asset, -1 = moves against it. */
  sign: 1 | -1;
  /** Relative importance of the relationship, 0..1. */
  weight: number;
  label: string;
}

export interface MacroBetas {
  /** Sensitivity to US dollar strength. */
  dollar: number;
  /** Sensitivity to real yields. */
  realYields: number;
  /** Sensitivity to risk appetite (equity-like behaviour). */
  riskAppetite: number;
  /** Sensitivity to inflation surprises. */
  inflation: number;
  /** Sensitivity to growth surprises. */
  growth: number;
  /** Sensitivity to policy rate expectations (hawkish = positive factor). */
  rates: number;
}

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
  prevClose: number;
  volume: number;
  /** epoch ms */
  timestamp: number;
  source: string;
  /** true when the value is generated demo data rather than a live feed */
  demo: boolean;
}

export interface NewsArticle {
  id: string;
  headline: string;
  source: string;
  url?: string;
  publishedAt: number;
  /** Theme key used by the news → market mapping engine. */
  theme: string;
  category: NewsCategory;
  /** Raw sentiment of the event itself, -1..1 (before asset mapping). */
  sentiment: number;
  impact: Impact;
  /** Symbols explicitly named in the article. */
  symbols: string[];
  summary: string;
  demo: boolean;
}

export type NewsCategory =
  | "markets"
  | "forex"
  | "stocks"
  | "crypto"
  | "commodities"
  | "macro"
  | "central-banks"
  | "geopolitics";

export interface EconomicEvent {
  id: string;
  name: string;
  country: string;
  currency: string;
  /** epoch ms */
  time: number;
  importance: Impact;
  actual?: string | null;
  forecast?: string | null;
  previous?: string | null;
  /** Category tags matched against Asset.eventTags. */
  tags: string[];
  demo: boolean;
}

export interface MacroSnapshot {
  asOf: number;
  /** Positive = hawkish policy expectations. -1..1 */
  policyStance: number;
  /** Positive = inflation running hot / surprising higher. -1..1 */
  inflation: number;
  /** Positive = growth surprising higher. -1..1 */
  growth: number;
  /** Positive = dollar strength. -1..1 */
  dollar: number;
  /** Positive = real yields rising. -1..1 */
  realYields: number;
  /** Positive = risk-on. -1..1 */
  riskAppetite: number;
  readings: MacroReading[];
  demo: boolean;
}

export interface MacroReading {
  label: string;
  value: string;
  detail: string;
  /** -1..1 */
  tone: number;
}

/* ------------------------------------------------------------------ */
/* Analysis output                                                      */
/* ------------------------------------------------------------------ */

export interface EvidenceItem {
  label: string;
  detail: string;
  /** Signed contribution of this single observation, -1..1. */
  impact: number;
}

export interface CategoryResult {
  key: CategoryKey;
  label: string;
  /** Normalised signed strength, -1 (max bearish) .. +1 (max bullish). */
  strength: number;
  /** Weight in percent of the final score. */
  weight: number;
  /** Signed points contributed: strength * weight. */
  points: number;
  /** Bar fill 0..1 for the evidence breakdown display. */
  fill: number;
  /** false when the underlying data was unavailable. */
  available: boolean;
  evidence: EvidenceItem[];
  summary: string;
}

export type CategoryKey =
  | "technical"
  | "structure"
  | "momentum"
  | "news"
  | "macro"
  | "crossMarket"
  | "eventRisk";

export interface TimeframeTechnical {
  timeframe: Timeframe;
  price: number;
  ma50: number | null;
  ma200: number | null;
  priceVsMa50: "above" | "below" | null;
  priceVsMa200: "above" | "below" | null;
  ma50Slope: "rising" | "falling" | "flat" | null;
  ma200Slope: "rising" | "falling" | "flat" | null;
  trend: Direction;
  /** -1..1 */
  strength: number;
  atr: number | null;
  atrPct: number | null;
  volatility: "low" | "normal" | "elevated" | "high";
}

export interface TimeframeStructure {
  timeframe: Timeframe;
  bias: Direction;
  higherHigh: boolean;
  higherLow: boolean;
  lowerHigh: boolean;
  lowerLow: boolean;
  breakOfStructure: "bullish" | "bearish" | null;
  changeOfCharacter: "bullish" | "bearish" | null;
  state: "trend-continuation" | "consolidation" | "potential-reversal" | "undefined";
  lastSwingHigh: number | null;
  lastSwingLow: number | null;
  /** -1..1 */
  strength: number;
}

export interface TimeframeMomentum {
  timeframe: Timeframe;
  rsi: number | null;
  macdHist: number | null;
  macdState: "bullish" | "bearish" | "flat" | null;
  roc: number | null;
  volumeVsAvg: number | null;
  /** -1..1 */
  strength: number;
}

export interface SwingPoint {
  index: number;
  t: number;
  price: number;
  kind: "high" | "low";
}

export interface NewsRelevance {
  article: NewsArticle;
  /** Relevance to this asset, 0..1 */
  relevance: number;
  /** Directional effect on THIS asset, -1..1 (theme sentiment × relationship). */
  assetSentiment: number;
  /** Plain-english reason the article matters to the asset. */
  reason: string;
}

export interface EventRiskResult {
  nextEvent: EconomicEvent | null;
  hoursUntil: number | null;
  risk: Impact | "none";
  /** 0..1, how much conviction should be dampened. */
  dampening: number;
  upcoming: EconomicEvent[];
}

export interface ConflictReport {
  /** True only when the disagreement is material enough to call the market mixed. */
  conflicted: boolean;
  /**
   * 0..1 — the share of the mode's decided timeframe weight sitting on the
   * minority side, doubled so that an even split reads 1. A single junior
   * timeframe pulling back inside a trend scores low here; a weekly-versus-daily
   * split scores high.
   */
  dissent: number;
  /** 0..1 — how much conviction this disagreement removes. */
  dampening: number;
  higherTimeframe: Direction;
  lowerTimeframe: Direction;
  message: string | null;
}

export interface MdScore {
  /** 0..100 */
  score: number;
  direction: Direction;
  label: string;
  categories: CategoryResult[];
  /** Sum of signed points before clamping. */
  rawPoints: number;
  evidenceQuality: EvidenceQuality;
  evidenceQualityReasons: string[];
  conflict: ConflictReport;
}

export interface AssetAnalysis {
  asset: Asset;
  quote: Quote;
  mode: TradingMode;
  score: MdScore;
  technical: TimeframeTechnical[];
  structure: TimeframeStructure[];
  momentum: TimeframeMomentum[];
  news: NewsRelevance[];
  macro: MacroSnapshot;
  macroDrivers: EvidenceItem[];
  crossMarket: CrossMarketReading[];
  eventRisk: EventRiskResult;
  momentumScore: number;
  why: string;
  whatCouldChangeIt: string[];
  previous: { score: number; direction: Direction } | null;
  change: DirectionChange | null;
  /** epoch ms the analysis was produced. */
  generatedAt: number;
  demo: boolean;
}

export interface CrossMarketReading {
  symbol: string;
  name: string;
  label: string;
  sign: 1 | -1;
  /** Directional bias of the related market, -1..1 */
  relatedBias: number;
  /** Signed confirmation contributed to this asset, -1..1 */
  confirmation: number;
}

export interface DirectionChange {
  kind: "shift" | "strengthening" | "weakening" | "stable";
  headline: string;
  delta: number;
  reasons: string[];
}

export type MarketRegime =
  | "RISK ON"
  | "RISK OFF"
  | "INFLATIONARY"
  | "DEFLATIONARY"
  | "TRENDING"
  | "RANGEBOUND"
  | "HIGH VOLATILITY"
  | "LOW VOLATILITY"
  | "MIXED";

export interface RegimeResult {
  primary: MarketRegime;
  secondary: MarketRegime[];
  explanation: string;
  metrics: { label: string; value: string }[];
}

export interface GlobalDirection {
  direction: Direction;
  score: number;
  label: string;
  groups: { group: string; direction: Direction; score: number; count: number }[];
  regime: RegimeResult;
  generatedAt: number;
}

export interface ScannerRow {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  group: string;
  price: number;
  changePct: number;
  score: number;
  direction: Direction;
  ma50: "above" | "below" | null;
  structure: Direction;
  momentum: "strong" | "moderate" | "weak";
  news: Direction;
  eventRisk: Impact | "none";
  evidenceQuality: EvidenceQuality;
  updatedAt: number;
  /** false when this specific market came from a live feed. */
  demo: boolean;
}

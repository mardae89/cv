import type { PickupType } from "../types";
import { EMPTY_EXTRACTION, type ExtractField, type OfferExtraction } from "./types";

/**
 * The shape every model-backed reader asks for, and the one place a reply is
 * turned into an extraction. A value that isn't a clean number or boolean
 * becomes null rather than a guess.
 */

export const OFFER_PROMPT = [
  "You are reading one screenshot of a Walmart Spark delivery offer, taken by the driver.",
  "Report only what is visibly printed in the image.",
  "",
  "Reply with only a JSON object of exactly this shape:",
  '{"payout": number|null, "offerMiles": number|null, "estimatedMinutes": number|null,',
  ' "orders": number|null, "stops": number|null, "items": number|null,',
  ' "pickupType": "Walmart"|"Sam\'s Club"|null, "storeLabel": string|null,',
  ' "shopping": boolean|null, "heavyItems": boolean|null,',
  ' "confidence": {"payout": number, "offerMiles": number, "estimatedMinutes": number}}',
  "",
  "Rules:",
  "- Use null for any field not clearly legible. Never infer, estimate or fill in a missing value.",
  "- payout is the total the offer pays, in dollars, as a number.",
  "- offerMiles is the mileage printed on the offer. Do NOT report the driver's distance to the store; that is not on the offer.",
  "- estimatedMinutes is the offer's estimated time in whole minutes (convert '1 hr 5 min' to 65).",
  "- shopping is true only if the offer is marked shop-and-deliver; heavyItems only if heavy, bulky or oversized is indicated.",
  "- storeLabel is the store name with its number if one is shown, e.g. 'Walmart #1234'.",
  "- confidence values run 0 to 1 and say how clearly you could read that field. Use 0 for a field you returned as null.",
  "",
  'Example: {"payout": 34.72, "offerMiles": 13.4, "estimatedMinutes": 52, "orders": 2, "stops": 2, "items": 36,',
  ' "pickupType": "Walmart", "storeLabel": "Walmart #1234", "shopping": false, "heavyItems": false,',
  ' "confidence": {"payout": 0.99, "offerMiles": 0.94, "estimatedMinutes": 0.91}}',
].join("\n");

export interface ReportedOffer {
  payout?: unknown;
  offerMiles?: unknown;
  estimatedMinutes?: unknown;
  orders?: unknown;
  stops?: unknown;
  items?: unknown;
  pickupType?: unknown;
  storeLabel?: unknown;
  shopping?: unknown;
  heavyItems?: unknown;
  confidence?: Record<string, unknown>;
}

const numberOrNull = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  // Models sometimes answer "34.72" or "$34.72" despite the schema. Strip the
  // decoration, but only accept what is genuinely a number — "n/a" must come
  // back null, not the zero that stripping it would leave behind.
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "").trim();
    if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const boolOrNull = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);

const confidenceFor = (raw: Record<string, unknown> | undefined, key: string, value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  const reported = numberOrNull(raw?.[key]);
  if (reported === null) return 0.9; // read but unscored — treat as confident
  return Math.min(Math.max(reported, 0), 1);
};

/** Normalise a model's reply into the extraction the rest of the app knows. */
export function extractionFromReport(reported: ReportedOffer, provider: OfferExtraction["provider"]): OfferExtraction {
  const payout = numberOrNull(reported.payout);
  const offerMiles = numberOrNull(reported.offerMiles);
  const estimatedMinutes = numberOrNull(reported.estimatedMinutes);
  const items = numberOrNull(reported.items);
  const pickupType: PickupType | null =
    reported.pickupType === "Walmart" || reported.pickupType === "Sam's Club" ? reported.pickupType : null;

  const confidence: Partial<Record<ExtractField, number>> = {};
  const set = (field: ExtractField, value: unknown, key = field) => {
    const c = confidenceFor(reported.confidence, key, value);
    if (c !== undefined) confidence[field] = c;
  };
  set("payout", payout);
  set("offerMiles", offerMiles);
  set("estimatedMinutes", estimatedMinutes);
  set("items", items);
  set("pickupType", pickupType);

  const notes: string[] = [];
  if (payout === null) notes.push("No payout was legible in the screenshot.");
  if (offerMiles === null) notes.push("No offer mileage was legible in the screenshot.");

  return {
    ...EMPTY_EXTRACTION,
    payout,
    offerMiles,
    estimatedMinutes,
    orders: numberOrNull(reported.orders),
    stops: numberOrNull(reported.stops),
    items,
    pickupType,
    storeLabel: typeof reported.storeLabel === "string" && reported.storeLabel.trim() ? reported.storeLabel.trim() : null,
    shopping: boolOrNull(reported.shopping),
    heavyItems: boolOrNull(reported.heavyItems),
    confidence,
    provider,
    rawText: null,
    notes,
  };
}

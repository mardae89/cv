import type { OfferDraft, PickupType, VisionProviderId } from "../types";

/**
 * Screenshot analysis contract.
 *
 * Every provider returns the same shape: a value per field, or `null` when the
 * value was not clearly visible. Providers never guess — an unread field comes
 * back null and the driver confirms it by hand.
 */

export type ExtractField =
  | "payout"
  | "offerMiles"
  | "estimatedMinutes"
  | "orders"
  | "stops"
  | "items"
  | "pickupType"
  | "shopping"
  | "heavyItems";

export interface OfferExtraction {
  payout: number | null;
  offerMiles: number | null;
  estimatedMinutes: number | null;
  orders: number | null;
  stops: number | null;
  items: number | null;
  pickupType: PickupType | null;
  storeLabel: string | null;
  shopping: boolean | null;
  heavyItems: boolean | null;
  /** 0–1 per field the provider actually read. Missing key = not read. */
  confidence: Partial<Record<ExtractField, number>>;
  provider: VisionProviderId;
  /** Raw text, kept in memory only so the driver can see what was read. */
  rawText: string | null;
  notes: string[];
}

export interface AnalyzeOptions {
  /** Progress ticks for the UI, 0–1 where the provider can report it. */
  onProgress?: (fraction: number, label: string) => void;
  signal?: AbortSignal;
  apiKey?: string;
}

export interface VisionProvider {
  id: VisionProviderId;
  label: string;
  description: string;
  /** Whether this provider can run right now (e.g. key present). */
  ready: (apiKey: string) => boolean;
  analyze: (image: Blob, options: AnalyzeOptions) => Promise<OfferExtraction>;
}

export const EMPTY_EXTRACTION: Omit<OfferExtraction, "provider"> = {
  payout: null,
  offerMiles: null,
  estimatedMinutes: null,
  orders: null,
  stops: null,
  items: null,
  pickupType: null,
  storeLabel: null,
  shopping: null,
  heavyItems: null,
  confidence: {},
  rawText: null,
  notes: [],
};

/** Fold an extraction into an editable draft, leaving unread fields blank. */
export function toDraft(extraction: OfferExtraction, fallbackPickup: PickupType): OfferDraft {
  return {
    payout: extraction.payout,
    offerMiles: extraction.offerMiles,
    estimatedMinutes: extraction.estimatedMinutes,
    orders: extraction.orders,
    stops: extraction.stops,
    items: extraction.items,
    pickupType: extraction.pickupType ?? fallbackPickup,
    storeLabel: extraction.storeLabel,
    shopping: extraction.shopping ?? false,
    heavyItems: extraction.heavyItems ?? false,
    pickupDistanceMiles: null,
  };
}

/** Fields the driver still has to confirm before the app will score anything. */
export function needsConfirmation(extraction: OfferExtraction): ExtractField[] {
  const low: ExtractField[] = [];
  const check = (field: ExtractField, value: unknown) => {
    const c = extraction.confidence[field];
    if (value === null || value === undefined || c === undefined || c < 0.75) low.push(field);
  };
  check("payout", extraction.payout);
  check("offerMiles", extraction.offerMiles);
  check("estimatedMinutes", extraction.estimatedMinutes);
  return low;
}

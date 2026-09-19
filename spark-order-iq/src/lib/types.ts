/** Shared domain types for Spark Order IQ. */

/** Where the driver picks the order up. Kept open-ended for future platforms. */
export type PickupType = "Walmart" | "Sam's Club";

export type OrderType = "Delivery" | "Shopping";

export type Decision = "TAKE" | "CONSIDER" | "SKIP";

/**
 * Everything the driver knows about an offer. Anything the app could not read
 * from a screenshot stays `null` until the driver fills it in — the app never
 * guesses a value it was not given.
 */
export interface OfferDraft {
  payout: number | null;
  offerMiles: number | null;
  estimatedMinutes: number | null;
  orders: number | null;
  stops: number | null;
  items: number | null;
  pickupType: PickupType;
  storeLabel: string | null;
  shopping: boolean;
  heavyItems: boolean;
  /** Driver's own distance to the pickup store. Never taken from Spark. */
  pickupDistanceMiles: number | null;
}

export interface RuleSetting {
  enabled: boolean;
  value: number;
}

export type RuleKey =
  | "minPayout"
  | "minPerMile"
  | "minHourly"
  | "maxTotalMiles"
  | "maxPickupDistance"
  | "maxItems"
  | "minProfit";

export type ScoreKey = "pay" | "distance" | "hourly" | "complexity" | "goal";

export type VisionProviderId = "auto" | "artifact-claude" | "local-ocr" | "claude-vision" | "manual";

/** A pickup location the driver saved themselves. Never imported from Spark. */
export interface SavedStore {
  id: string;
  label: string;
  type: PickupType;
  lat: number;
  lon: number;
}

export interface Settings {
  dailyGoal: number;
  weeklyGoal: number;
  vehicleCostPerMile: number;
  /** Minutes of driving assumed per mile of deadhead to the store. */
  pickupMinutesPerMile: number;
  /** Whether that deadhead time counts against the estimated hourly rate. */
  includePickupTimeInHourly: boolean;
  /** Hour of day (0–23) the driver typically stops, used for pace projection. */
  dayEndHour: number;
  /** A typical full day at the wheel. Caps how far a pace is projected. */
  typicalShiftHours: number;
  rules: Record<RuleKey, RuleSetting>;
  weights: Record<ScoreKey, number>;
  visionProvider: VisionProviderId;
  /** Optional, driver-supplied. Stored only on this device. */
  anthropicApiKey: string;
  /** Last store the driver picked, used to pre-fill the next analysis. */
  defaultPickupType: PickupType;
  keepScreenshots: boolean;
  savedStores: SavedStore[];
  reducedMotion: boolean;
}

export interface OrderRecord {
  id: string;
  /** ISO timestamp of when the order was logged. */
  completedAt: string;
  payout: number;
  /** Total estimated miles (offer + pickup) when known. */
  miles: number | null;
  minutes: number | null;
  store: PickupType;
  storeLabel: string | null;
  type: OrderType;
  /** What the app said about it, when the order came through an analysis. */
  decision: Decision | null;
  score: number | null;
  notes: string | null;
  /** Demo rows so the app is explorable before the first real order. */
  sample: boolean;
}

export interface DailyProgress {
  earned: number;
  goal: number;
  remaining: number;
  orders: number;
  miles: number;
  minutes: number;
  hourly: number | null;
  percent: number;
}

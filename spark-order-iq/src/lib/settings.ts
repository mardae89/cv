import type { RuleKey, Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  dailyGoal: 150,
  weeklyGoal: 750,
  vehicleCostPerMile: 0.7,
  pickupMinutesPerMile: 2.5,
  includePickupTimeInHourly: true,
  dayEndHour: 21,
  typicalShiftHours: 8,
  rules: {
    minPayout: { enabled: true, value: 25 },
    minPerMile: { enabled: true, value: 1.75 },
    minHourly: { enabled: true, value: 30 },
    maxTotalMiles: { enabled: true, value: 20 },
    maxPickupDistance: { enabled: true, value: 8 },
    maxItems: { enabled: false, value: 50 },
    minProfit: { enabled: true, value: 15 },
  },
  weights: { pay: 25, distance: 25, hourly: 25, complexity: 15, goal: 10 },
  visionProvider: "auto",
  anthropicApiKey: "",
  defaultPickupType: "Walmart",
  keepScreenshots: false,
  savedStores: [],
  reducedMotion: false,
};

export const RULE_META: Record<
  RuleKey,
  { label: string; help: string; unit: "money" | "perMile" | "hourly" | "miles" | "count"; step: number }
> = {
  minPayout: { label: "Minimum payout", help: "Skip offers that pay less than this.", unit: "money", step: 1 },
  minPerMile: { label: "Minimum $/mile", help: "Based on offer miles plus your drive to the store.", unit: "perMile", step: 0.05 },
  minHourly: { label: "Minimum est. hourly", help: "Uses the offer's estimated time.", unit: "hourly", step: 1 },
  maxTotalMiles: { label: "Maximum total miles", help: "Offer miles plus your distance to pickup.", unit: "miles", step: 1 },
  maxPickupDistance: { label: "Maximum pickup distance", help: "How far you'll deadhead to a store.", unit: "miles", step: 0.5 },
  maxItems: { label: "Maximum items", help: "Useful for shopping orders.", unit: "count", step: 5 },
  minProfit: { label: "Minimum est. profit", help: "Payout minus your estimated vehicle cost.", unit: "money", step: 1 },
};

export const GOAL_PRESETS = [100, 125, 150, 175, 200];

/** Merge stored settings over the defaults so new fields appear on upgrade. */
export function mergeSettings(stored: unknown): Settings {
  if (!stored || typeof stored !== "object") return { ...DEFAULT_SETTINGS };
  const raw = stored as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    rules: { ...DEFAULT_SETTINGS.rules, ...(raw.rules ?? {}) },
    savedStores: Array.isArray(raw.savedStores) ? raw.savedStores : [],
    weights: { ...DEFAULT_SETTINGS.weights, ...(raw.weights ?? {}) },
  };
}

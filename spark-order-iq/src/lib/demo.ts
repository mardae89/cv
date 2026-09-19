import { newId } from "./storage";
import type { OfferDraft, OrderRecord, PickupType } from "./types";

/**
 * Sample data so the app is explorable before the first real order.
 * Everything created here carries `sample: true` and is labelled in the UI.
 */

export interface SampleOffer {
  name: string;
  expectation: string;
  draft: OfferDraft;
}

export const SAMPLE_OFFERS: SampleOffer[] = [
  {
    name: "Two-order Walmart run",
    expectation: "Usually lands on TAKE with the default rules",
    draft: {
      payout: 38.72,
      offerMiles: 14.1,
      estimatedMinutes: 52,
      orders: 2,
      stops: 2,
      items: 36,
      pickupType: "Walmart",
      storeLabel: "Walmart #1234",
      shopping: false,
      heavyItems: false,
      pickupDistanceMiles: 4.8,
    },
  },
  {
    name: "Long, thin single",
    expectation: "Usually lands on SKIP with the default rules",
    draft: {
      payout: 18.42,
      offerMiles: 16.8,
      estimatedMinutes: 55,
      orders: 1,
      stops: 1,
      items: 12,
      pickupType: "Walmart",
      storeLabel: "Walmart #2207",
      shopping: false,
      heavyItems: false,
      pickupDistanceMiles: 6.1,
    },
  },
  {
    name: "Close Sam's Club shop",
    expectation: "Borderline — CONSIDER or TAKE depending on your rules",
    draft: {
      payout: 26.5,
      offerMiles: 10.2,
      estimatedMinutes: 48,
      orders: 1,
      stops: 1,
      items: 28,
      pickupType: "Sam's Club",
      storeLabel: "Sam's Club #6412",
      shopping: true,
      heavyItems: false,
      pickupDistanceMiles: 2.1,
    },
  },
];

interface Seed {
  dayOffset: number;
  hour: number;
  payout: number;
  miles: number;
  minutes: number;
  store: PickupType;
  storeLabel: string;
  type: OrderRecord["type"];
}

const SEEDS: Seed[] = [
  { dayOffset: 0, hour: 10, payout: 27.5, miles: 13.1, minutes: 48, store: "Sam's Club", storeLabel: "Sam's Club #6412", type: "Shopping" },
  { dayOffset: 0, hour: 11, payout: 19.4, miles: 9.8, minutes: 34, store: "Walmart", storeLabel: "Walmart #1234", type: "Delivery" },
  { dayOffset: 0, hour: 13, payout: 34.72, miles: 18.2, minutes: 52, store: "Walmart", storeLabel: "Walmart #1234", type: "Delivery" },
  { dayOffset: 1, hour: 9, payout: 31.2, miles: 15.4, minutes: 46, store: "Walmart", storeLabel: "Walmart #1234", type: "Delivery" },
  { dayOffset: 1, hour: 12, payout: 22.85, miles: 11.2, minutes: 38, store: "Walmart", storeLabel: "Walmart #2207", type: "Delivery" },
  { dayOffset: 1, hour: 15, payout: 41.6, miles: 21.7, minutes: 64, store: "Sam's Club", storeLabel: "Sam's Club #6412", type: "Shopping" },
  { dayOffset: 1, hour: 18, payout: 28.4, miles: 12.9, minutes: 41, store: "Walmart", storeLabel: "Walmart #1234", type: "Delivery" },
  { dayOffset: 2, hour: 10, payout: 36.15, miles: 17.3, minutes: 55, store: "Walmart", storeLabel: "Walmart #1234", type: "Shopping" },
  { dayOffset: 2, hour: 14, payout: 24.9, miles: 10.6, minutes: 36, store: "Walmart", storeLabel: "Walmart #2207", type: "Delivery" },
  { dayOffset: 2, hour: 17, payout: 30.05, miles: 14.8, minutes: 47, store: "Sam's Club", storeLabel: "Sam's Club #6412", type: "Delivery" },
  { dayOffset: 3, hour: 11, payout: 26.3, miles: 12.2, minutes: 40, store: "Walmart", storeLabel: "Walmart #1234", type: "Delivery" },
  { dayOffset: 3, hour: 16, payout: 33.8, miles: 16.1, minutes: 51, store: "Walmart", storeLabel: "Walmart #1234", type: "Shopping" },
  { dayOffset: 4, hour: 12, payout: 29.75, miles: 13.7, minutes: 44, store: "Sam's Club", storeLabel: "Sam's Club #6412", type: "Delivery" },
  { dayOffset: 4, hour: 19, payout: 38.4, miles: 19.5, minutes: 58, store: "Walmart", storeLabel: "Walmart #1234", type: "Delivery" },
  { dayOffset: 5, hour: 13, payout: 21.6, miles: 9.4, minutes: 33, store: "Walmart", storeLabel: "Walmart #2207", type: "Delivery" },
];

/** Build the sample history relative to today so the charts always look live. */
export function buildSampleOrders(now = new Date()): OrderRecord[] {
  return SEEDS.map((seed) => {
    const when = new Date(now);
    when.setDate(when.getDate() - seed.dayOffset);
    when.setHours(seed.hour, 15, 0, 0);
    // Never stamp a sample order in the future — today's seeds get pulled back.
    const stamped = when > now ? new Date(now.getTime() - seed.dayOffset * 60_000 - 5 * 60_000) : when;
    return {
      id: newId(),
      completedAt: stamped.toISOString(),
      payout: seed.payout,
      miles: seed.miles,
      minutes: seed.minutes,
      store: seed.store,
      storeLabel: seed.storeLabel,
      type: seed.type,
      decision: null,
      score: null,
      notes: null,
      sample: true,
    };
  });
}

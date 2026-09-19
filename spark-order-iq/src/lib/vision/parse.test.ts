import { describe, expect, it } from "vitest";
import { parseOfferText } from "./parse";

const SPARK_SCREEN = `
9:41
Offer
$34.72
Walmart Supercenter #1234
2 orders · 36 items
13.4 mi
Est. 52 min
Deliver by 5:45 PM
Accept
`;

describe("parseOfferText", () => {
  it("reads a clean Spark offer", () => {
    const parsed = parseOfferText(SPARK_SCREEN);
    expect(parsed.payout).toBe(34.72);
    expect(parsed.offerMiles).toBe(13.4);
    expect(parsed.estimatedMinutes).toBe(52);
    expect(parsed.orders).toBe(2);
    expect(parsed.items).toBe(36);
    expect(parsed.pickupType).toBe("Walmart");
    expect(parsed.storeLabel).toBe("Walmart #1234");
  });

  it("returns null rather than guessing at what isn't there", () => {
    const parsed = parseOfferText("Offer\nAccept\nDecline");
    expect(parsed.payout).toBeNull();
    expect(parsed.offerMiles).toBeNull();
    expect(parsed.estimatedMinutes).toBeNull();
    expect(parsed.items).toBeNull();
    expect(parsed.confidence.payout).toBeUndefined();
    expect(parsed.notes.length).toBeGreaterThan(0);
  });

  it("never reports the driver's pickup distance as an offer field", () => {
    const parsed = parseOfferText(SPARK_SCREEN);
    expect(parsed).not.toHaveProperty("pickupDistanceMiles");
  });

  it("picks the headline payout and lowers confidence when several are shown", () => {
    const parsed = parseOfferText("$28.50 trip\n$6.22 tip included\n11.2 mi\n40 min");
    expect(parsed.payout).toBe(28.5);
    expect(parsed.confidence.payout).toBeLessThan(0.95);
  });

  it("recovers a dollar sign that OCR read as an S", () => {
    const parsed = parseOfferText("S41.60\n12.2 miles\n44 min");
    expect(parsed.payout).toBe(41.6);
  });

  it("handles hour-and-minute durations", () => {
    expect(parseOfferText("$52.10\n24.5 mi\n1 hr 12 min").estimatedMinutes).toBe(72);
    expect(parseOfferText("$52.10\n24.5 mi\n2 hours").estimatedMinutes).toBe(120);
  });

  it("detects Sam's Club, shopping and heavy flags", () => {
    const parsed = parseOfferText("Sam's Club #6412\nShop & Deliver\nHeavy items\n$44.00\n9.1 mi\n58 min");
    expect(parsed.pickupType).toBe("Sam's Club");
    expect(parsed.storeLabel).toBe("Sam's Club #6412");
    expect(parsed.shopping).toBe(true);
    expect(parsed.heavyItems).toBe(true);
  });

  it("leaves flags null when nothing indicates them", () => {
    const parsed = parseOfferText("$20.00\n8.0 mi\n30 min");
    expect(parsed.shopping).toBeNull();
    expect(parsed.heavyItems).toBeNull();
  });

  it("ignores implausible values", () => {
    const parsed = parseOfferText("$0.00 promo\n999 mi\n4000 min");
    expect(parsed.payout).toBeNull();
    expect(parsed.estimatedMinutes).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { extractionFromReport } from "./extraction";

describe("extractionFromReport", () => {
  it("keeps a clean report as-is", () => {
    const e = extractionFromReport(
      {
        payout: 34.72,
        offerMiles: 13.4,
        estimatedMinutes: 52,
        orders: 2,
        stops: 2,
        items: 36,
        pickupType: "Walmart",
        storeLabel: "Walmart #1234",
        shopping: false,
        heavyItems: false,
        confidence: { payout: 0.99, offerMiles: 0.94, estimatedMinutes: 0.91 },
      },
      "artifact-claude",
    );
    expect(e.payout).toBe(34.72);
    expect(e.offerMiles).toBe(13.4);
    expect(e.shopping).toBe(false);
    expect(e.confidence.payout).toBeCloseTo(0.99, 5);
    expect(e.notes).toHaveLength(0);
  });

  it("passes nulls through instead of inventing values", () => {
    const e = extractionFromReport(
      { payout: null, offerMiles: null, estimatedMinutes: null, confidence: {} },
      "artifact-claude",
    );
    expect(e.payout).toBeNull();
    expect(e.offerMiles).toBeNull();
    expect(e.confidence.payout).toBeUndefined();
    expect(e.notes.length).toBe(2);
  });

  it("recovers a number a model wrote as a string", () => {
    const e = extractionFromReport({ payout: "$34.72", offerMiles: "13.4" }, "claude-vision");
    expect(e.payout).toBe(34.72);
    expect(e.offerMiles).toBe(13.4);
  });

  it("rejects junk rather than passing NaN into the scoring engine", () => {
    const e = extractionFromReport({ payout: "n/a", offerMiles: {}, items: true }, "claude-vision");
    expect(e.payout).toBeNull();
    expect(e.offerMiles).toBeNull();
    expect(e.items).toBeNull();
  });

  it("only accepts the two pickup types it knows", () => {
    expect(extractionFromReport({ pickupType: "Target" }, "claude-vision").pickupType).toBeNull();
    expect(extractionFromReport({ pickupType: "Sam's Club" }, "claude-vision").pickupType).toBe("Sam's Club");
  });

  it("clamps a confidence a model exaggerated", () => {
    const e = extractionFromReport({ payout: 20, confidence: { payout: 4 } }, "claude-vision");
    expect(e.confidence.payout).toBe(1);
  });

  it("treats a read field with no confidence score as confident", () => {
    const e = extractionFromReport({ payout: 20, offerMiles: 8 }, "claude-vision");
    expect(e.confidence.payout).toBe(0.9);
    expect(e.confidence.offerMiles).toBe(0.9);
  });

  it("never carries a screenshot or raw text forward", () => {
    const e = extractionFromReport({ payout: 20 }, "artifact-claude");
    expect(e.rawText).toBeNull();
  });
});

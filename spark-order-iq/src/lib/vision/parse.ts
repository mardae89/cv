import type { PickupType } from "../types";
import { EMPTY_EXTRACTION, type ExtractField, type OfferExtraction } from "./types";

/**
 * Turns OCR text from a Spark offer screenshot into structured fields.
 *
 * Rules of the house: a field only comes back with a value when the text
 * actually contained one, and confidence drops when the text was ambiguous.
 * Nothing is inferred from context the driver didn't provide.
 */

export type ParsedOffer = Omit<OfferExtraction, "provider">;

/** OCR mangles currency glyphs; normalise the usual suspects. */
function normalize(text: string): string {
  return text
    .replace(/ /g, " ")
    .replace(/[|¦]/g, " ")
    .replace(/[§S]\s?(\d{1,3}[.,]\d{2})\b/g, "$$$1")
    .replace(/(\d)[,](\d{2})\b/g, "$1.$2")
    .replace(/[ \t]+/g, " ");
}

function num(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function currencyCandidates(text: string): number[] {
  const out: number[] = [];
  const re = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/g;
  for (const m of text.matchAll(re)) {
    const n = num(m[1]);
    if (n !== null && n >= 1 && n <= 999) out.push(n);
  }
  return out;
}

function mileCandidates(text: string): number[] {
  const out: number[] = [];
  const re = /(\d{1,3}(?:\.\d{1,2})?)\s*(?:mi\b|mi\.|miles?\b)/gi;
  for (const m of text.matchAll(re)) {
    const n = num(m[1]);
    if (n !== null && n > 0 && n <= 300) out.push(n);
  }
  return out;
}

function minuteCandidates(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(\d{1,2})\s*(?:hr|hour)s?\s*(?:(\d{1,2})\s*min)?/gi)) {
    const h = num(m[1]);
    const mm = num(m[2]) ?? 0;
    if (h !== null && h <= 12) out.push(h * 60 + mm);
  }
  for (const m of text.matchAll(/(?<!\d\s?(?:hr|hour)s?\s)(\d{1,3})\s*(?:min\b|mins\b|minutes\b)/gi)) {
    const n = num(m[1]);
    if (n !== null && n >= 5 && n <= 600) out.push(n);
  }
  return out;
}

function countFor(text: string, re: RegExp, max: number): number | null {
  const m = text.match(re);
  const n = num(m?.[1]);
  return n !== null && n > 0 && n <= max ? n : null;
}

function detectPickup(text: string): { pickupType: PickupType | null; storeLabel: string | null } {
  const sams = /sam'?\s?s\s*club/i.test(text);
  const walmart = /wal\s?mart/i.test(text);
  const pickupType: PickupType | null = sams ? "Sam's Club" : walmart ? "Walmart" : null;
  if (!pickupType) return { pickupType: null, storeLabel: null };
  const number = text.match(/#\s?(\d{2,5})/);
  return { pickupType, storeLabel: number ? `${pickupType} #${number[1]}` : pickupType };
}

export function parseOfferText(rawText: string): ParsedOffer {
  const text = normalize(rawText);
  const confidence: Partial<Record<ExtractField, number>> = {};
  const notes: string[] = [];

  // --- payout -------------------------------------------------------------
  // Spark screenshots can show more than one dollar figure (trip pay, tip,
  // incentives). The headline offer is the largest of them.
  const money = currencyCandidates(text);
  let payout: number | null = null;
  if (money.length > 0) {
    const sorted = [...money].sort((a, b) => b - a);
    payout = sorted[0]!;
    const second = sorted[1];
    confidence.payout = money.length === 1 ? 0.95 : second !== undefined && payout - second > 1 ? 0.8 : 0.6;
    if (money.length > 1) notes.push(`Read ${money.length} dollar amounts — confirm the payout.`);
  }

  // --- miles --------------------------------------------------------------
  const miles = mileCandidates(text);
  let offerMiles: number | null = null;
  if (miles.length > 0) {
    offerMiles = Math.max(...miles);
    confidence.offerMiles = miles.length === 1 ? 0.9 : 0.62;
    if (miles.length > 1) notes.push("More than one mileage figure — confirm the offer miles.");
  }

  // --- time ---------------------------------------------------------------
  const mins = minuteCandidates(text);
  let estimatedMinutes: number | null = null;
  if (mins.length > 0) {
    estimatedMinutes = Math.max(...mins);
    confidence.estimatedMinutes = mins.length === 1 ? 0.88 : 0.6;
  }

  // --- counts -------------------------------------------------------------
  const items = countFor(text, /(\d{1,3})\s*items?\b/i, 400);
  if (items !== null) confidence.items = 0.85;
  const orders = countFor(text, /(\d{1,2})\s*orders?\b/i, 12);
  if (orders !== null) confidence.orders = 0.85;
  const stops = countFor(text, /(\d{1,2})\s*(?:stops?|drop[\s-]?offs?|deliveries)\b/i, 12);
  if (stops !== null) confidence.stops = 0.8;

  // --- flags --------------------------------------------------------------
  const shoppingHit = /\bshop(?:ping|&|\s?and\s?deliver)?\b|\bshop\s?&\s?deliver\b|\bpick\s?&\s?pack\b/i.test(text);
  const shopping = shoppingHit ? true : /\bdeliver(?:y)?\s?only\b|\bcurbside\b/i.test(text) ? false : null;
  if (shopping !== null) confidence.shopping = shoppingHit ? 0.8 : 0.7;

  const heavyHit = /\bheavy\b|\bbulky\b|\boversize\w*\b|\bfreight\b/i.test(text);
  const heavyItems = heavyHit ? true : null;
  if (heavyItems !== null) confidence.heavyItems = 0.75;

  const { pickupType, storeLabel } = detectPickup(text);
  if (pickupType) confidence.pickupType = 0.85;

  if (payout === null) notes.push("No payout found in the screenshot.");
  if (offerMiles === null) notes.push("No mileage found in the screenshot.");

  return {
    ...EMPTY_EXTRACTION,
    payout,
    offerMiles,
    estimatedMinutes,
    orders,
    stops,
    items,
    pickupType,
    storeLabel,
    shopping,
    heavyItems,
    confidence,
    rawText,
    notes,
  };
}

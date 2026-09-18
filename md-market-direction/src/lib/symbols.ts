/**
 * SEPARATOR-INSENSITIVE SYMBOL MATCHING.
 *
 * Traders type a pair four different ways — "eurusd", "EUR USD", "eur/usd",
 * "EUR-USD" — and mean the same market. Every lookup and every search box
 * reduces both sides to a bare alphanumeric key so all four find EUR/USD, and
 * nobody has to reach for the slash key on a phone keyboard.
 */

/** Uppercase and strip every separator: "eur/usd" and "eurusd" both -> "EURUSD". */
export function normalizeSymbol(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * True when `query` appears in any of `fields`, ignoring case and separators.
 * An empty query matches everything, so callers can pass the raw input box.
 */
export function symbolMatches(query: string, ...fields: string[]): boolean {
  const key = normalizeSymbol(query);
  if (!key) return true;
  return fields.some((f) => normalizeSymbol(f).includes(key));
}

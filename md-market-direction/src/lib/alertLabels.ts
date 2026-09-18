import type { Alert } from "@/lib/db/schema";

/** Pure, client-safe label helper shared by the alert engine and the UI. */
export function describeAlert(alert: Pick<Alert, "kind" | "symbol" | "threshold" | "direction">): string {
  switch (alert.kind) {
    case "score-above": return `${alert.symbol} MD Direction Score rises above ${alert.threshold}`;
    case "score-below": return `${alert.symbol} MD Direction Score falls below ${alert.threshold}`;
    case "direction-becomes": return `${alert.symbol} becomes ${alert.direction}`;
    case "direction-change": return `${alert.symbol} direction changes`;
    case "price-cross-ma50": return `${alert.symbol} price crosses the daily 50 EMA`;
    case "structure-change": return `${alert.symbol} daily market structure changes`;
    case "factors-aligned": return `${alert.threshold} or more factors align on ${alert.symbol}`;
    case "event-countdown": return `${alert.threshold}h before the next major event for ${alert.symbol}`;
    default: return alert.symbol;
  }
}

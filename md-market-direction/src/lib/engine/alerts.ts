import type { Alert } from "@/lib/db/schema";
import type { AssetAnalysis, EconomicEvent } from "@/lib/types";
import { store } from "@/lib/db/store";

/**
 * ALERT EVALUATION.
 *
 * Alerts are evaluated against the same analysis objects the UI renders, so what
 * fires is exactly what the user can see. State-change alerts remember their last
 * observed state so they fire on the transition, not on every evaluation.
 */

export interface AlertHit {
  alert: Alert;
  message: string;
  at: number;
  score: number;
  direction: string;
}

export { describeAlert } from "@/lib/alertLabels";

function currentState(alert: Alert, a: AssetAnalysis): string {
  switch (alert.kind) {
    case "direction-becomes":
    case "direction-change":
      return a.score.direction;
    case "price-cross-ma50":
      return a.technical.find((t) => t.timeframe === "1D")?.priceVsMa50 ?? "unknown";
    case "structure-change":
      return a.structure.find((s) => s.timeframe === "1D")?.bias ?? "unknown";
    default:
      return "";
  }
}

export function evaluateAlerts(alerts: Alert[], analyses: Map<string, AssetAnalysis>, now = Date.now()): AlertHit[] {
  const hits: AlertHit[] = [];

  for (const alert of alerts) {
    if (!alert.active) continue;
    const a = analyses.get(alert.symbol.toUpperCase());
    if (!a) continue;

    const state = currentState(alert, a);
    let fired = false;
    let message = "";

    switch (alert.kind) {
      case "score-above":
        fired = a.score.score >= alert.threshold && (alert.lastState !== "above");
        message = `${alert.symbol} MD Direction Score is ${a.score.score} — above your ${alert.threshold} threshold (${a.score.label}).`;
        alert.lastState = a.score.score >= alert.threshold ? "above" : "below";
        break;
      case "score-below":
        fired = a.score.score <= alert.threshold && alert.lastState !== "below";
        message = `${alert.symbol} MD Direction Score is ${a.score.score} — below your ${alert.threshold} threshold (${a.score.label}).`;
        alert.lastState = a.score.score <= alert.threshold ? "below" : "above";
        break;
      case "direction-becomes":
        fired = a.score.direction === alert.direction && alert.lastState !== a.score.direction;
        message = `${alert.symbol} is now ${a.score.direction} — score ${a.score.score} (${a.score.label}).`;
        alert.lastState = state;
        break;
      case "direction-change":
        fired = Boolean(alert.lastState) && alert.lastState !== state;
        message = `${alert.symbol} direction changed from ${alert.lastState} to ${state} — score ${a.score.score}.`;
        alert.lastState = state;
        break;
      case "price-cross-ma50":
        fired = Boolean(alert.lastState) && alert.lastState !== state && state !== "unknown";
        message = `${alert.symbol} price is now ${state} its daily 50 EMA.`;
        alert.lastState = state;
        break;
      case "structure-change":
        fired = Boolean(alert.lastState) && alert.lastState !== state && state !== "unknown";
        message = `${alert.symbol} daily market structure shifted from ${alert.lastState} to ${state}.`;
        alert.lastState = state;
        break;
      case "factors-aligned": {
        const sign = Math.sign(a.score.rawPoints || 1);
        const aligned = a.score.categories.filter(
          (c) => c.available && c.key !== "eventRisk" && Math.sign(c.points) === sign && Math.abs(c.strength) > 0.15,
        ).length;
        fired = aligned >= alert.threshold && alert.lastState !== "aligned";
        message = `${aligned} factors are aligned ${sign > 0 ? "bullish" : "bearish"} on ${alert.symbol} — score ${a.score.score}.`;
        alert.lastState = aligned >= alert.threshold ? "aligned" : "not-aligned";
        break;
      }
      case "event-countdown": {
        const next: EconomicEvent | null = a.eventRisk.nextEvent;
        if (next) {
          const hours = (next.time - now) / 3_600_000;
          fired = hours > 0 && hours <= alert.threshold && alert.lastState !== next.id;
          message = `${next.name} is in ${Math.max(0, Math.round(hours))}h — event risk for ${alert.symbol} is ${a.eventRisk.risk}.`;
          if (fired) alert.lastState = next.id;
        }
        break;
      }
    }

    if (fired) {
      hits.push({ alert, message, at: now, score: a.score.score, direction: a.score.direction });
    }
  }

  // Persist the new state / trigger counts.
  if (alerts.length) {
    store.write((db) => {
      for (const alert of alerts) {
        const record = db.alerts.find((x) => x.id === alert.id);
        if (!record) continue;
        record.lastState = alert.lastState;
        if (hits.some((h) => h.alert.id === alert.id)) {
          record.lastTriggeredAt = now;
          record.triggerCount += 1;
        }
      }
    });
  }

  return hits;
}

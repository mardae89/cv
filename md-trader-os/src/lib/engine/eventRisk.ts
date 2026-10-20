import type { Asset, EconomicEvent, EventRiskResult } from "@/lib/types";
import { EVENT_RISK } from "@/lib/config/scoring";
import { clamp } from "./indicators";

/**
 * EVENT RISK ENGINE.
 *
 * Event risk does NOT push a market bearish — it reduces conviction in whichever
 * direction the rest of the evidence points, because a scheduled binary event can
 * resolve either way. It is also contextual: an event only matters to an asset
 * that is actually exposed to it (matched on the asset's `eventTags`, or on the
 * currencies in the pair), so we never punish every market for one release.
 */
export function analyseEventRisk(asset: Asset, events: EconomicEvent[], now = Date.now()): EventRiskResult {
  const tags = new Set(asset.eventTags);
  const currencies = new Set(asset.currencies ?? []);

  const relevant = events
    .filter((e) => e.time > now)
    .filter((e) => e.tags.some((t) => tags.has(t)) || currencies.has(e.currency))
    .sort((a, b) => a.time - b.time);

  if (relevant.length === 0) {
    return { nextEvent: null, hoursUntil: null, risk: "none", dampening: 0, upcoming: [] };
  }

  let dampening = 0;
  for (const e of relevant) {
    const hours = (e.time - now) / 3_600_000;
    if (hours > EVENT_RISK.horizonHours) continue;
    const proximity = Math.pow(1 - hours / EVENT_RISK.horizonHours, 1.6);
    const exposure = e.tags.some((t) => tags.has(t)) ? 1 : 0.6;
    dampening = Math.max(dampening, EVENT_RISK.impactWeight[e.importance] * proximity * exposure);
  }
  dampening = clamp(dampening * EVENT_RISK.maxDampening, 0, 1);

  const next = relevant[0];
  const hoursUntil = (next.time - now) / 3_600_000;
  const risk =
    dampening > 0.45 ? "high" : dampening > 0.18 ? "medium" : dampening > 0.04 ? "low" : "none";

  return { nextEvent: next, hoursUntil, risk, dampening, upcoming: relevant.slice(0, 6) };
}

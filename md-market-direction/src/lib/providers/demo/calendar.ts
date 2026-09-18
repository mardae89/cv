import type { EconomicEvent } from "@/lib/types";
import { generateEconomicEvents } from "@/lib/data/calendarSeed";
import type { EconomicCalendarProvider, ProviderHealth } from "../types";

export class DemoCalendarProvider implements EconomicCalendarProvider {
  readonly id = "demo-calendar";
  readonly label = "MD Demo Calendar";
  readonly live = false;

  health(): ProviderHealth {
    return {
      id: this.id, label: this.label, kind: "calendar", live: false, ok: true,
      message: "Demo calendar following real-world release cadence.",
      lastSuccessAt: Date.now(), lastErrorAt: null, latencyMs: 0,
    };
  }

  async getEconomicEvents(params: { from?: number; to?: number } = {}): Promise<EconomicEvent[]> {
    const events = generateEconomicEvents();
    return events.filter((e) => (!params.from || e.time >= params.from) && (!params.to || e.time <= params.to));
  }
}

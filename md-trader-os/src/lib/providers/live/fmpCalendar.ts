import type { EconomicEvent, Impact } from "@/lib/types";
import type { EconomicCalendarProvider, ProviderHealth } from "../types";

/**
 * LIVE ECONOMIC CALENDAR — Financial Modeling Prep adapter.
 * Enabled when FMP_API_KEY is set. Not exercised against the live API here.
 */
const TAG_RULES: { match: RegExp; tags: string[] }[] = [
  { match: /fomc|fed|federal reserve|powell/i, tags: ["fed", "rates"] },
  { match: /cpi|inflation|pce/i, tags: ["us-inflation"] },
  { match: /payroll|unemployment|claims|jobs/i, tags: ["us-jobs"] },
  { match: /gdp|retail sales|pmi|ism/i, tags: ["us-growth"] },
  { match: /ecb|lagarde/i, tags: ["ecb", "rates"] },
  { match: /boe|bank of england/i, tags: ["boe", "rates"] },
  { match: /boj|bank of japan/i, tags: ["boj", "rates"] },
  { match: /crude|oil|eia|opec/i, tags: ["oil"] },
  { match: /china|caixin/i, tags: ["china"] },
];

function tagsFor(name: string): string[] {
  const tags = new Set<string>();
  for (const rule of TAG_RULES) if (rule.match.test(name)) rule.tags.forEach((t) => tags.add(t));
  return Array.from(tags);
}

function importanceFor(impact: string | undefined): Impact {
  if (!impact) return "low";
  const v = impact.toLowerCase();
  if (v === "high") return "high";
  if (v === "medium") return "medium";
  return "low";
}

export class FmpCalendarProvider implements EconomicCalendarProvider {
  readonly id = "fmp-calendar";
  readonly label = "Financial Modeling Prep";
  readonly live = true;
  private lastSuccessAt: number | null = null;
  private lastErrorAt: number | null = null;
  private lastMessage = "Not yet called.";

  constructor(private apiKey: string, private baseUrl = "https://financialmodelingprep.com/api/v3") {}

  health(): ProviderHealth {
    return {
      id: this.id, label: this.label, kind: "calendar", live: true,
      ok: this.lastErrorAt === null || (this.lastSuccessAt ?? 0) > this.lastErrorAt,
      message: this.lastMessage, lastSuccessAt: this.lastSuccessAt, lastErrorAt: this.lastErrorAt, latencyMs: null,
    };
  }

  async getEconomicEvents(params: { from?: number; to?: number } = {}): Promise<EconomicEvent[]> {
    const from = new Date(params.from ?? Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const to = new Date(params.to ?? Date.now() + 21 * 86_400_000).toISOString().slice(0, 10);
    const url = new URL(`${this.baseUrl}/economic_calendar`);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    url.searchParams.set("apikey", this.apiKey);
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) {
      this.lastErrorAt = Date.now();
      this.lastMessage = `HTTP ${res.status} from ${this.label}`;
      throw new Error(this.lastMessage);
    }
    const json = (await res.json()) as {
      event: string; date: string; country: string; currency?: string;
      actual?: number | null; estimate?: number | null; previous?: number | null; impact?: string;
    }[];
    this.lastSuccessAt = Date.now();
    this.lastMessage = "OK";
    return json.map((e, i) => ({
      id: `fmp-${i}-${e.date}`,
      name: e.event,
      country: e.country,
      currency: e.currency ?? "",
      time: new Date(e.date.replace(" ", "T") + "Z").getTime(),
      importance: importanceFor(e.impact),
      actual: e.actual != null ? String(e.actual) : null,
      forecast: e.estimate != null ? String(e.estimate) : null,
      previous: e.previous != null ? String(e.previous) : null,
      tags: tagsFor(e.event),
      demo: false,
    }));
  }
}

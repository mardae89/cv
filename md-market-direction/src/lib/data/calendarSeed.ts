import type { EconomicEvent, Impact } from "@/lib/types";
import { rng } from "@/lib/utils/random";
import { macroNarrative } from "./macroSeed";

const DAY = 24 * 60 * 60_000;

/**
 * DEMO ECONOMIC CALENDAR.
 *
 * Events follow the real-world release cadence (NFP on the first Friday, CPI
 * mid-month, central bank meetings roughly every six weeks) so that event risk
 * behaves realistically. Forecast / previous / actual values are derived from the
 * same macro narrative the rest of the demo data uses.
 */

interface Rule {
  name: string;
  country: string;
  currency: string;
  importance: Impact;
  tags: string[];
  /** UTC hour:minute of the release. */
  hour: number;
  minute: number;
  matches: (d: Date) => boolean;
  /** Produces [actual, forecast, previous] strings. */
  values: (n: ReturnType<typeof macroNarrative>, r: () => number) => [string, string, string];
}

function nthWeekday(d: Date, weekday: number, n: number): boolean {
  if (d.getUTCDay() !== weekday) return false;
  return Math.floor((d.getUTCDate() - 1) / 7) === n - 1;
}

function pct(v: number, digits = 1) {
  return `${v.toFixed(digits)}%`;
}

const RULES: Rule[] = [
  {
    name: "FOMC Interest Rate Decision",
    country: "United States", currency: "USD", importance: "high",
    tags: ["fed", "rates"], hour: 18, minute: 0,
    // Roughly every six weeks, anchored to a fixed day index.
    matches: (d) => d.getUTCDay() === 3 && Math.floor(d.getTime() / DAY) % 42 === 7,
    values: (n) => [pct(5.25 + n.policyStance * 0.0, 2), pct(5.25, 2), pct(5.25, 2)],
  },
  {
    name: "FOMC Press Conference",
    country: "United States", currency: "USD", importance: "high",
    tags: ["fed", "rates"], hour: 18, minute: 30,
    matches: (d) => d.getUTCDay() === 3 && Math.floor(d.getTime() / DAY) % 42 === 7,
    values: () => ["—", "—", "—"],
  },
  {
    name: "CPI (y/y)",
    country: "United States", currency: "USD", importance: "high",
    tags: ["us-inflation", "fed"], hour: 12, minute: 30,
    matches: (d) => d.getUTCDate() === 12 || (d.getUTCDate() === 13 && d.getUTCDay() === 1),
    values: (n) => [pct(3.1 + n.inflation * 0.9), pct(3.1), pct(3.1 - n.inflation * 0.2)],
  },
  {
    name: "Core CPI (m/m)",
    country: "United States", currency: "USD", importance: "high",
    tags: ["us-inflation", "fed"], hour: 12, minute: 30,
    matches: (d) => d.getUTCDate() === 12 || (d.getUTCDate() === 13 && d.getUTCDay() === 1),
    values: (n) => [pct(0.3 + n.inflation * 0.15, 2), pct(0.3, 2), pct(0.3, 2)],
  },
  {
    name: "Non-Farm Payrolls",
    country: "United States", currency: "USD", importance: "high",
    tags: ["us-jobs", "fed", "us-growth"], hour: 12, minute: 30,
    matches: (d) => nthWeekday(d, 5, 1),
    values: (n, r) => {
      const fc = 180;
      const act = Math.round(fc + n.growth * 90 + (r() - 0.5) * 40);
      return [`${act}K`, `${fc}K`, `${Math.round(fc + n.growth * 40)}K`];
    },
  },
  {
    name: "Unemployment Rate",
    country: "United States", currency: "USD", importance: "high",
    tags: ["us-jobs", "fed"], hour: 12, minute: 30,
    matches: (d) => nthWeekday(d, 5, 1),
    values: (n) => [pct(4.0 - n.growth * 0.3), pct(4.0), pct(4.0)],
  },
  {
    name: "Initial Jobless Claims",
    country: "United States", currency: "USD", importance: "medium",
    tags: ["us-jobs"], hour: 12, minute: 30,
    matches: (d) => d.getUTCDay() === 4,
    values: (n, r) => {
      const fc = 220;
      const act = Math.round(fc - n.growth * 18 + (r() - 0.5) * 12);
      return [`${act}K`, `${fc}K`, `${fc + 3}K`];
    },
  },
  {
    name: "PPI (m/m)",
    country: "United States", currency: "USD", importance: "medium",
    tags: ["us-inflation"], hour: 12, minute: 30,
    matches: (d) => d.getUTCDate() === 15,
    values: (n) => [pct(0.2 + n.inflation * 0.2, 2), pct(0.2, 2), pct(0.2, 2)],
  },
  {
    name: "Retail Sales (m/m)",
    country: "United States", currency: "USD", importance: "medium",
    tags: ["us-growth"], hour: 12, minute: 30,
    matches: (d) => d.getUTCDate() === 16,
    values: (n) => [pct(0.3 + n.growth * 0.4, 1), pct(0.3, 1), pct(0.2, 1)],
  },
  {
    name: "GDP (annualised, q/q)",
    country: "United States", currency: "USD", importance: "high",
    tags: ["us-growth"], hour: 12, minute: 30,
    matches: (d) => d.getUTCDate() === 27,
    values: (n) => [pct(2.1 + n.growth * 1.2), pct(2.1), pct(2.0)],
  },
  {
    name: "ISM Manufacturing PMI",
    country: "United States", currency: "USD", importance: "medium",
    tags: ["us-growth"], hour: 14, minute: 0,
    matches: (d) => d.getUTCDate() === 2,
    values: (n) => [(49.5 + n.growth * 2.5).toFixed(1), "49.8", "49.2"],
  },
  {
    name: "ECB Interest Rate Decision",
    country: "Euro Area", currency: "EUR", importance: "high",
    tags: ["ecb", "rates"], hour: 12, minute: 15,
    matches: (d) => d.getUTCDay() === 4 && Math.floor(d.getTime() / DAY) % 42 === 21,
    values: () => [pct(4.0, 2), pct(4.0, 2), pct(4.0, 2)],
  },
  {
    name: "Bank of England Rate Decision",
    country: "United Kingdom", currency: "GBP", importance: "high",
    tags: ["boe", "rates"], hour: 11, minute: 0,
    matches: (d) => d.getUTCDay() === 4 && Math.floor(d.getTime() / DAY) % 42 === 35,
    values: () => [pct(5.25, 2), pct(5.25, 2), pct(5.25, 2)],
  },
  {
    name: "Bank of Japan Policy Statement",
    country: "Japan", currency: "JPY", importance: "high",
    tags: ["boj", "rates"], hour: 3, minute: 0,
    matches: (d) => d.getUTCDay() === 5 && Math.floor(d.getTime() / DAY) % 49 === 14,
    values: () => [pct(0.1, 2), pct(0.1, 2), pct(0.1, 2)],
  },
  {
    name: "Euro Area CPI (y/y, flash)",
    country: "Euro Area", currency: "EUR", importance: "high",
    tags: ["eu-inflation", "ecb"], hour: 9, minute: 0,
    matches: (d) => d.getUTCDate() === 1,
    values: (n) => [pct(2.4 + n.inflation * 0.6), pct(2.4), pct(2.4)],
  },
  {
    name: "UK CPI (y/y)",
    country: "United Kingdom", currency: "GBP", importance: "high",
    tags: ["uk-inflation", "boe"], hour: 6, minute: 0,
    matches: (d) => d.getUTCDate() === 17,
    values: (n) => [pct(3.2 + n.inflation * 0.7), pct(3.2), pct(3.4)],
  },
  {
    name: "China Manufacturing PMI",
    country: "China", currency: "CNY", importance: "medium",
    tags: ["china", "us-growth"], hour: 1, minute: 30,
    matches: (d) => d.getUTCDate() === 30,
    values: (n) => [(49.8 + n.growth * 1.6).toFixed(1), "49.9", "49.5"],
  },
  {
    name: "EIA Crude Oil Inventories",
    country: "United States", currency: "USD", importance: "medium",
    tags: ["oil"], hour: 14, minute: 30,
    matches: (d) => d.getUTCDay() === 3,
    values: (_n, r) => {
      const act = ((r() - 0.5) * 8).toFixed(1);
      return [`${act}M`, "-1.2M", "2.1M"];
    },
  },
  {
    name: "Fed Chair Speech",
    country: "United States", currency: "USD", importance: "medium",
    tags: ["fed"], hour: 18, minute: 0,
    matches: (d) => d.getUTCDay() === 2 && Math.floor(d.getTime() / DAY) % 14 === 3,
    values: () => ["—", "—", "—"],
  },
];

export function generateEconomicEvents(now = Date.now(), daysBack = 7, daysForward = 21): EconomicEvent[] {
  const narrative = macroNarrative(now);
  const events: EconomicEvent[] = [];
  const startDay = Math.floor(now / DAY) - daysBack;

  for (let i = 0; i <= daysBack + daysForward; i++) {
    const dayStart = (startDay + i) * DAY;
    const d = new Date(dayStart);
    for (const rule of RULES) {
      if (!rule.matches(d)) continue;
      const time = dayStart + rule.hour * 60 * 60_000 + rule.minute * 60_000;
      const r = rng(`cal:${rule.name}:${startDay + i}`);
      const [actual, forecast, previous] = rule.values(narrative, r);
      events.push({
        id: `demo-${rule.name.replace(/\s+/g, "-").toLowerCase()}-${startDay + i}`,
        name: rule.name,
        country: rule.country,
        currency: rule.currency,
        time,
        importance: rule.importance,
        actual: time <= now ? actual : null,
        forecast,
        previous,
        tags: rule.tags,
        demo: true,
      });
    }
  }
  return events.sort((a, b) => a.time - b.time);
}

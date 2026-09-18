import type { JournalEntry } from "@/lib/db/schema";

/**
 * JOURNAL ANALYTICS.
 * Groups closed trades by the dimensions that actually change decisions:
 * the asset, the MD Score at entry, the strategy and the timeframe.
 */
export interface Bucket {
  key: string;
  trades: number;
  wins: number;
  winRate: number;
  avgReturnPct: number;
  totalReturnPct: number;
  avgR: number | null;
}

function summarise(key: string, entries: JournalEntry[]): Bucket {
  const closed = entries.filter((e) => e.outcome !== "open" && e.resultPct != null);
  const wins = closed.filter((e) => (e.resultPct ?? 0) > 0).length;
  const total = closed.reduce((s, e) => s + (e.resultPct ?? 0), 0);
  const rValues = closed.map((e) => e.resultR).filter((r): r is number => r != null);
  return {
    key,
    trades: closed.length,
    wins,
    winRate: closed.length ? (wins / closed.length) * 100 : 0,
    avgReturnPct: closed.length ? total / closed.length : 0,
    totalReturnPct: total,
    avgR: rValues.length ? rValues.reduce((a, b) => a + b, 0) / rValues.length : null,
  };
}

function group(entries: JournalEntry[], keyFn: (e: JournalEntry) => string | null): Bucket[] {
  const map = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const key = keyFn(e);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .map(([key, list]) => summarise(key, list))
    .filter((b) => b.trades > 0)
    .sort((a, b) => b.trades - a.trades);
}

function scoreBucket(score: number | null): string | null {
  if (score == null) return null;
  if (score >= 80) return "Score 80+";
  if (score >= 60) return "Score 60–79";
  if (score >= 45) return "Score 45–59";
  if (score >= 30) return "Score 30–44";
  return "Score below 30";
}

export function journalAnalytics(entries: JournalEntry[]) {
  const closed = entries.filter((e) => e.outcome !== "open");
  return {
    overall: summarise("All closed trades", entries),
    byAsset: group(entries, (e) => e.symbol),
    byScore: group(entries, (e) => scoreBucket(e.mdScoreAtEntry)),
    byStrategy: group(entries, (e) => e.strategy || "Unspecified"),
    byTimeframe: group(entries, (e) => e.timeframe),
    byDirection: group(entries, (e) => (e.direction === "long" ? "Long" : "Short")),
    openCount: entries.length - closed.length,
    closedCount: closed.length,
  };
}

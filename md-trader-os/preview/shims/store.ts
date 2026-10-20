import { EMPTY_DB, type Database } from "@/lib/db/schema";

/**
 * The server's JSON-file store, in memory. Nothing the preview needs lives
 * here — the journal, plan, watchlists and alerts all use browser storage —
 * but the route handlers record usage through it.
 */
const data: Database = structuredClone(EMPTY_DB);

export const store = {
  read: (): Database => data,
  write<T>(fn: (db: Database) => T): T {
    return fn(data);
  },
  isPersistent: false,
  storageLabel: "In-memory (preview)",
};

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
}

export function log() {}
export function recordUsage() {}

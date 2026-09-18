"use client";

import type { Alert, AlertKind, JournalEntry, Watchlist } from "@/lib/db/schema";
import type { Direction } from "@/lib/types";

/**
 * GUEST STORAGE.
 *
 * When a deployment has no durable database, accounts cannot work — so the
 * personal features are kept in the viewer's own browser instead of being
 * withheld. The shapes match the server's, so the pages render identically
 * whether the data came from an account or from localStorage.
 *
 * Every read and write is wrapped: a private window, cleared site data or
 * blocked storage must degrade to "empty", never throw.
 */
const KEY = "md.guest.v1";

interface GuestData {
  watchlists: Watchlist[];
  alerts: Alert[];
  journal: JournalEntry[];
}

const EMPTY: GuestData = { watchlists: [], alerts: [], journal: [] };

function read(): GuestData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY);
    const parsed = JSON.parse(raw) as Partial<GuestData>;
    return {
      watchlists: Array.isArray(parsed.watchlists) ? parsed.watchlists : [],
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      journal: Array.isArray(parsed.journal) ? parsed.journal : [],
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

function write(data: GuestData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable — the session keeps working, it just will not persist */
  }
}

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export const guest = {
  /** Seeded on first use so the page is never an empty shell. */
  watchlists(): Watchlist[] {
    const data = read();
    if (!data.watchlists.length) {
      data.watchlists = [
        {
          id: id("wl"),
          userId: "guest",
          name: "My Markets",
          symbols: ["XAU/USD", "GBP/USD", "EUR/USD", "SPX"],
          createdAt: Date.now(),
        },
      ];
      write(data);
    }
    return data.watchlists;
  },

  createWatchlist(name: string): Watchlist {
    const data = read();
    const list: Watchlist = { id: id("wl"), userId: "guest", name, symbols: [], createdAt: Date.now() };
    data.watchlists.push(list);
    write(data);
    return list;
  },

  updateWatchlist(listId: string, change: { add?: string; remove?: string; name?: string }) {
    const data = read();
    const list = data.watchlists.find((w) => w.id === listId);
    if (!list) return;
    if (change.name) list.name = change.name;
    if (change.add && !list.symbols.includes(change.add)) list.symbols.push(change.add);
    if (change.remove) list.symbols = list.symbols.filter((s) => s !== change.remove);
    write(data);
  },

  deleteWatchlist(listId: string) {
    const data = read();
    data.watchlists = data.watchlists.filter((w) => w.id !== listId);
    write(data);
  },

  alerts(): Alert[] {
    return read().alerts;
  },

  createAlert(input: { symbol: string; kind: AlertKind; threshold: number; direction: Direction | null; note: string }): Alert {
    const data = read();
    const alert: Alert = {
      id: id("alr"),
      userId: "guest",
      symbol: input.symbol,
      kind: input.kind,
      threshold: input.threshold,
      direction: input.direction,
      note: input.note,
      active: true,
      createdAt: Date.now(),
      lastTriggeredAt: null,
      triggerCount: 0,
      lastState: null,
    };
    data.alerts.push(alert);
    write(data);
    return alert;
  },

  updateAlert(alertId: string, change: Partial<Pick<Alert, "active" | "threshold" | "note" | "lastState" | "lastTriggeredAt" | "triggerCount">>) {
    const data = read();
    const alert = data.alerts.find((a) => a.id === alertId);
    if (!alert) return;
    Object.assign(alert, change);
    write(data);
  },

  deleteAlert(alertId: string) {
    const data = read();
    data.alerts = data.alerts.filter((a) => a.id !== alertId);
    write(data);
  },

  journal(): JournalEntry[] {
    return read().journal.sort((a, b) => b.openedAt - a.openedAt);
  },

  createJournalEntry(input: Omit<JournalEntry, "id" | "userId" | "closedAt" | "outcome" | "resultR" | "resultPct">): JournalEntry {
    const data = read();
    const entry: JournalEntry = {
      ...input,
      id: id("jrn"),
      userId: "guest",
      closedAt: null,
      outcome: "open",
      resultR: null,
      resultPct: null,
    };
    data.journal.push(entry);
    write(data);
    return entry;
  },

  closeJournalEntry(entryId: string, exit: number) {
    const data = read();
    const entry = data.journal.find((j) => j.id === entryId);
    if (!entry) return;
    const sign = entry.direction === "long" ? 1 : -1;
    entry.resultPct = ((exit - entry.entry) / entry.entry) * 100 * sign;
    // An R multiple only means something when a stop was recorded.
    if (entry.stop != null && entry.stop !== entry.entry) {
      entry.resultR = ((exit - entry.entry) * sign) / Math.abs(entry.entry - entry.stop);
    }
    entry.closedAt = Date.now();
    entry.outcome = entry.resultPct > 0.02 ? "win" : entry.resultPct < -0.02 ? "loss" : "breakeven";
    write(data);
  },

  deleteJournalEntry(entryId: string) {
    const data = read();
    data.journal = data.journal.filter((j) => j.id !== entryId);
    write(data);
  },
};

/** True when this browser is acting as the store (no account behind the page). */
export function useGuestMode(): boolean | null {
  if (typeof window === "undefined") return null;
  return guestModeCache;
}

let guestModeCache: boolean | null = null;
export function setGuestMode(v: boolean) {
  guestModeCache = v;
}

import { mergeSettings } from "./settings";
import type { OrderRecord, Settings } from "./types";

/**
 * Persistence for the MVP: localStorage, on-device only. Nothing is uploaded,
 * there is no account, and screenshots are never written here.
 *
 * Swapping in IndexedDB or a synced backend later means replacing this module —
 * the rest of the app only knows load/save.
 */

const KEY_SETTINGS = "soi.settings.v1";
const KEY_ORDERS = "soi.orders.v1";

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or a full quota — the session still works in memory.
  }
}

export function loadSettings(): Settings {
  return mergeSettings(readJson<unknown>(KEY_SETTINGS));
}

export function saveSettings(settings: Settings): void {
  writeJson(KEY_SETTINGS, settings);
}

export function loadOrders(): OrderRecord[] {
  const raw = readJson<OrderRecord[]>(KEY_ORDERS);
  if (!Array.isArray(raw)) return [];
  return raw.filter((o) => o && typeof o.id === "string" && typeof o.payout === "number");
}

export function saveOrders(orders: OrderRecord[]): void {
  writeJson(KEY_ORDERS, orders);
}

export function clearAll(): void {
  try {
    localStorage.removeItem(KEY_SETTINGS);
    localStorage.removeItem(KEY_ORDERS);
  } catch {
    // Nothing to clear.
  }
}

export function exportData(settings: Settings, orders: OrderRecord[]): string {
  return JSON.stringify(
    { app: "spark-order-iq", version: 1, exportedAt: new Date().toISOString(), settings, orders },
    null,
    2,
  );
}

export interface ImportResult {
  settings: Settings | null;
  orders: OrderRecord[] | null;
  error: string | null;
}

export function parseImport(text: string): ImportResult {
  try {
    const parsed = JSON.parse(text) as { settings?: unknown; orders?: unknown };
    const orders = Array.isArray(parsed.orders) ? (parsed.orders as OrderRecord[]) : null;
    const settings = parsed.settings ? mergeSettings(parsed.settings) : null;
    if (!orders && !settings) return { settings: null, orders: null, error: "No Spark Order IQ data in that file." };
    return { settings, orders, error: null };
  } catch {
    return { settings: null, orders: null, error: "That file isn't valid JSON." };
  }
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `o_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildSampleOrders } from "../lib/demo";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { clearAll, loadOrders, loadSettings, newId, saveOrders, saveSettings } from "../lib/storage";
import type { OrderRecord, Settings } from "../lib/types";

/**
 * Single source of truth for settings and logged orders, persisted to
 * localStorage. Screens read from here; nothing else touches storage.
 */

interface StoreValue {
  settings: Settings;
  orders: OrderRecord[];
  hasSampleData: boolean;
  updateSettings: (patch: Partial<Settings>) => void;
  replaceSettings: (next: Settings) => void;
  addOrder: (order: Omit<OrderRecord, "id" | "sample">) => OrderRecord;
  updateOrder: (id: string, patch: Partial<OrderRecord>) => void;
  deleteOrder: (id: string) => void;
  loadSampleData: () => void;
  removeSampleData: () => void;
  replaceOrders: (orders: OrderRecord[]) => void;
  eraseEverything: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [orders, setOrders] = useState<OrderRecord[]>(() => loadOrders());
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) return;
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    saveOrders(orders);
  }, [orders]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const replaceSettings = useCallback((next: Settings) => {
    saveSettings(next);
    setSettings(next);
  }, []);

  const commitOrders = useCallback((next: OrderRecord[]) => {
    const sorted = [...next].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    saveOrders(sorted);
    setOrders(sorted);
    return sorted;
  }, []);

  const addOrder = useCallback<StoreValue["addOrder"]>(
    (order) => {
      const record: OrderRecord = { ...order, id: newId(), sample: false };
      commitOrders([record, ...orders]);
      return record;
    },
    [commitOrders, orders],
  );

  const updateOrder = useCallback<StoreValue["updateOrder"]>(
    (id, patch) => {
      commitOrders(orders.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    },
    [commitOrders, orders],
  );

  const deleteOrder = useCallback(
    (id: string) => {
      commitOrders(orders.filter((o) => o.id !== id));
    },
    [commitOrders, orders],
  );

  const loadSampleData = useCallback(() => {
    const withoutSamples = orders.filter((o) => !o.sample);
    commitOrders([...buildSampleOrders(), ...withoutSamples]);
  }, [commitOrders, orders]);

  const removeSampleData = useCallback(() => {
    commitOrders(orders.filter((o) => !o.sample));
  }, [commitOrders, orders]);

  const replaceOrders = useCallback(
    (next: OrderRecord[]) => {
      commitOrders(next);
    },
    [commitOrders],
  );

  const eraseEverything = useCallback(() => {
    clearAll();
    setOrders([]);
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      settings,
      orders,
      hasSampleData: orders.some((o) => o.sample),
      updateSettings,
      replaceSettings,
      addOrder,
      updateOrder,
      deleteOrder,
      loadSampleData,
      removeSampleData,
      replaceOrders,
      eraseEverything,
    }),
    [
      settings,
      orders,
      updateSettings,
      replaceSettings,
      addOrder,
      updateOrder,
      deleteOrder,
      loadSampleData,
      removeSampleData,
      replaceOrders,
      eraseEverything,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

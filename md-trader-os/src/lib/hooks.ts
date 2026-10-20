"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Small data-fetching hook with loading / error / refresh, so every page gets
 * the same skeleton → content → error behaviour without a client data library.
 */
export function useApi<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [upgrade, setUpgrade] = useState<{ requiredTier: string; message: string } | null>(null);
  const controller = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (!url) return;
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { signal: ac.signal });
      const json = await res.json().catch(() => ({}));
      if (res.status === 402) {
        setUpgrade({ requiredTier: json.requiredTier ?? "pro", message: json.message ?? "Upgrade required." });
        setData(null);
        return;
      }
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setUpgrade(null);
      setData(json as T);
      setFetchedAt(Date.now());
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    run();
    return () => controller.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  return { data, error, loading, refresh: run, fetchedAt, upgrade };
}

/** Re-renders on an interval so "updated 12 seconds ago" stays honest. */
export function useTicker(intervalMs = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

export async function postJson<T>(url: string, body: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? json.message ?? `Request failed (${res.status})`);
  return json as T;
}

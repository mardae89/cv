/**
 * Tiny TTL cache. Market data is expensive; nothing should be fetched twice
 * inside its freshness window. Every cached value records when it was produced
 * so the UI can honestly display "updated 12 seconds ago".
 */
export interface CacheEntry<T> {
  value: T;
  at: number;
  expires: number;
}

export class TtlCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  constructor(private ttlMs: number, private maxEntries = 500) {}

  get(key: string): CacheEntry<T> | null {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (hit.expires <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    return hit;
  }

  set(key: string, value: T, ttlMs?: number): CacheEntry<T> {
    const now = Date.now();
    const entry: CacheEntry<T> = { value, at: now, expires: now + (ttlMs ?? this.ttlMs) };
    this.map.set(key, entry);
    if (this.map.size > this.maxEntries) {
      const oldest = Array.from(this.map.entries()).sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) this.map.delete(oldest[0]);
    }
    return entry;
  }

  async wrap(key: string, fn: () => Promise<T>, ttlMs?: number): Promise<CacheEntry<T>> {
    const hit = this.get(key);
    if (hit) return hit;
    const value = await fn();
    return this.set(key, value, ttlMs);
  }

  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }

  entries() {
    return Array.from(this.map.entries()).map(([key, e]) => ({ key, at: e.at, expires: e.expires }));
  }
}

/** Dev-safe singleton: Next hot-reload must not multiply caches. */
export function singleton<T>(key: string, factory: () => T): T {
  const g = globalThis as unknown as Record<string, unknown>;
  const full = `__md_${key}`;
  if (!g[full]) g[full] = factory();
  return g[full] as T;
}

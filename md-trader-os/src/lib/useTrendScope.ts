"use client";

import { useCallback, useEffect, useState } from "react";
import type { TradingMode, TrendScope } from "@/lib/types";

/**
 * VIEW PREFERENCES, HELD IN THE BROWSER.
 *
 * The app runs without accounts, so there is no server-side profile to save a
 * trading style or a trend scope into. Both live here instead, and both are sent
 * on every scoring request as ?mode= and ?scope=.
 *
 * Every screen subscribes, so changing either anywhere changes it everywhere
 * without a reload.
 */
const EVENT = "md:viewPrefs";

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return allowed.includes(raw as T) ? (raw as T) : fallback;
  } catch {
    // Private browsing and blocked site data both throw here.
    return fallback;
  }
}

function usePref<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (next: T) => void] {
  // Server and first client render must agree, so the stored value is read in an
  // effect rather than during render.
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    const sync = () => setValue(read(key, allowed, fallback));
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
    // `allowed` and `fallback` are module constants at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // Not persisting is survivable; the session still honours the choice.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  return [value, update];
}

const SCOPES: readonly TrendScope[] = ["htf", "all"];
const MODES: readonly TradingMode[] = ["scalper", "day", "swing", "md-momentum"];

/**
 * Which timeframes may define the trend. Higher timeframes is the default: the
 * charts below the daily say when to get in, not which way the market is going.
 */
export function useTrendScope() {
  return usePref("md.trendScope", SCOPES, "htf" as TrendScope);
}

/** The trading style, which decides how much each timeframe in scope counts. */
export function useTradingMode() {
  return usePref("md.mode", MODES, "swing" as TradingMode);
}

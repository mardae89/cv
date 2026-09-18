"use client";

import { useCallback, useEffect, useState } from "react";
import type { TrendScope } from "@/lib/types";

const KEY = "md.trendScope";
const EVENT = "md:trendScope";

function read(): TrendScope {
  try {
    return localStorage.getItem(KEY) === "all" ? "all" : "htf";
  } catch {
    // Private browsing and blocked site data both throw here.
    return "htf";
  }
}

/**
 * Which timeframes may define the trend, remembered per browser.
 *
 * Higher timeframes is the default: the 1H and below are entry charts, and
 * letting them vote on trend and momentum is how a market that is plainly
 * trending on the weekly reads as undecided.
 *
 * Every screen that scores a market subscribes, so flipping it anywhere flips
 * it everywhere without a reload.
 */
export function useTrendScope(): [TrendScope, (next: TrendScope) => void] {
  // Server and first client render must agree, so the stored value is read in
  // an effect rather than during render.
  const [scope, setScope] = useState<TrendScope>("htf");

  useEffect(() => {
    setScope(read());
    const sync = () => setScope(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((next: TrendScope) => {
    setScope(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Not persisting is survivable; the session still honours the choice.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [scope, update];
}

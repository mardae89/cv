"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * THE BACK BUTTON IN THE PHONE'S TOP BAR.
 *
 * A detail view registers where "back" should fall back to, and the shell's
 * sticky header shows a back button for as long as that view is on screen —
 * so it is one tap away however far down the page the trader has scrolled.
 */
let target: string | null = null;
const listeners = new Set<() => void>();

function set(next: string | null) {
  target = next;
  for (const l of listeners) l();
}

/** Call from a detail view; `fallback` is its parent, used when there is no history. */
export function useShellBack(fallback: string | null) {
  useEffect(() => {
    set(fallback);
    return () => set(null);
  }, [fallback]);
}

export function useShellBackTarget(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => target,
    () => null,
  );
}

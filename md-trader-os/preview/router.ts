import { useSyncExternalStore } from "react";
import type { InMemoryRouter } from "@/lib/route";

/**
 * IN-MEMORY ROUTER.
 *
 * The preview is one HTML file inside the artifact viewer, which does not let
 * a page route on its own URL. Navigation lives here instead: a path and a
 * query, held in memory, with the same shape the deployed app's URLs have.
 */

interface Location {
  path: string;
  search: string;
}

function parse(href: string): Location {
  const [path, search = ""] = href.split("?");
  return { path: path || "/dashboard", search };
}

let current: Location = { path: "/dashboard", search: "" };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function navigate(href: string) {
  current = parse(href === "/" ? "/dashboard" : href);
  emit();
  window.scrollTo({ top: 0 });
}

export function useLocation(): Location {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => current,
  );
}

/** Opens the view named by a bare #token in the artifact link, e.g. #journal. */
export function startAt(token: string) {
  const aliases: Record<string, string> = { wicks: "/wick-catcher", home: "/dashboard", markets: "/markets" };
  const t = token.replace(/^#/, "").trim();
  if (t) current = parse(aliases[t] ?? `/${t}`);
}

const memoryRouter: InMemoryRouter = {
  query: () => new URLSearchParams(current.search),
  // Replacing the query is bookkeeping, not navigation: no re-render, no scroll.
  replace: (href) => {
    current = parse(href);
  },
};

export function installRouter() {
  window.__mdosRouter = memoryRouter;
  // Every internal link, from next/link or a plain <a href="/…">, routes here.
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement | null)?.closest?.("a");
    const href = a?.getAttribute("href");
    if (!a || !href || !href.startsWith("/") || a.target === "_blank") return;
    e.preventDefault();
    navigate(href);
  });
}

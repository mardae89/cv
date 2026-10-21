import { useSyncExternalStore } from "react";
import type { InMemoryRouter } from "@/lib/route";

/**
 * IN-MEMORY ROUTER.
 *
 * The preview is one HTML file inside the artifact viewer, which does not let
 * a page route on its own URL. Navigation lives here instead: a stack of
 * locations with the same shape the deployed app's URLs have, so back works,
 * and each entry remembers how far down the page was scrolled.
 */

interface Location {
  path: string;
  search: string;
}

interface Entry extends Location {
  scroll: number;
}

function parse(href: string): Location {
  const [path, search = ""] = href.split("?");
  return { path: !path || path === "/" ? "/dashboard" : path, search };
}

const stack: Entry[] = [{ path: "/dashboard", search: "", scroll: 0 }];
let current: Location = stack[0];
const listeners = new Set<() => void>();

function emit() {
  current = { path: stack[stack.length - 1].path, search: stack[stack.length - 1].search };
  for (const l of listeners) l();
}

export function navigate(href: string) {
  stack[stack.length - 1].scroll = window.scrollY;
  stack.push({ ...parse(href), scroll: 0 });
  emit();
  window.scrollTo({ top: 0 });
}

/** Back to the previous entry, and to where it was scrolled once it has drawn. */
export function goBack() {
  if (stack.length < 2) return navigate("/dashboard");
  stack.pop();
  const target = stack[stack.length - 1].scroll;
  emit();
  // The page re-renders from cached data in a frame or two; keep trying until
  // it is tall enough to scroll to where it was.
  let tries = 0;
  const restore = () => {
    window.scrollTo({ top: target });
    if (Math.abs(window.scrollY - target) > 2 && tries++ < 20) setTimeout(restore, 50);
  };
  requestAnimationFrame(restore);
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
  if (t) {
    stack[0] = { ...parse(aliases[t] ?? `/${t}`), scroll: 0 };
    current = { path: stack[0].path, search: stack[0].search };
  }
}

const memoryRouter: InMemoryRouter = {
  query: () => new URLSearchParams(current.search),
  // Replacing the query is bookkeeping, not navigation: no re-render, no scroll.
  replace: (href) => {
    const top = stack[stack.length - 1];
    Object.assign(top, parse(href));
    current = { path: top.path, search: top.search };
  },
  back: goBack,
  canGoBack: () => stack.length > 1,
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

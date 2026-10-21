/**
 * DEEP-LINK QUERY, READ THE SAME WAY EVERYWHERE.
 *
 * Pages opened from another page carry a little state in the query string
 * (/journal?new=1, /wick-catcher?symbol=EUR/USD). In the deployed app that is
 * the real URL. The single-file preview has no URL of its own to route on, so
 * it installs an in-memory router on `window.__mdosRouter`, and these helpers
 * read from whichever is present.
 */

export interface InMemoryRouter {
  query(): URLSearchParams;
  replace(path: string): void;
  back(): void;
  canGoBack(): boolean;
}

declare global {
  interface Window {
    __mdosRouter?: InMemoryRouter;
  }
}

export function readQuery(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return window.__mdosRouter ? window.__mdosRouter.query() : new URLSearchParams(window.location.search);
}

/** Drops the query once it has been acted on, so a refresh does not repeat it. */
export function replaceRoute(path: string) {
  if (window.__mdosRouter) window.__mdosRouter.replace(path);
  else window.history.replaceState(null, "", path);
}

/** True inside the single-file preview, where downloads are blocked. */
export function isPreview(): boolean {
  return typeof window !== "undefined" && Boolean(window.__mdosRouter);
}

/**
 * Whether "back" stays inside the app. The preview keeps its own history; the
 * deployed app has the browser's, and a page opened fresh from a shared link
 * has nothing behind it — so back goes to the page's parent instead.
 */
export function canGoBack(): boolean {
  if (typeof window === "undefined") return false;
  return window.__mdosRouter ? window.__mdosRouter.canGoBack() : window.history.length > 1;
}

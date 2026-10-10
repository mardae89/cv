// Shared helpers for the control-by-control audit specs (device mode: a fresh
// browser context is a fresh, empty IndexedDB).
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const VIEWPORTS = {
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false },
} as const;
export type ViewportName = keyof typeof VIEWPORTS;

/** Shields a run from the dev server's hot reload while other files are being edited. */
async function isolate(ctx: BrowserContext) {
  await ctx.routeWebSocket(() => true, () => undefined);
  await ctx.route((u) => u.pathname.startsWith("/src/"), async (route) => {
    const res = await route.fetch();
    if (!/javascript/.test(res.headers()["content-type"] ?? "")) return route.fulfill({ response: res });
    const body = (await res.text()).replace(/\?t=\d+&/g, "?").replace(/[?&]t=\d+/g, "");
    await route.fulfill({ response: res, body });
  });
}

export interface Opened {
  page: Page;
  errors: string[];
}

/**
 * A brand-new person in a fresh browser. `setup`:
 *  - "onboarding": stay on the first setup screen
 *  - "skip": skip setup and land on Today with no records
 *  - "demo": load the labelled sample data and land on Today
 */
export async function openFresh(browser: Browser, vp: ViewportName, setup: "onboarding" | "skip" | "demo" = "skip"): Promise<Opened> {
  const ctx = await browser.newContext(VIEWPORTS[vp]);
  await isolate(ctx);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/");
  await page.waitForURL("**/#/onboarding");
  if (setup === "skip") {
    await page.getByRole("button", { name: "Skip setup for now" }).click();
    await page.waitForURL((u) => u.hash === "#/" || u.hash === "");
  } else if (setup === "demo") {
    await page.getByRole("button", { name: /sample data/i }).first().click();
    const confirm = page.getByRole("dialog").getByRole("button", { name: /load|explore|continue|yes/i });
    if (await confirm.isVisible({ timeout: 1500 }).catch(() => false)) await confirm.click();
    await page.waitForURL((u) => u.hash === "#/" || u.hash === "", { timeout: 20_000 });
  }
  await settle(page);
  return { page, errors };
}

/** Dismiss any milestone celebrations that are showing. */
export async function settle(page: Page) {
  for (let i = 0; i < 40; i++) {
    const d = page.getByRole("dialog", { name: "Milestone unlocked" });
    if (!(await d.isVisible({ timeout: 300 }).catch(() => false))) return;
    await d.getByRole("button", { name: /^(Continue|Next|Close|Done)$/ }).first().click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(250);
  }
}

/** Go to an app route ("/log?tab=body") and wait for it to render. */
export async function go(page: Page, route: string) {
  await settle(page);
  await page.goto(`/#${route.startsWith("/") ? route : `/${route}`}`);
  await settle(page);
}

/** Everything this person has stored in the browser, decoded from the storage chunks. */
export async function stored(page: Page): Promise<{ lists: Record<string, Record<string, unknown>[]>; singles: Record<string, Record<string, unknown>>; profile: Record<string, unknown> | null }> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("becoming-os");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const all: { path: string; data: Record<string, unknown> }[] = await new Promise((res, rej) => {
      const r = db.transaction("docs").objectStore("docs").getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    db.close();
    const out = { lists: {} as Record<string, Record<string, unknown>[]>, singles: {} as Record<string, Record<string, unknown>>, profile: null as Record<string, unknown> | null };
    const chunks = new Map<string, { id: string; data: Record<string, unknown> }[]>();
    for (const { path, data } of all) {
      if (!path.startsWith("data/users/local/")) continue;
      const id = path.slice("data/users/local/".length);
      if (id.startsWith("t~")) {
        const key = id.split("~").slice(0, 3).join("~");
        chunks.set(key, [...(chunks.get(key) ?? []), { id, data }]);
      } else if (id.startsWith("s~") && data.row) out.singles[id.slice(2)] = data.row as Record<string, unknown>;
      else if (id === "profile") out.profile = data.row as Record<string, unknown>;
    }
    // Read each chunk the way the app does: page 0 names the version, and only that version's pages count.
    for (const [key, docs] of chunks) {
      const head = docs.find((d) => d.id === `${key}~0`);
      if (!head || typeof head.data.table !== "string") continue;
      const pages = [head, ...docs.filter((d) => d !== head && d.data.ver === head.data.ver)];
      const list = (out.lists[head.data.table] ??= []);
      for (const p of pages) if (Array.isArray(p.data.rows)) list.push(...(p.data.rows as Record<string, unknown>[]));
    }
    return out;
  });
}

export const rows = async (page: Page, table: string) => (await stored(page)).lists[table] ?? [];

/** No sideways scrolling of the whole page. */
export async function expectNoHorizontalScroll(page: Page) {
  const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  expect(w.doc, "page scrolls sideways").toBeLessThanOrEqual(w.win + 1);
}

/** Wait for a toast containing `text`. */
export async function toast(page: Page, text: string | RegExp) {
  await expect(page.getByRole("status").filter({ hasText: text }).first()).toBeVisible({ timeout: 10_000 });
}

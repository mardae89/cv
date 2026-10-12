// Inside the claude.ai viewer, a click on an <a> element is taken over by the
// viewer (it loads the address in place of the app), so in-app navigation must
// not use <a> elements there. This frames the
// app with that behaviour simulated and walks every navigation link, at
// desktop and phone sizes.
import { expect, test, type Browser, type FrameLocator } from "@playwright/test";
import { FakePageServer, type FakeUser } from "./fake-claude";
import { serveSource } from "./helpers";

const ORIGIN = new URL(process.env.E2E_BASE_URL ?? "http://localhost:8080").origin;
const ME: FakeUser = { id: "u_links01", name: "Me", owner: true };
const PAGES: [string, RegExp][] = [
  ["Power List", /Power List/], ["Content Bank", /Content Bank/], ["Traffic", /The four numbers/], ["Log", /Record it/],
  ["Body", /Physical transformation/], ["Train", /Training|10K/], ["Habits", /Habits & routine/], ["Reviews", /review/],
  ["Roadmap", /roadmap/i], ["Milestones", /Milestones/], ["Charts", /Charts/], ["Together", /.+/], ["Settings", /Your system/],
];

async function open(browser: Browser, viewport: { width: number; height: number }, mobile = false) {
  const server = new FakePageServer();
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  await ctx.routeWebSocket(() => true, () => undefined);
  await ctx.route((u) => u.origin === ORIGIN && u.pathname.startsWith("/src/"), serveSource);
  await ctx.route(`${ORIGIN}/harness`, (r) => r.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;height:100%}iframe{display:block;border:0;width:100%;height:100%}</style></head><body><iframe id="app" src="/"></iframe></body></html>`,
  }));
  await server.attach(ctx, ME);
  // The viewer takes over any click on an <a> element and loads its address in
  // place of the app (a blank page), as seen in desktop browsers.
  await ctx.addInitScript(() => {
    if (window.self === window.top) return;
    // In the Claude desktop app, scrollTo returns a value rather than undefined;
    // an effect that returns its result would hand React a non-function cleanup.
    const scrollTo = window.scrollTo.bind(window);
    (window as unknown as { scrollTo: (...a: unknown[]) => unknown }).scrollTo = (...a: unknown[]) => {
      (scrollTo as (...x: unknown[]) => void)(...a);
      return Promise.resolve();
    };
    document.addEventListener("click", (e) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      e.preventDefault();
      location.href = (a as HTMLAnchorElement).href || "about:blank";
    }, true);
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${ORIGIN}/harness`);
  const app = page.frameLocator("iframe#app");
  await app.getByRole("button", { name: "Skip setup for now" }).click();
  await expect(app.getByTestId("days-remaining")).toBeVisible();
  return { page, app, errors };
}

const heading = (app: FrameLocator) => app.locator("main h1").first();

test("framed, desktop: every sidebar link and the keyboard navigate", async ({ browser }) => {
  const { app, errors } = await open(browser, { width: 1280, height: 800 });
  const side = app.locator("aside");
  const crashed = app.getByRole("alert").filter({ hasText: "couldn't open" });
  // No navigation item is an <a> element inside the viewer.
  await expect(app.locator("aside a, nav a, main a")).toHaveCount(0);
  for (const [name, h] of PAGES) {
    await side.getByRole("link", { name, exact: true }).click();
    await expect(crashed).toHaveCount(0);
    await expect(heading(app)).toHaveText(h);
    await expect(side.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
  }
  await side.getByRole("link", { name: /^Notifications/ }).click();
  await expect(heading(app)).toHaveText(/Reminders/);
  await side.getByRole("link", { name: "BECOMING OS home" }).click();
  await expect(app.getByTestId("days-remaining")).toBeVisible();
  // Keyboard: Tab to a link and press Enter.
  await side.getByRole("link", { name: "Train", exact: true }).focus();
  await side.getByRole("link", { name: "Train", exact: true }).press("Enter");
  await expect(heading(app)).toHaveText(/Training|10K/);
  // Links inside pages navigate too.
  await side.getByRole("link", { name: "Today", exact: true }).click();
  await app.getByRole("main").getByRole("link", { name: /Content Bank →/ }).first().click();
  await expect(heading(app)).toHaveText(/Content Bank/);
  await app.getByRole("main").getByRole("link", { name: /Why you're doing this/ }).first().click();
  await expect(heading(app)).toHaveText(/Your system/);
  expect(errors).toEqual([]);
});

test("framed, phone: tab bar and More sheet navigate", async ({ browser }) => {
  const { app, errors } = await open(browser, { width: 390, height: 844 }, true);
  const bar = app.getByRole("navigation", { name: "Primary" });
  for (const [name, h] of [["Power List", /Power List/], ["Content", /Content Bank/], ["Log", /Record it/]] as const) {
    await bar.getByRole("link", { name, exact: true }).tap();
    await expect(heading(app)).toHaveText(h);
  }
  for (const [name, h] of [["Train", /Training|10K/], ["Body", /Physical transformation/], ["Settings", /Your system/]] as const) {
    await bar.getByRole("button", { name: "More" }).tap();
    await app.getByRole("dialog", { name: "Everything" }).getByRole("link", { name, exact: true }).tap();
    await expect(heading(app)).toHaveText(h);
  }
  await bar.getByRole("link", { name: "Today", exact: true }).tap();
  await expect(app.getByTestId("days-remaining")).toBeVisible();
  expect(errors).toEqual([]);
});

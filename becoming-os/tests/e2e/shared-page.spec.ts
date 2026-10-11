/// <reference lib="dom" />
// The published page, end to end, for two people. The app runs inside an
// <iframe> (as it does in the claude.ai viewer) with a faithful fake of the
// page runtime: one database in Node shared by the husband's and the wife's
// browser contexts, with the page's access rules enforced there. Checks that
// each person's records stay private, that only what each chooses to share
// reaches the other, that changes arrive live, that everything survives a
// reload, that files are saved through the page's save prompt, and that a
// view-only visitor falls back to this browser's storage.
import { expect, test, type Browser, type BrowserContext, type FrameLocator, type Page } from "@playwright/test";
import { addDays } from "../../src/lib/dates";
import { appFrame, FakePageServer, type FakeUser } from "./fake-claude";
import { serveSource } from "./helpers";

const HUSBAND: FakeUser = { id: "u_husband01", name: "Daniel", owner: true };
const WIFE: FakeUser = { id: "u_wife02", name: "Maria" };
const VIEWER: FakeUser = { id: "u_viewer03", name: "Sam", level: "view" };

const ORIGIN = new URL(process.env.E2E_BASE_URL ?? "http://localhost:8080").origin;
const HARNESS = `${ORIGIN}/harness`;

interface Person {
  ctx: BrowserContext;
  page: Page;
  /** The app inside the harness frame. */
  app: FrameLocator;
  plainDownloads: string[];
  outside: string[];
}

/** A phone-sized browser for one person, with the app framed inside a stand-in for the claude.ai viewer. */
async function open(browser: Browser, server: FakePageServer, user: FakeUser): Promise<Person> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  // Keep the dev server's hot reload out of the run (see workflows.spec.ts).
  await ctx.routeWebSocket(() => true, () => undefined);
  const outside: string[] = [];
  await ctx.route((u) => u.origin !== ORIGIN, async (route) => {
    // The viewer allows no outside requests; record any and refuse them.
    outside.push(route.request().url());
    await route.abort();
  });
  await ctx.route((u) => u.origin === ORIGIN && u.pathname.startsWith("/src/"), serveSource);
  await ctx.route(HARNESS, (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <style>html,body{margin:0;height:100%;background:#000}iframe{display:block;border:0;width:100%;height:100%}</style></head>
      <body><iframe id="app" title="BECOMING OS" src="/"></iframe></body></html>`,
  }));
  await server.attach(ctx, user);
  const page = await ctx.newPage();
  const plainDownloads: string[] = [];
  page.on("download", (d) => plainDownloads.push(d.suggestedFilename()));
  page.on("pageerror", (e) => { throw e; });
  await page.goto(HARNESS);
  return { ctx, page, app: page.frameLocator("iframe#app"), plainDownloads, outside };
}

/** Steps past any milestone celebrations that are showing. */
async function settle(app: FrameLocator) {
  for (let i = 0; i < 15; i++) {
    const d = app.getByRole("dialog", { name: "Milestone unlocked" });
    if (!(await d.isVisible().catch(() => false))) {
      // One may be about to open (milestones are synced a moment after a change).
      await new Promise((r) => setTimeout(r, 400));
      if (!(await d.isVisible().catch(() => false))) return;
    }
    await d.getByRole("button", { name: /^(Continue|Next)$/ }).click({ timeout: 3000 }).catch(() => undefined);
  }
}

const BOTTOM: Record<string, string> = { "/": "Today", "/progress": "Body", "/log": "Log", "/business": "Business", "/train": "Train" };
const MORE: Record<string, string> = { "/together": "Together", "/settings": "Settings", "/business": "Business", "/train": "Train" };

/** Moves around the app the way a person would — routes live in memory inside the frame, so there's no URL to visit. */
async function go(app: FrameLocator, to: string) {
  await settle(app);
  const bar = app.getByRole("navigation", { name: "Primary" });
  const direct = BOTTOM[to] ? bar.getByRole("link", { name: BOTTOM[to], exact: true }) : null;
  if (direct && (await direct.count())) return direct.click();
  await bar.getByRole("button", { name: "More" }).click();
  await app.getByRole("dialog", { name: "Everything" }).getByRole("link", { name: MORE[to], exact: true }).click();
}

async function logTab(app: FrameLocator, tab: "Body" | "Business" | "Habits & mind") {
  await go(app, "/log");
  await app.getByRole("radio", { name: tab, exact: true }).click();
}

async function logWeight(app: FrameLocator, weight: string) {
  await logTab(app, "Body");
  const form = app.getByRole("form", { name: "Weigh-in form" });
  await form.getByLabel("Weight in pounds").fill(weight);
  await form.getByRole("button", { name: "Save weigh-in" }).click();
  await expect(app.getByText("Weigh-in saved.")).toBeVisible();
}

async function logSale(app: FrameLocator, revenue: string, cash: string) {
  await logTab(app, "Business");
  const form = app.getByRole("form", { name: "Transaction form" });
  await form.getByLabel("Revenue earned").fill(revenue);
  await form.getByLabel("Cash collected now").fill(cash);
  await form.getByRole("button", { name: "Record" }).click();
  await expect(app.getByText(/Sale recorded/).first()).toBeVisible();
  await settle(app);
}

async function journal(app: FrameLocator, title: string, body: string, share: boolean) {
  await logTab(app, "Habits & mind");
  const panel = app.locator(".card", { has: app.getByRole("heading", { name: "Journal & learning" }) });
  await panel.getByRole("textbox", { name: "Title" }).fill(title);
  await panel.getByRole("textbox", { name: "Entry" }).fill(body);
  const toggle = panel.getByRole("switch", { name: "Share this entry with my partner" });
  if (share) await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", String(share));
  await panel.getByRole("button", { name: "Save entry" }).click();
  await expect(app.getByText("Entry saved.").first()).toBeVisible();
}

/** Sets one sharing level on Together and saves it. */
async function share(app: FrameLocator, row: string, level: string) {
  await go(app, "/together");
  await app.locator("#sharing div.border-b", { hasText: row }).getByRole("radio", { name: level, exact: true }).click();
  await app.getByRole("button", { name: "Save sharing" }).click();
  await expect(app.getByText("Sharing saved. Your summary updates in a moment.")).toBeVisible();
}

/** The stored rows of one of a person's tables, read from the Node-side database. */
function storedRows(server: FakePageServer, uid: string, table: string): Record<string, unknown>[] {
  return server.paths(`data/users/${uid}`)
    .filter((p) => p.split("/").length === 4 && p.split("/")[3].startsWith(`t~${table}~`))
    .flatMap((p) => (server.read(p)!.rows as Record<string, unknown>[]) ?? []);
}

test("published page — two people, private records, chosen sharing", async ({ browser }) => {
  test.setTimeout(300_000);
  const server = new FakePageServer();
  let today = "";
  let him!: Person;
  let her!: Person;

  await test.step("the app runs framed: page runtime in use, routes in memory", async () => {
    him = await open(browser, server, HUSBAND);
    const frame = appFrame(him.page);
    expect(await frame.evaluate(() => window.self !== window.top)).toBe(true);
    // Setup starts with the name from the page's own account — no name field.
    await expect(him.app.getByRole("heading", { name: "Welcome, Daniel." })).toBeVisible();
    await expect(him.app.getByLabel("Your name")).toHaveCount(0);
    // MemoryRouter: going to onboarding didn't touch the frame's address.
    expect(new URL(frame.url()).hash).toBe("");
    expect(new URL(frame.url()).pathname).toBe("/");
    today = await frame.evaluate(() => new Intl.DateTimeFormat("en-CA").format(new Date()));
    // The access check and the first profile went to his private space on the page.
    await expect.poll(() => server.read(`data/users/${HUSBAND.id}/hello`)).toBeTruthy();
    await expect.poll(() => (server.read(`data/users/${HUSBAND.id}/profile`)?.row as Record<string, unknown>)?.display_name).toBe("Daniel");
  });

  await test.step("he finishes setup", async () => {
    const app = him.app;
    await app.getByRole("button", { name: /Body, business and a 10K/ }).click();
    await app.getByRole("button", { name: "Continue" }).click();
    await expect(app.getByLabel("Confirm your starting weight")).toHaveValue("267");
    await app.getByLabel("Weigh-in date").fill(addDays(today, -7));
    await app.getByRole("button", { name: "Save & continue" }).click();
    await app.getByRole("button", { name: "Symptoms, not yet assessed", exact: true }).click();
    await app.getByRole("button", { name: "Save & continue" }).click();
    await expect(app.getByRole("heading", { name: "Business baseline" })).toBeVisible();
    await app.getByLabel("Current monthly revenue").fill("0");
    await app.getByRole("button", { name: "Save & continue" }).click();
    await expect(app.getByRole("heading", { name: "Daily system" })).toBeVisible();
    await app.getByRole("button", { name: "Save & continue" }).click();
    await expect(app.getByRole("heading", { name: "What your partner can see" })).toBeVisible();
    await expect(app.getByText("Your partner only sees a summary built from these choices", { exact: false })).toBeVisible();
    await app.getByRole("button", { name: "Save & continue" }).click();
    await app.getByRole("button", { name: "Finish" }).click();
    await expect(app.getByTestId("days-remaining")).toBeVisible();
    await settle(app);
  });

  await test.step("she opens the page on her own phone and sets up separately", async () => {
    her = await open(browser, server, WIFE);
    const app = her.app;
    await expect(app.getByRole("heading", { name: "Welcome, Maria." })).toBeVisible();
    await expect(app.getByLabel("Your name")).toHaveCount(0);
    await app.getByRole("button", { name: /My own transformation/ }).click();
    await app.getByRole("switch", { name: "Track business performance" }).click();
    await app.getByRole("button", { name: "Continue" }).click();
    await expect(app.getByLabel("Starting weight")).toHaveValue("");
    await app.getByLabel("Starting weight").fill("210");
    await app.getByLabel("Weigh-in date").fill(addDays(today, -7));
    await app.getByRole("button", { name: "Save & continue" }).click();
    await app.getByRole("button", { name: "Skip", exact: true }).click(); // training
    await expect(app.getByRole("heading", { name: "Business baseline" })).toBeVisible();
    await app.getByLabel("Current monthly revenue").fill("0");
    await app.getByRole("button", { name: "Save & continue" }).click();
    await app.getByRole("button", { name: "Save & continue" }).click(); // habits
    await app.getByRole("button", { name: "Save & continue" }).click(); // privacy defaults
    await app.getByRole("button", { name: "Finish" }).click();
    await expect(app.getByTestId("days-remaining")).toBeVisible();
    await settle(app);
  });

  await test.step("each logs a weigh-in and a sale", async () => {
    await logWeight(him.app, "262");
    await settle(him.app);
    await logSale(him.app, "1500", "500");
    await logWeight(her.app, "205");
    await settle(her.app);
    await logSale(her.app, "800", "800");

    await expect.poll(() => storedRows(server, HUSBAND.id, "weights").map((w) => w.weight).sort()).toEqual([262, 267]);
    await expect.poll(() => storedRows(server, WIFE.id, "weights").map((w) => w.weight).sort()).toEqual([205, 210]);
    await expect.poll(() => storedRows(server, HUSBAND.id, "transactions").map((t) => t.amount)).toEqual([1500]);
    await expect.poll(() => storedRows(server, WIFE.id, "transactions").map((t) => t.amount)).toEqual([800]);
  });

  await test.step("he shares weight in pounds and keeps business private; one journal entry shared, one not", async () => {
    await share(him.app, "Weight progress", "Pounds lost");
    await expect(him.app.locator("#sharing div.border-b", { hasText: "Business" }).getByRole("radio", { name: "Private" })).toBeChecked();
    await journal(him.app, "Proud", "Shared note: kept every promise this week.", true);
    await journal(him.app, "Worries", "Private note: worried about the quarter.", false);
    await expect.poll(() => (server.read(`shared/${HUSBAND.id}`) as { levels?: { weight?: string } } | undefined)?.levels?.weight).toBe("pounds");
  });

  await test.step("she sees his progress in pounds — and nothing he kept private", async () => {
    const app = her.app;
    await go(app, "/together");
    const his = app.getByRole("region", { name: "Daniel's shared progress" });
    await expect(his).toBeVisible();
    const fitness = his.locator(".card", { has: app.getByRole("heading", { name: "Daniel's progress" }) });
    // Started at 267 a week ago, 262 today (the only weigh-in in the 7-day window) → 5 lb of his 50 lb goal.
    await expect(fitness.getByText("5.0", { exact: true })).toBeVisible();
    await expect(fitness.getByText("lb lost")).toBeVisible();
    await expect(fitness.getByText("45 lb to go", { exact: false })).toBeVisible();
    await expect(his.getByText("Business · Not shared")).toBeVisible();
    await expect(his.getByText("Shared note: kept every promise this week.", { exact: false })).toBeVisible();
    // Nothing raw or private: no sale, no weigh-ins, no chart, no private journal.
    for (const secret of ["$1,500", "$500", "1,500", "262", "267", "Private note", "worried about the quarter"]) {
      await expect(his.getByText(secret, { exact: false })).toHaveCount(0);
    }
    await expect(his.locator(".recharts-surface")).toHaveCount(0);
    await expect(app.getByRole("heading", { name: "Daniel's recent workouts" })).toHaveCount(0);

    await go(app, "/");
    const card = app.locator(".card", { has: app.getByRole("heading", { name: "Daniel's progress" }) });
    await expect(card.getByText("5.0", { exact: true })).toBeVisible();
    await expect(card.getByText("lb lost")).toBeVisible();
    const page = await app.locator("main").innerText();
    expect(page).not.toContain("Private note");
    expect(page).not.toContain("$1,500");
  });

  await test.step("his private space can't be read or written from her browser, nor hers from his", async () => {
    const tryAll = async (other: string) => {
      const claude = (window as unknown as { claude: { use(n: string): Promise<any> } }).claude;
      const db = await claude.use("db");
      const out: Record<string, unknown> = {};
      out.profile = (await db.doc(`data/users/${other}/profile`).get()).exists;
      out.list = (await db.collection(`data/users/${other}`).get()).size;
      out.write = await db.doc(`data/users/${other}/profile`).set({ hacked: true }).then(() => "written", (e: { code: string }) => e.code);
      out.update = await db.doc(`data/users/${other}/profile`).update({ hacked: true }).then(() => "written", (e: { code: string }) => e.code);
      out.remove = await db.doc(`data/users/${other}/profile`).delete().then(() => "deleted", (e: { code: string }) => e.code);
      out.forge = await db.doc(`shared/${other}`).set({ partner_id: other, display_name: "Forged" }).then(() => "written", (e: { code: string }) => e.code);
      out.elsewhere = await db.doc("notes/n1").set({ x: 1 }).then(() => "written", (e: { code: string }) => e.code);
      out.summary = (await db.doc(`shared/${other}`).get()).exists;
      return out;
    };
    const denied = { profile: false, list: 0, write: "invalid_argument", update: "invalid_argument", remove: "invalid_argument", forge: "invalid_argument", elsewhere: "invalid_argument", summary: true };
    expect(await appFrame(him.page).evaluate(tryAll, WIFE.id)).toEqual(denied);
    expect(await appFrame(her.page).evaluate(tryAll, HUSBAND.id)).toEqual(denied);
    expect(server.read(`data/users/${WIFE.id}/profile`)?.hacked).toBeUndefined();
    expect(server.read(`shared/${WIFE.id}`)?.display_name).toBe("Maria");
    expect(server.read("notes/n1")).toBeUndefined();

    // The per-document limit holds in his own space too: over 256 KiB rejects, under it saves.
    const sizes = await appFrame(him.page).evaluate(async (me) => {
      const db = await (window as unknown as { claude: { use(n: string): Promise<any> } }).claude.use("db");
      const ref = db.doc(`data/users/${me}/probe`);
      const code = (n: number) => ref.set({ s: "x".repeat(n) }).then(() => "saved", (e: { code: string }) => e.code);
      const out = [await code(256 * 1024), await code(200_000)];
      await ref.delete();
      return out;
    }, HUSBAND.id);
    expect(sizes).toEqual(["invalid_argument", "saved"]);
    expect(server.read(`data/users/${HUSBAND.id}/probe`)).toBeUndefined();

    // What she publishes holds only what her (default) levels allow: weight as a percentage, no business, no raw entries.
    const hers = server.read(`shared/${WIFE.id}`) as Record<string, any>;
    expect(hers.levels).toMatchObject({ weight: "percent", business: "none" });
    expect(Object.keys(hers.weight ?? {}).sort()).toEqual(["has_goal", "pct_primary", "pct_stretch"]);
    expect(hers.business).toBeUndefined();
    expect(hers.weights).toEqual([]);
    expect(hers.journal).toEqual([]);
    expect(hers.workouts).toEqual([]);
    // No raw value of hers anywhere in it (weights, sale), nor any table of records.
    const text = JSON.stringify(hers);
    expect(text).not.toMatch(/:(205|210|800)[,}\]]/);
    for (const table of ["transactions", "payments", "customers", "nutrition", "symptoms", "checkins", "\"photos\":["]) {
      expect(text, `shared/${WIFE.id} carries "${table}"`).not.toContain(table);
    }
    // And his: pounds, no business, only the shared journal entry.
    const his = server.read(`shared/${HUSBAND.id}`) as Record<string, any>;
    expect(his.weight).toMatchObject({ has_goal: true, lost: 5, remaining: 45 });
    expect(his.weight.start_weight).toBeUndefined();
    expect(his.business).toBeUndefined();
    expect(his.weights).toEqual([]);
    expect(his.journal.map((j: { body: string }) => j.body)).toEqual(["Shared note: kept every promise this week."]);
    expect(JSON.stringify(his)).not.toMatch(/:(1500|500|262|267)[,}\]]/);
  });

  await test.step("he hides his weight; her open page shows “Not shared” without a reload", async () => {
    const app = her.app;
    await go(app, "/together");
    const his = app.getByRole("region", { name: "Daniel's shared progress" });
    await expect(his.getByText("lb lost")).toBeVisible();
    await share(him.app, "Weight progress", "Hidden");
    await expect(his.getByText("Weight · Not shared")).toBeVisible({ timeout: 15_000 });
    await expect(his.getByText("lb lost")).toHaveCount(0);
    await expect(his.getByText("5.0", { exact: true })).toHaveCount(0);
    expect((server.read(`shared/${HUSBAND.id}`) as Record<string, unknown>).weight).toBeUndefined();
  });

  await test.step("everything is still there after both reload", async () => {
    await him.page.reload();
    await her.page.reload();
    await expect(him.app.getByTestId("days-remaining")).toBeVisible();
    await expect(her.app.getByTestId("days-remaining")).toBeVisible();
    // His sale on his own dashboard.
    const biz = him.app.locator(".card", { has: him.app.getByRole("heading", { name: "Business", exact: true }) });
    await expect(biz.getByText("$1,500", { exact: true }).first()).toBeVisible();
    // Her own weigh-in and journal state, and his sharing choices as she sees them.
    await go(her.app, "/progress");
    await expect(her.app.getByText("205 lb").first()).toBeVisible();
    await go(her.app, "/together");
    const his = her.app.getByRole("region", { name: "Daniel's shared progress" });
    await expect(his.getByText("Weight · Not shared")).toBeVisible();
    await expect(his.getByText("Business · Not shared")).toBeVisible();
    await expect(his.getByText("Shared note: kept every promise this week.", { exact: false })).toBeVisible();
    await go(him.app, "/together");
    await expect(him.app.locator("#sharing div.border-b", { hasText: "Weight progress" }).getByRole("radio", { name: "Hidden" })).toBeChecked();
    const hers = him.app.getByRole("region", { name: "Maria's shared progress" });
    await expect(hers.getByText("Business · Not shared")).toBeVisible();
    await expect(hers.getByText("lb lost")).toHaveCount(0); // she shares a percentage only
    await expect(hers.getByText("Shared as a percentage only")).toBeVisible();
    // On the page nothing is kept in the browser's own storage.
    expect(await appFrame(him.page).evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).not.toContain("becoming-os");
  });

  await test.step("a JSON backup goes through the page's save prompt, not a browser download", async () => {
    await go(him.app, "/settings");
    await expect(him.app.getByText("All changes saved", { exact: false })).toBeVisible();
    await him.app.getByRole("button", { name: "Save backup (JSON)" }).click();
    await expect(him.app.getByText("Backup saved.")).toBeVisible();
    const saved = server.downloads.filter((d) => d.user === HUSBAND.id);
    expect(saved.map((d) => d.filename)).toEqual([`becoming-os-backup-${today}.json`]);
    const file = JSON.parse(saved[0].text!) as { app: string; profile: { display_name: string }; tables: Record<string, { weight?: number; amount?: number }[]> };
    expect(saved[0].size).toBeGreaterThan(0);
    expect(file.app).toBe("becoming-os");
    expect(file.profile.display_name).toBe("Daniel");
    expect(file.tables.weights.map((w) => w.weight).sort()).toEqual([262, 267]);
    expect(file.tables.transactions.map((t) => t.amount)).toEqual([1500]);
    // Declining the prompt is quiet and saves nothing.
    server.downloadAnswers.set(HUSBAND.id, ["declined"]);
    await him.app.getByRole("button", { name: "Save backup (JSON)" }).click();
    await expect(him.app.getByText("Backup not saved.")).toBeVisible();
    expect(server.downloads.filter((d) => d.user === HUSBAND.id)).toHaveLength(1);
    expect(him.plainDownloads).toEqual([]);
  });

  await test.step("nothing broke the frame's rules", async () => {
    expect(server.violations).toEqual([]);
    expect(him.outside).toEqual([]);
    expect(her.outside).toEqual([]);
    expect(her.plainDownloads).toEqual([]);
  });

  await test.step("a view-only visitor gets this browser's storage and is told why", async () => {
    const before = server.docs.size;
    const sam = await open(browser, server, VIEWER);
    await expect(sam.app.getByRole("heading", { name: "Welcome, Sam." })).toBeVisible();
    await sam.app.getByRole("button", { name: "Skip setup for now" }).click();
    await expect(sam.app.getByText("Your access to this page is view-only, so your records are saved in this browser instead.", { exact: false })).toBeVisible();
    await go(sam.app, "/together");
    await expect(sam.app.getByRole("heading", { name: "Sharing needs the published page" })).toBeVisible();
    await expect(sam.app.getByRole("region", { name: /shared progress/ })).toHaveCount(0);
    // Nothing of Sam's reached the page; his records are in this browser.
    expect(server.paths(`data/users/${VIEWER.id}`)).toEqual([]);
    expect(server.paths(`shared/${VIEWER.id}`)).toEqual([]);
    expect(server.docs.size).toBe(before);
    expect(await appFrame(sam.page).evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).toContain("becoming-os");
    expect(server.violations).toEqual([]);
    await sam.ctx.close();
  });

  await him.ctx.close();
  await her.ctx.close();
});

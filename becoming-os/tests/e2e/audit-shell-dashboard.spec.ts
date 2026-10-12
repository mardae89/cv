// Control-by-control audit of the app shell (bottom bar, + button, More menu,
// desktop sidebar, notification bell, save-status line, demo banner, storage
// notice), the Today dashboard, Milestones (filter, tiles, details, card save,
// the celebration dialog), Charts (every metric, ranges, custom dates, compare)
// and the shared pieces they use (Sheet, confirm dialog, toasts, RecordList),
// on a phone and on a desktop.
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, openFresh, rows, stored, toast, VIEWPORTS, type ViewportName } from "./helpers";

const SIZES: ViewportName[] = ["mobile", "desktop"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${MONTHS[m - 1]} ${day}, ${y}`;
};
const fmtShort = (d: string) => {
  const [, m, day] = d.split("-").map(Number);
  return `${MONTHS[m - 1]} ${day}`;
};
const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

/** Stored records land a moment after the screen updates; check often. */
const poll = <T,>(fn: () => Promise<T> | T) => expect.poll(fn, { intervals: [50, 100, 150, 250] });

const celebration = (page: Page) => page.getByRole("dialog", { name: "Milestone unlocked" });

/** Milestones are recorded a beat after the data that earns them; wait that beat, then clear any celebrations. */
async function clearCelebrations(page: Page) {
  let quiet = 0;
  for (let i = 0; i < 80 && quiet < 4; i++) {
    const d = celebration(page);
    if (await d.isVisible()) {
      quiet = 0;
      await d.getByRole("button", { name: /^(Continue|Next)$/ }).click();
    } else {
      quiet++;
      await page.waitForTimeout(200);
    }
  }
  await expect(celebration(page)).toHaveCount(0);
}

async function open(browser: Browser, vp: ViewportName, setup: "skip" | "demo") {
  const o = await openFresh(browser, vp, setup);
  await clearCelebrations(o.page);
  return o;
}

/** The app's "today" (the demo clock in demo mode). */
async function appToday(page: Page): Promise<string> {
  const p = (await stored(page)).profile as { demo_mode?: boolean; demo_today?: string } | null;
  if (p?.demo_mode && p.demo_today) return p.demo_today;
  return page.evaluate(() => new Date().toLocaleDateString("en-CA"));
}

/** On screen, not clipped, and nothing (bottom bar, + button, a backdrop) sits on top of it. */
async function expectUncovered(loc: Locator) {
  await expect(loc).toBeVisible();
  await expect(async () => {
    const r = await loc.evaluate((el) => {
      el.scrollIntoView({ block: "center", inline: "nearest" });
      const b = el.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return {
        inView: b.top >= 0 && b.bottom <= window.innerHeight + 0.5 && b.left >= -0.5 && b.right <= window.innerWidth + 0.5,
        hit: !!hit && (hit === el || el.contains(hit)),
        what: hit ? hit.outerHTML.slice(0, 140) : "nothing",
      };
    });
    expect(r.inView, `${loc} is clipped`).toBe(true);
    expect(r.hit, `${loc} is covered by ${r.what}`).toBe(true);
  }).toPass({ timeout: 6000 });
}

/** Tap on a phone, click on a desktop — after checking it can be reached. */
/** A sheet that is still sliding in moves its buttons between where a tap aims and where it lands; wait for it to arrive. */
async function sheetArrived(loc: Locator) {
  await loc.evaluate((el) => Promise.all((el.closest("[role=dialog]")?.getAnimations({ subtree: true }) ?? [])
    .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
    .map((a) => a.finished.catch(() => undefined))));
}

async function press(loc: Locator, vp: ViewportName) {
  await expect(loc).toBeVisible();
  await sheetArrived(loc);
  await expectUncovered(loc);
  if (vp === "mobile") await loc.tap();
  else await loc.click();
}

const hashPath = (page: Page) => new URL(page.url()).hash.replace(/^#/, "") || "/";
const h1 = (page: Page) => page.getByRole("heading", { level: 1 });

/** Each route and something that proves its page rendered. */
const PAGES: Record<string, (page: Page) => Locator> = {
  "/": (p) => p.getByTestId("days-remaining"),
  "/power": (p) => h1(p).filter({ hasText: "Power List" }),
  "/content": (p) => h1(p).filter({ hasText: "Content Bank" }),
  "/traffic": (p) => h1(p).filter({ hasText: "The four numbers" }),
  "/log": (p) => h1(p).filter({ hasText: "Record it" }),
  "/progress": (p) => h1(p).filter({ hasText: "Physical transformation" }),
  "/train": (p) => h1(p),
  "/business": (p) => h1(p).filter({ hasText: "Command centre" }),
  "/habits": (p) => h1(p).filter({ hasText: "Habits & routine" }),
  "/reviews": (p) => h1(p).filter({ hasText: /review/ }),
  "/roadmap": (p) => h1(p).filter({ hasText: "Seven-month roadmap" }),
  "/achievements": (p) => h1(p).filter({ hasText: "Milestones" }),
  "/charts": (p) => h1(p).filter({ hasText: "Charts" }),
  "/together": (p) => h1(p),
  "/settings": (p) => h1(p).filter({ hasText: "Your system" }),
  "/notifications": (p) => h1(p).filter({ hasText: "Reminders" }),
};

async function expectOn(page: Page, route: string) {
  const path = route.split(/[?#]/)[0];
  await expect.poll(() => hashPath(page).split(/[?#]/)[0]).toBe(path);
  await expect(PAGES[path](page).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
}

/** Moves around the app the way a person does (no reload), so every view must update on its own. */
async function navTo(page: Page, vp: ViewportName, route: string) {
  const label: Record<string, string> = {
    "/": "Today", "/log": "Log", "/progress": "Body", "/train": "Train", "/business": "Business", "/habits": "Habits",
    "/reviews": "Reviews", "/roadmap": "Roadmap", "/achievements": "Milestones", "/charts": "Charts", "/together": "Together", "/settings": "Settings",
  };
  if (vp === "desktop") {
    await page.locator("aside").getByRole("link", { name: label[route], exact: true }).click();
  } else {
    const bar = page.getByRole("navigation", { name: "Primary" });
    const direct = bar.getByRole("link", { name: label[route], exact: true });
    if (await direct.count()) await direct.tap();
    else {
      await bar.getByRole("button", { name: "More" }).tap();
      await page.getByRole("dialog", { name: "Everything" }).getByRole("link", { name: label[route], exact: true }).tap();
    }
  }
  await expectOn(page, route);
}

/** Saves audience totals through the Log page's form (answering the typo check when it asks). */
async function recordAudience(page: Page, vp: ViewportName, counts: Partial<Record<"Instagram followers" | "YouTube subscribers" | "Skool members", string>>, date?: string) {
  if (hashPath(page) !== "/log?tab=audience") {
    await navTo(page, vp, "/log");
    await page.getByRole("radio", { name: "Audience" }).click();
  }
  const form = page.getByRole("form", { name: "Audience form" });
  for (const [label, v] of Object.entries(counts)) await form.getByLabel(label, { exact: true }).fill(v!);
  if (date) await form.getByLabel("Reading date").fill(date);
  await press(form.getByRole("button", { name: "Save audience" }), vp);
  const check = page.getByRole("dialog", { name: "Double-check these numbers" });
  if (await check.isVisible({ timeout: 800 }).catch(() => false)) await check.getByRole("button", { name: "They're correct — save" }).click();
  await toast(page, /^Saved /);
}

const audienceCard = (page: Page) => page.locator(".card").filter({ has: page.getByRole("heading", { name: "Audience", exact: true }) }).first();

for (const vp of SIZES) {
  test.describe(`${vp}`, () => {
    test(`shell navigation reaches every page (${vp})`, async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      const business = !!(await stored(page)).profile?.business_enabled;
      expect(business).toBe(false);
      if (vp === "mobile") {
        const bar = page.getByRole("navigation", { name: "Primary" });
        await expect(page.locator("aside")).toBeHidden();
        // the bottom bar: Today, Power List, +, Content, More
        await expect(bar.getByRole("link")).toHaveCount(4);
        for (const [name, route] of [["Power List", "/power"], ["Content", "/content"], ["Log", "/log"], ["Today", "/"]] as const) {
          await press(bar.getByRole("link", { name, exact: true }), vp);
          await expectOn(page, route);
          await expect(bar.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
        }
        await expect(bar.getByRole("link", { name: "Business" })).toHaveCount(0);
        // More: every page not on the bar, plus Alerts
        const more = bar.getByRole("button", { name: "More" });
        const sheet = page.getByRole("dialog", { name: "Everything" });
        const inMore = ["Traffic", "Body", "Train", "Habits", "Reviews", "Roadmap", "Milestones", "Charts", "Together", "Settings", "Alerts"];
        const routeOf: Record<string, string> = {
          Traffic: "/traffic", Body: "/progress", Train: "/train", Habits: "/habits", Reviews: "/reviews", Roadmap: "/roadmap",
          Milestones: "/achievements", Charts: "/charts", Together: "/together", Settings: "/settings", Alerts: "/notifications",
        };
        await press(more, vp);
        await expect(sheet.getByRole("link")).toHaveCount(inMore.length);
        await expect(sheet.getByRole("link", { name: /^(Power List|Content Bank)$/ })).toHaveCount(0);
        for (const name of inMore) {
          if (!(await sheet.isVisible())) await press(more, vp);
          await press(sheet.getByRole("link", { name, exact: true }), vp);
          await expect(sheet).toHaveCount(0);
          await expectOn(page, routeOf[name]);
          await expect(more).toHaveAttribute("aria-current", "page");
        }
        // close the sheet: X, Escape, tapping outside
        await press(more, vp);
        await press(sheet.getByRole("button", { name: "Close" }), vp);
        await expect(sheet).toHaveCount(0);
        await press(more, vp);
        await page.keyboard.press("Escape");
        await expect(sheet).toHaveCount(0);
        await press(more, vp);
        await page.mouse.click(195, 60);
        await expect(sheet).toHaveCount(0);
        await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
        // the last link in the sheet is reachable on a short phone
        await press(more, vp);
        await expectUncovered(sheet.getByRole("link", { name: "Alerts" }));
        await sheet.getByRole("button", { name: "Close" }).tap();
        // bell and wordmark
        await press(page.getByRole("link", { name: /^Notifications/ }), vp);
        await expectOn(page, "/notifications");
        await press(page.getByRole("link", { name: "BECOMING OS home" }), vp);
        await expectOn(page, "/");
      } else {
        await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();
        const side = page.locator("aside");
        const links: [string, string][] = [["Power List", "/power"], ["Content Bank", "/content"], ["Traffic", "/traffic"], ["Log", "/log"], ["Body", "/progress"], ["Train", "/train"], ["Habits", "/habits"], ["Reviews", "/reviews"],
          ["Roadmap", "/roadmap"], ["Milestones", "/achievements"], ["Charts", "/charts"], ["Together", "/together"], ["Settings", "/settings"], ["Today", "/"]];
        await expect(side.getByRole("link", { name: "Business" })).toHaveCount(0);
        for (const [name, route] of links) {
          await press(side.getByRole("link", { name, exact: true }), vp);
          await expectOn(page, route);
          await expect(side.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
        }
        await press(side.getByRole("link", { name: /^Notifications/ }), vp);
        await expectOn(page, "/notifications");
        await expect(side.getByRole("link", { name: /^Notifications/ })).toHaveAttribute("aria-current", "page");
        await press(side.getByRole("link", { name: "BECOMING OS home" }), vp);
        await expectOn(page, "/");
        // where records are kept
        await expect(side).toContainText("Saved in this browser only");
      }
      expect(errors).toEqual([]);
    });

    test(`demo banner, business nav, audience card on Business, unread count (${vp})`, async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "demo");
      const today = await appToday(page);
      const banner = page.getByText(/DEMO ACCOUNT — sample data only/);
      await expect(banner).toContainText(fmtDate(today));
      // business is on in the sample data: it gets a place on the bar / in the sidebar
      await navTo(page, vp, "/business");
      // the audience card there shows the latest stored totals
      const readings = await rows(page, "audience");
      const latest = (platform: string) => readings.filter((r) => r.platform === platform)
        .sort((a, b) => (String(a.recorded_on) < String(b.recorded_on) ? 1 : -1))[0];
      for (const p of ["instagram", "youtube", "skool"]) {
        await expect(audienceCard(page).getByText(Number(latest(p).count).toLocaleString("en-US"), { exact: true })).toBeVisible();
      }
      await expect(audienceCard(page)).toContainText(`Last recorded ${fmtDate(today)}`);
      // unread count on the bell matches the reminders list
      const unread = (await rows(page, "notifications")).filter((n) => !n.read_at).length;
      expect(unread).toBeGreaterThan(0);
      if (vp === "mobile") await expect(page.getByRole("link", { name: `Notifications, ${unread} unread` })).toBeVisible();
      else await expect(page.locator("aside").getByRole("link", { name: /^Notifications/ })).toContainText(String(unread));
      await navTo(page, vp, "/");
      // Reset → the sample-data section of Settings, then clearing it removes the banner
      await press(banner.getByRole("link", { name: "Reset" }), vp);
      await expectOn(page, "/settings");
      await expect(page.locator("#demo")).toBeInViewport({ ratio: 0.2 });
      await page.locator("#demo").getByRole("button", { name: "Clear sample data" }).click();
      await page.getByRole("dialog", { name: "Clear the sample data?" }).getByRole("button", { name: "Clear sample data" }).click();
      await expect(banner).toHaveCount(0);
      expect(errors).toEqual([]);
    });

    test(`today: setup links, tasks, quick actions and card links (${vp})`, async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      const today = await appToday(page);
      await expect(page.getByText("Finish setting up when you're ready")).toBeVisible();
      for (const [name, hash] of [["starting weight", "body"], ["training readiness", "training"]] as const) {
        await press(page.getByRole("link", { name, exact: true }), vp);
        await expectOn(page, "/settings");
        await expect(page.locator(`#${hash}`)).toBeInViewport({ ratio: 0.1 });
        await navTo(page, vp, "/");
      }
      // nothing scheduled yet → set up habits
      await press(page.getByRole("link", { name: "Set up habits" }), vp);
      await expectOn(page, "/habits");
      await navTo(page, vp, "/");

      // tasks: add (button and Enter), blank is ignored, toggle, delete
      const input = page.getByRole("textbox", { name: "New task" });
      await press(page.getByRole("button", { name: "Add task" }), vp);
      expect(await rows(page, "tasks")).toHaveLength(0);
      await input.fill("Call the gym");
      await press(page.getByRole("button", { name: "Add task" }), vp);
      await expect(page.getByText("Call the gym", { exact: true })).toBeVisible();
      await expect(input).toHaveValue("");
      await input.fill("Post a reel");
      await input.press("Enter");
      await expect(page.getByText("Post a reel", { exact: true })).toBeVisible();
      await poll(async () => (await rows(page, "tasks")).map((t) => `${t.title}|${t.due_date}`).sort()).toEqual([`Call the gym|${today}`, `Post a reel|${today}`]);
      await expect(page.getByText("0/2", { exact: true })).toBeVisible();
      const tg = page.getByRole("button", { name: "Toggle Call the gym" });
      await press(tg, vp);
      await expect(tg).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByText("1/2", { exact: true })).toBeVisible();
      await poll(async () => (await rows(page, "tasks")).find((t) => t.title === "Call the gym")?.completed_on).toBe(today);
      await press(page.getByRole("button", { name: "Delete task Post a reel" }), vp);
      await expect(page.getByText("Post a reel", { exact: true })).toHaveCount(0);
      await expect(page.getByText("1/1", { exact: true })).toBeVisible();
      await poll(async () => (await rows(page, "tasks")).length).toBe(1);
      await page.reload();
      await expect(page.getByRole("button", { name: "Toggle Call the gym" })).toHaveAttribute("aria-pressed", "true");
      await press(page.getByRole("button", { name: "Toggle Call the gym" }), vp);
      await expect(page.getByRole("button", { name: "Toggle Call the gym" })).toHaveAttribute("aria-pressed", "false");
      await poll(async () => (await rows(page, "tasks"))[0]?.completed_on ?? null).toBe(null);

      // quick actions (no Sale without business)
      await expect(page.getByRole("link", { name: "Sale" })).toHaveCount(0);
      for (const [name, tab, radio] of [["Weight", "body", "Body"], ["Workout", "training", "Training"], ["Meal", "nutrition", "Nutrition"], ["Journal", "mind", "Habits & mind"]] as const) {
        await press(page.getByRole("link", { name, exact: true }), vp);
        await expectOn(page, "/log");
        expect(hashPath(page)).toBe(`/log?tab=${tab}`);
        await expect(page.getByRole("radio", { name: radio })).toHaveAttribute("aria-checked", "true");
        await navTo(page, vp, "/");
      }
      // card and section links
      for (const [name, route] of [["Set starting weight →", "/settings"], ["Open Training", "/train"], ["Open Audience", "/log"], ["Record your counts →", "/log"],
        ["All charts →", "/charts"], ["Weekly review →", "/reviews"], [/XP →$/, "/achievements"]] as const) {
        await press(page.getByRole("link", { name }).first(), vp);
        await expectOn(page, route);
        if (route === "/log") await expect(page.getByRole("radio", { name: "Audience" })).toHaveAttribute("aria-checked", "true");
        await navTo(page, vp, "/");
      }
      // device mode: no partner card
      await expect(page.getByText(/'s progress$/)).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Open .*'s progress/ })).toHaveCount(0);
      await expectNoHorizontalScroll(page);
      expect(errors).toEqual([]);
    });

    test(`today: audience counts and milestones update without reload (${vp})`, async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      const today = await appToday(page);
      const card = audienceCard(page);
      await expect(card).toContainText("No followers yet");
      await expect(card).toContainText("No subscribers yet");
      await expect(card).toContainText("No members yet");

      await recordAudience(page, vp, { "Instagram followers": "1,200", "YouTube subscribers": "80", "Skool members": "12" }, addDays(today, -40));
      await recordAudience(page, vp, { "Instagram followers": "1.5K", "YouTube subscribers": "95" }, today);
      await navTo(page, vp, "/");
      await expect(card.getByText("1,500", { exact: true })).toBeVisible();
      await expect(card).toContainText("+300 in 30 days");
      await expect(card.getByText("95", { exact: true })).toBeVisible();
      await expect(card.getByText("12", { exact: true })).toBeVisible();
      await expect(card.getByRole("link", { name: "Update counts →" })).toBeVisible();
      // next milestone reflects audience progress
      await expect(page.locator(".card").filter({ hasText: "Next milestone" })).toContainText(/YouTube subscribers|Skool members|Instagram followers/);

      // edit then delete the newest Instagram reading on the Log page; Today follows
      await navTo(page, vp, "/log");
      await page.getByRole("radio", { name: "Audience" }).click();
      const list = page.getByRole("listitem").filter({ hasText: "Instagram · 1,500 followers" });
      await press(list.getByRole("button", { name: "Edit" }), vp);
      const edit = page.getByRole("dialog", { name: "Edit reading" });
      await edit.getByLabel("Instagram followers", { exact: true }).fill("1600");
      await press(edit.getByRole("button", { name: "Save changes" }), vp);
      await expect(edit).toHaveCount(0);
      await navTo(page, vp, "/");
      await expect(card.getByText("1,600", { exact: true })).toBeVisible();
      await navTo(page, vp, "/log");
      await page.getByRole("radio", { name: "Audience" }).click();
      await press(page.getByRole("listitem").filter({ hasText: "Instagram · 1,600 followers" }).getByRole("button", { name: "Delete" }), vp);
      const confirm = page.getByRole("dialog", { name: "Delete this reading?" });
      // Cancel keeps it
      await press(confirm.getByRole("button", { name: "Cancel" }), vp);
      await expect(confirm).toHaveCount(0);
      await expect(page.getByText("Instagram · 1,600 followers")).toBeVisible();
      await press(page.getByRole("listitem").filter({ hasText: "Instagram · 1,600 followers" }).getByRole("button", { name: "Delete" }), vp);
      await press(confirm.getByRole("button", { name: "Delete" }), vp);
      await toast(page, "Deleted.");
      await poll(async () => (await rows(page, "audience")).filter((r) => r.platform === "instagram").map((r) => r.count)).toEqual([1200]);
      await navTo(page, vp, "/");
      await expect(card.getByText("1,200", { exact: true })).toBeVisible();
      await expect(card).toContainText(`followers · ${fmtDate(addDays(today, -40))}`);
      // everything survives a reload
      await page.reload();
      await clearCelebrations(page);
      await expect(card.getByText("1,200", { exact: true })).toBeVisible();
      await expect(card.getByText("95", { exact: true })).toBeVisible();
      expect(errors).toEqual([]);
    });

    test(`today with sample data: habits, links, this week (${vp})`, async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "demo");
      const today = await appToday(page);
      // every habit on today's list toggles both ways, persists, and moves the ring
      const todayCard = page.locator(".card").filter({ hasText: "Daily execution" }).first();
      const habits = todayCard.locator("li > button[aria-pressed]");
      const n = await habits.count();
      expect(n).toBeGreaterThan(0);
      const first = habits.first();
      const name = (await first.locator("span.flex-1").textContent())!;
      const before = await first.getAttribute("aria-pressed");
      const ringText = async () => (await todayCard.locator("text=/^\\d+\\/\\d+$/").first().textContent())!;
      const r0 = await ringText();
      await press(first, vp);
      await expect(first).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
      await expect.poll(ringText).not.toBe(r0);
      const habitRows = (await stored(page)).lists.habits ?? [];
      const hid = habitRows.find((h) => h.name === name)!.id;
      await poll(async () => (await rows(page, "completions")).some((c) => c.habit_id === hid && c.completed_on === today)).toBe(before !== "true");
      await page.reload();
      await clearCelebrations(page);
      await expect(habits.filter({ hasText: name })).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
      await press(habits.filter({ hasText: name }), vp);
      await expect(habits.filter({ hasText: name })).toHaveAttribute("aria-pressed", before!);
      await expect.poll(ringText).toBe(r0);
      // the remaining habit buttons are each reachable and respond
      for (let i = 1; i < n; i++) {
        const b = habits.nth(i);
        const was = await b.getAttribute("aria-pressed");
        await press(b, vp);
        await expect(b).toHaveAttribute("aria-pressed", was === "true" ? "false" : "true");
        await press(b, vp);
        await expect(b).toHaveAttribute("aria-pressed", was!);
      }
      await clearCelebrations(page);
      // quick action for a sale (business on)
      await press(page.getByRole("link", { name: "Sale", exact: true }), vp);
      expect(hashPath(page)).toBe("/log?tab=business");
      await navTo(page, vp, "/");
      for (const [nm, route] of [["Open My fitness", "/progress"], ["Open Business", "/business"], ["Open Training", "/train"], ["Update counts →", "/log"]] as const) {
        await press(page.getByRole("link", { name: nm }), vp);
        await expectOn(page, route);
        await navTo(page, vp, "/");
      }
      // the chapter link sits in the countdown on wider screens only
      const chapter = page.getByRole("link", { name: /^Chapter:/ });
      if (vp === "desktop") {
        await press(chapter, vp);
        await expectOn(page, "/roadmap");
        await navTo(page, vp, "/");
      } else await expect(chapter).toBeHidden();
      const overdue = page.getByRole("link", { name: "review", exact: true });
      if (await overdue.count()) {
        await press(overdue, vp);
        await expectOn(page, "/habits");
        await navTo(page, vp, "/");
      }
      // this week: the unlocked list matches stored milestones
      const week = page.locator("section").filter({ has: page.getByRole("heading", { name: "This week" }) });
      const ws = (() => { const d = new Date(`${today}T12:00:00Z`); const k = (d.getUTCDay() + 6) % 7; return addDays(today, -k); })();
      const thisWeek = (await rows(page, "achievements")).filter((a) => a.category !== "level" && String(a.achieved_on) >= ws && String(a.achieved_on) <= today);
      for (const a of thisWeek) await expect(week.getByText(String(a.title), { exact: true })).toBeVisible();
      await expectNoHorizontalScroll(page);
      expect(errors).toEqual([]);
    });

    test(`milestones: filter, tiles, details, saved card (${vp})`, async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "demo");
      await navTo(page, vp, "/achievements");
      const filters = page.getByRole("radiogroup").first();
      const opts = ["All", "Power List", "Weight", "Business", "Audience", "Athletic", "Consistency", "Levels"];
      await expect(filters.getByRole("radio")).toHaveText(opts);
      const tiles = page.locator("div.grid > button");
      const total = await tiles.count();
      const counts: Record<string, number> = {};
      for (const o of opts.slice(1)) {
        await press(filters.getByRole("radio", { name: o }), vp);
        await expect(filters.getByRole("radio", { name: o })).toHaveAttribute("aria-checked", "true");
        await expect(tiles.first()).toBeVisible();
        counts[o] = await tiles.count();
        const labels = await tiles.locator("span.eyebrow").allTextContents();
        expect(labels.every((l) => l.startsWith(`${o} ·`)), `${o}: ${labels.join(", ")}`).toBe(true);
      }
      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(total);
      await expectNoHorizontalScroll(page);
      // Audience shows all three platforms
      await press(filters.getByRole("radio", { name: "Audience" }), vp);
      for (const p of ["Instagram", "YouTube", "Skool"]) await expect(tiles.filter({ hasText: `Audience · ${p}` }).first()).toBeVisible();
      // a locked tile can't be opened; an unlocked one opens its details
      const locked = tiles.filter({ has: page.locator("svg.lucide-lock") }).first();
      await expect(locked).toBeDisabled();
      const unlocked = tiles.filter({ hasNot: page.locator("svg.lucide-lock") }).first();
      const title = (await unlocked.locator("div.text-\\[15px\\]").textContent())!;
      const sheet = page.getByRole("dialog", { name: "Milestone" });
      await press(unlocked, vp);
      await expect(sheet.getByRole("heading", { name: title })).toBeVisible();
      await expect(sheet).toContainText(/Instagram \d|YouTube \d|Skool \d/);
      // saving the card downloads a PNG
      const dl = page.waitForEvent("download");
      await press(sheet.getByRole("button", { name: "Save card" }), vp);
      const file = await dl;
      expect(file.suggestedFilename()).toMatch(/^becoming-audience-.*\.png$/);
      const share = sheet.getByRole("button", { name: "Share" });
      if (await share.count()) await expectUncovered(share);
      // three ways to close
      await press(sheet.getByRole("button", { name: "Close" }), vp);
      await expect(sheet).toHaveCount(0);
      await press(unlocked, vp);
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);
      await press(unlocked, vp);
      await page.mouse.click(20, 20);
      await expect(sheet).toHaveCount(0);
      // "All" brings every tile back
      await press(filters.getByRole("radio", { name: "All" }), vp);
      await expect(tiles).toHaveCount(total);
      // timeline entries open the same details
      const timeline = page.getByTestId("timeline");
      const entry = timeline.getByRole("button").first();
      const etitle = (await entry.locator("div").nth(1).textContent())!;
      await press(entry, vp);
      await expect(sheet.getByRole("heading", { name: etitle })).toBeVisible();
      await sheet.getByRole("button", { name: "Close" }).click();
      expect(await timeline.getByRole("button").count()).toBe((await rows(page, "achievements")).length);
      // how XP works
      const how = page.getByText("How XP works");
      await press(how, vp);
      await expect(page.getByText(/No points for extra training volume/)).toBeVisible();
      await press(how, vp);
      await expect(page.getByText(/No points for extra training volume/)).toBeHidden();
      expect(errors).toEqual([]);
    });

    test(`celebration: Next, Save card, Continue; audience filter updates (${vp})`, async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      const today = await appToday(page);
      await recordAudience(page, vp, { "Skool members": "40" }, addDays(today, -5));
      await clearCelebrations(page);
      await recordAudience(page, vp, { "Skool members": "300" }, today);
      // 100 and 250 members are both earned by the second reading
      const d = celebration(page);
      await expect(d).toBeVisible({ timeout: 5000 });
      await expect(d).toContainText(/(100|250) Skool members/);
      await expect(d).toContainText("Skool 300");
      // on a very short screen the dialog scrolls, so its buttons can still be reached
      const size = page.viewportSize()!;
      await page.setViewportSize({ width: size.width, height: 420 });
      await expectUncovered(d.getByRole("button", { name: /^(Next|Continue)$/ }));
      await page.setViewportSize(size);
      const continueOrNext = d.getByRole("button", { name: /^(Next|Continue)$/ });
      await expectUncovered(continueOrNext);
      await expect(continueOrNext).toHaveText("Next");
      const dl = page.waitForEvent("download");
      await press(d.getByRole("button", { name: "Save card" }), vp);
      expect((await dl).suggestedFilename()).toMatch(/^becoming-audience-skool-(100|250)\.png$/);
      const seen: string[] = [];
      for (let i = 0; i < 5 && (await d.isVisible()); i++) {
        seen.push((await d.getByRole("heading").textContent())!);
        const b = d.getByRole("button", { name: /^(Next|Continue)$/ });
        await expectUncovered(b);
        await press(b, vp);
        if (seen.length < 5) await expect(d.getByRole("heading")).not.toHaveText(seen[seen.length - 1]).catch(() => undefined);
      }
      await expect(d).toHaveCount(0);
      expect(seen).toEqual(expect.arrayContaining(["100 Skool members", "250 Skool members"]));
      await poll(async () => (await rows(page, "achievements")).filter((a) => String(a.key).startsWith("audience.skool")).map((a) => !!a.celebrated_at)).toEqual([true, true]);
      await page.reload();
      await page.waitForTimeout(700);
      await expect(d).toHaveCount(0);
      // the Milestones page shows them under Audience straight away
      await navTo(page, vp, "/achievements");
      await page.getByRole("radiogroup").first().getByRole("radio", { name: "Audience" }).click();
      const tiles = page.locator("div.grid > button");
      await expect(tiles.filter({ hasText: "100 Skool members" })).toBeEnabled();
      await expect(tiles.filter({ hasText: "250 Skool members" })).toBeEnabled();
      await expect(tiles.filter({ hasText: "500 Skool members" })).toBeDisabled();
      await expect(tiles.filter({ hasText: "500 Skool members" })).toContainText("300 members of 500 members");
      // correcting the record that earned one takes it away
      await navTo(page, vp, "/log");
      await page.getByRole("radio", { name: "Audience" }).click();
      await press(page.getByRole("listitem").filter({ hasText: "Skool · 300 members" }).getByRole("button", { name: "Delete" }), vp);
      await page.getByRole("dialog", { name: "Delete this reading?" }).getByRole("button", { name: "Delete" }).click();
      await navTo(page, vp, "/achievements");
      await page.getByRole("radiogroup").first().getByRole("radio", { name: "Audience" }).click();
      await expect(tiles.filter({ hasText: "100 Skool members" })).toBeDisabled();
      await poll(async () => (await rows(page, "achievements")).filter((a) => String(a.key).startsWith("audience.")).length).toBe(0);
      expect(errors).toEqual([]);
    });

    test(`nested sheets: Escape closes only the top one (${vp})`, async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      const today = await appToday(page);
      await recordAudience(page, vp, { "YouTube subscribers": "100" }, addDays(today, -3));
      await recordAudience(page, vp, { "YouTube subscribers": "110" }, today);
      await clearCelebrations(page);
      await press(page.getByRole("listitem").filter({ hasText: "YouTube · 110 subscribers" }).getByRole("button", { name: "Edit" }), vp);
      const edit = page.getByRole("dialog", { name: "Edit reading" });
      const input = edit.getByLabel("YouTube subscribers", { exact: true });
      await input.fill("11000");
      await expectUncovered(edit.getByRole("button", { name: "Save changes" }));
      await press(edit.getByRole("button", { name: "Save changes" }), vp);
      const check = page.getByRole("dialog", { name: "Double-check these numbers" });
      await expect(check).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(check).toHaveCount(0);
      await expect(edit).toBeVisible();
      await expect(input).toHaveValue("11000");
      await input.fill("120");
      await press(edit.getByRole("button", { name: "Save changes" }), vp);
      await expect(edit).toHaveCount(0);
      await poll(async () => (await rows(page, "audience")).map((r) => r.count).sort((a, b) => Number(a) - Number(b))).toEqual([100, 120]);
      await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
      expect(errors).toEqual([]);
    });

    test(`charts: every metric, ranges, custom dates, compare (${vp})`, async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "demo");
      const today = await appToday(page);
      await navTo(page, vp, "/charts");
      const metric = page.getByLabel("Metric");
      const options = await metric.locator("option").evaluateAll((os) => os.map((o) => ({ v: (o as HTMLOptionElement).value, l: o.textContent! })));
      expect(options.map((o) => o.v)).toEqual(expect.arrayContaining(["audience.instagram", "audience.youtube", "audience.skool", "revenue", "trend", "milestones"]));
      const chartTitle = page.locator("section.card h3");
      const headline = page.locator(".card").filter({ hasText: "· this period" }).first();
      for (const o of options) {
        await metric.selectOption(o.v);
        await expect(chartTitle).toHaveText(o.l);
        await expect(headline).toBeVisible();
      }
      // the audience metrics read the stored readings: change over the range
      const ig = (await rows(page, "audience")).filter((r) => r.platform === "instagram").sort((a, b) => (String(a.recorded_on) < String(b.recorded_on) ? -1 : 1));
      await metric.selectOption("audience.instagram");
      await expect(page.locator("svg.recharts-surface").first()).toBeVisible();
      const range = page.getByRole("group", { name: "Range" });
      await press(range.getByRole("radio", { name: "30D" }), vp);
      const in30 = ig.filter((r) => String(r.recorded_on) >= addDays(today, -29));
      const change = Number(in30[in30.length - 1].count) - Number(in30[0].count);
      await expect(headline).toContainText(`Change · this period${change.toLocaleString("en-US")}`);
      await expect(headline).toContainText(`${fmtShort(addDays(today, -29))} – ${fmtShort(today)}`);
      await press(range.getByRole("radio", { name: "90D" }), vp);
      await expect(headline).toContainText(`${fmtShort(addDays(today, -89))} – ${fmtShort(today)}`);
      await press(range.getByRole("radio", { name: "Mission" }), vp);
      await expect(headline).toContainText(`– ${fmtShort(today)}`);
      // custom: both dates accept a value and move the numbers
      await press(range.getByRole("radio", { name: "Custom" }), vp);
      const from = page.getByLabel("From", { exact: true });
      const to = page.getByLabel("To", { exact: true });
      await expectUncovered(from);
      await expectUncovered(to);
      const f = String(ig[1].recorded_on), t = String(ig[3].recorded_on);
      await from.fill(f);
      await to.fill(t);
      await expect(from).toHaveValue(f);
      await expect(to).toHaveValue(t);
      await expect(headline).toContainText(`${fmtShort(f)} – ${fmtShort(t)}`);
      await expect(headline).toContainText(`${(Number(ig[3].count) - Number(ig[1].count)).toLocaleString("en-US")}`);
      // a backwards range is explained, not silently blank
      await from.fill(addDays(t, 5));
      await expect(page.getByText("Pick a start date on or before the end date.")).toBeVisible();
      await expect(from).toHaveValue(addDays(t, 5));
      // a cleared box says so and the chart falls back instead of breaking
      await from.fill("");
      await expect(page.getByText("Enter a start date.")).toBeVisible();
      await expect(chartTitle).toHaveText("Instagram followers");
      await from.fill(f);
      await expect(page.getByText("Pick a start date on or before the end date.")).toHaveCount(0);
      await expect(page.getByText("Enter a start date.")).toHaveCount(0);
      // compare adds the previous period, its total and the difference
      const sw = page.getByRole("switch", { name: /Compare with the previous period/ });
      await press(sw, vp);
      await expect(sw).toHaveAttribute("aria-checked", "true");
      await expect(page.getByText("Change · previous")).toBeVisible();
      await expect(page.getByText("Difference")).toBeVisible();
      await expect(page.locator(".recharts-legend-wrapper")).toContainText("Previous period");
      await press(sw, vp);
      await expect(page.getByText("Difference")).toHaveCount(0);
      // a bar metric with compare
      await metric.selectOption("revenue");
      await press(range.getByRole("radio", { name: "Mission" }), vp);
      await press(sw, vp);
      await expect(page.getByText("Total · previous")).toBeVisible();
      await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
      await expectNoHorizontalScroll(page);
      // a long history list shows the newest, then everything on request
      await navTo(page, vp, "/log");
      await page.getByRole("radio", { name: "Audience" }).click();
      const all = (await rows(page, "audience")).length;
      expect(all).toBeGreaterThan(12);
      const recent = page.locator("ul.divide-y").filter({ hasText: "Instagram ·" }).last();
      await expect(recent.getByRole("button", { name: "Edit" })).toHaveCount(12);
      await press(recent.getByRole("button", { name: `Show all ${all}` }), vp);
      await expect(recent.getByRole("button", { name: "Edit" })).toHaveCount(all);
      await expect(recent.getByRole("button", { name: /^Show all/ })).toHaveCount(0);
      expect(errors).toEqual([]);
    });

    test(`charts update the moment a record is added or deleted; early readings count (${vp})`, async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      const today = await appToday(page);
      const early = addDays(today, -20);
      await recordAudience(page, vp, { "YouTube subscribers": "200" }, early);
      await recordAudience(page, vp, { "YouTube subscribers": "260" }, today);
      await clearCelebrations(page);
      await navTo(page, vp, "/charts");
      await page.getByLabel("Metric").selectOption("audience.youtube");
      const headline = page.locator(".card").filter({ hasText: "· this period" }).first();
      // the mission view includes readings from before the mission started
      await expect(headline).toContainText("Change · this period60");
      await expect(headline).toContainText(fmtShort(early));
      await navTo(page, vp, "/log");
      await page.getByRole("radio", { name: "Audience" }).click();
      await press(page.getByRole("listitem").filter({ hasText: "YouTube · 260 subscribers" }).getByRole("button", { name: "Delete" }), vp);
      await page.getByRole("dialog", { name: "Delete this reading?" }).getByRole("button", { name: "Delete" }).click();
      await navTo(page, vp, "/charts");
      await page.getByLabel("Metric").selectOption("audience.youtube");
      await expect(headline).toContainText("Change · this period0");
      expect(errors).toEqual([]);
    });

    test(`storage notice dismisses; a failed save is shown (${vp})`, async ({ browser }) => {
      // storage blocked → the notice explains it and can be dismissed
      const ctx = await browser.newContext(VIEWPORTS[vp]);
      await ctx.addInitScript(() => Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true }));
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/");
      await page.getByRole("button", { name: "Skip setup for now" }).click();
      const notice = page.getByText(/This browser is blocking storage/);
      await expect(notice).toBeVisible();
      await press(page.getByRole("button", { name: "Dismiss notice" }), vp);
      await expect(notice).toHaveCount(0);
      await navTo(page, vp, "/charts");
      await expect(notice).toHaveCount(0);
      await ctx.close();

      // a save that fails is shown at the top, then clears once a save works
      const { page: p2, errors: e2 } = await open(browser, vp, "skip");
      await p2.evaluate(() => {
        const w = window as unknown as { __failPuts: boolean };
        w.__failPuts = true;
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...a: Parameters<typeof put>) {
          if (w.__failPuts) throw new DOMException("Disk is full", "QuotaExceededError");
          return put.apply(this, a);
        };
      });
      await p2.getByRole("textbox", { name: "New task" }).fill("Will it save");
      await p2.getByRole("textbox", { name: "New task" }).press("Enter");
      const banner = p2.getByText("Not saved yet.");
      await expect(banner).toBeVisible();
      await expectUncovered(banner);
      await p2.evaluate(() => ((window as unknown as { __failPuts: boolean }).__failPuts = false));
      await p2.getByRole("textbox", { name: "New task" }).fill("Second try");
      await p2.getByRole("textbox", { name: "New task" }).press("Enter");
      await expect(banner).toHaveCount(0, { timeout: 15_000 });
      await poll(async () => (await rows(p2, "tasks")).map((t) => t.title).sort()).toEqual(["Second try", "Will it save"]);
      expect(errors).toEqual([]);
      // the failed save is reported in the console by design; nothing else may be
      expect(e2.filter((e) => !/Disk is full|QuotaExceeded/.test(e))).toEqual([]);
    });
  });
}

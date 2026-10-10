// End-to-end checks for the 15 "definition of done" workflows in device mode:
// no accounts and no server, just this browser's own storage. Each person is a
// fresh browser context (so a fresh, empty IndexedDB), and stored records are
// read straight from that IndexedDB or confirmed by reloading the page.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { addDays, countdown, monthStart, weekStart } from "../../src/lib/dates";

const ME = { name: "Test Husband" };
const WIFE = { name: "Test Wife" };

async function settle(page: Page) {
  // Dismiss any milestone celebrations that are showing.
  for (let i = 0; i < 12; i++) {
    const d = page.getByRole("dialog", { name: "Milestone unlocked" });
    if (!(await d.isVisible().catch(() => false))) return;
    await d.getByRole("button", { name: /^(Continue|Next)$/ }).click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(500);
  }
}

async function celebrate(page: Page, title: RegExp | string) {
  // Waits for the celebration for `title`, stepping past any other one first.
  // Decides from one snapshot of the dialog so it can't click past the one it wants.
  const d = page.getByRole("dialog", { name: "Milestone unlocked" });
  const matches = (text: string) => (typeof title === "string" ? text.includes(title) : title.test(text));
  await expect(async () => {
    const text = await d.innerText({ timeout: 500 }).catch(() => null);
    if (text !== null && matches(text)) return;
    if (text !== null) await d.getByRole("button", { name: /^(Continue|Next)$/ }).click({ timeout: 2000 });
    throw new Error(`waiting for the “${title}” celebration`);
  }).toPass({ timeout: 20_000 });
}

type Stored = { lists: Record<string, Record<string, unknown>[]>; singles: Record<string, Record<string, unknown>>; profile: Record<string, unknown> | null };

/** Everything the app has written to this browser's IndexedDB for the local person. */
async function stored(page: Page): Promise<Stored> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("becoming-os");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const docs = await new Promise<{ path: string; data: Record<string, unknown> }[]>((resolve, reject) => {
      const r = db.transaction("docs").objectStore("docs").index("collection").getAll("data/users/local");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    const out: Stored = { lists: {}, singles: {}, profile: null };
    for (const { path, data } of docs) {
      const id = path.slice(path.lastIndexOf("/") + 1);
      if (id.startsWith("t~")) (out.lists[data.table as string] ??= []).push(...(data.rows as Record<string, unknown>[]));
      else if (id.startsWith("s~")) out.singles[id.slice(2)] = data.row as Record<string, unknown>;
      else if (id === "profile") out.profile = data.row as Record<string, unknown>;
    }
    return out;
  });
}

/** Rows of one table as stored (empty when nothing has been written yet). */
const rows = async (page: Page, table: string) => (await stored(page)).lists[table] ?? [];

async function openFresh(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  // Keep the dev server's hot reload out of the run: an edit to the source
  // mid-test would otherwise remount the app and lose what's on screen.
  // For the same reason, drop the dev server's "?t=<edit time>" import stamps:
  // a page loaded lazily after an edit would otherwise pull in a second copy
  // of shared modules (and a second, empty data context).
  await ctx.routeWebSocket(() => true, () => undefined);
  await ctx.route((u) => u.pathname.startsWith("/src/"), async (route) => {
    const res = await route.fetch();
    if (!/javascript/.test(res.headers()["content-type"] ?? "")) return route.fulfill({ response: res });
    const body = (await res.text()).replace(/\?t=\d+&/g, "?").replace(/[?&]t=\d+/g, "");
    await route.fulfill({ response: res, body });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { throw e; });
  await page.goto("/");
  // No accounts: a brand-new browser lands straight on setup.
  await page.waitForURL("**/#/onboarding");
  return page;
}

async function logWeight(page: Page, date: string, weight: string) {
  await settle(page);
  await page.goto("/#/log?tab=body");
  const form = page.getByRole("form", { name: "Weigh-in form" });
  await form.getByLabel("Weight in pounds").fill(weight);
  await form.getByLabel("Date").fill(date);
  await form.getByRole("button", { name: "Save weigh-in" }).click();
}

const atHome = (u: URL) => u.hash === "#/" || u.hash === "";

test("BECOMING OS — the fifteen core workflows", async ({ browser }) => {
  test.setTimeout(360_000);
  let me!: Page;
  let wife!: Page;
  let today = "";

  await test.step("1. I can start with no setup, give my name, and confirm my starting weight", async () => {
    me = await openFresh(browser);
    today = await me.evaluate(() => new Intl.DateTimeFormat("en-CA").format(new Date()));
    await me.getByLabel("Your name").fill(ME.name);
    await me.getByRole("button", { name: /Body, business and a 10K/ }).click();
    await me.getByRole("button", { name: "Continue" }).click();
    const weight = me.getByLabel("Confirm your starting weight");
    await expect(weight).toHaveValue("267"); // pre-filled from the plan, must be confirmed
    await me.getByLabel("Weigh-in date").fill(addDays(today, -7));
    await expect(me.getByLabel("Target weight")).toHaveValue("217");
    await me.getByRole("button", { name: "Save & continue" }).click();
    await me.getByRole("button", { name: "Symptoms, not yet assessed", exact: true }).click();
    await me.getByRole("button", { name: "Save & continue" }).click();
    await expect(me.getByRole("heading", { name: "Business baseline" })).toBeVisible();
    await me.getByLabel("Current monthly revenue").fill("0");
    await me.getByRole("button", { name: "Save & continue" }).click();
    await expect(me.getByRole("heading", { name: "Daily system" })).toBeVisible();
    await me.getByRole("button", { name: "Save & continue" }).click();
    await expect(me.getByRole("heading", { name: "What your partner can see" })).toBeVisible();
    await me.getByRole("button", { name: "Save & continue" }).click();
    await me.getByRole("button", { name: "Finish" }).click();
    await me.waitForURL(atHome);
    await expect(me.getByText("days remain until May 24, 2027")).toBeVisible();

    // The confirmed baseline is stored on this device, not just shown.
    await expect.poll(async () => {
      const s = await stored(me);
      return { name: s.profile?.display_name, done: s.profile?.onboarding_done, start: s.singles.goals?.start_weight, loss: s.singles.goals?.target_loss };
    }).toEqual({ name: ME.name, done: true, start: 267, loss: 50 });
    await expect.poll(async () => (await rows(me, "weights")).map((w) => [w.entry_date, w.weight])).toEqual([[addDays(today, -7), 267]]);
  });

  await test.step("2–3. My wife sets up separately on her own device and enters her own starting weight", async () => {
    wife = await openFresh(browser);
    await wife.getByLabel("Your name").fill(WIFE.name);
    await wife.getByRole("button", { name: /My own transformation/ }).click();
    await wife.getByRole("button", { name: "Continue" }).click();
    await expect(wife.getByLabel("Starting weight")).toHaveValue(""); // never pre-filled for her
    await wife.getByLabel("Starting weight").fill("210");
    await wife.getByRole("button", { name: "Save & continue" }).click();
    await wife.getByRole("button", { name: "Skip", exact: true }).click(); // training — partial onboarding is allowed
    await wife.getByRole("button", { name: "Save & continue" }).click(); // habits
    await wife.getByRole("button", { name: "Save & continue" }).click(); // privacy defaults
    await wife.getByRole("button", { name: "Finish" }).click();
    await wife.waitForURL(atHome);

    // Her records are her own: none of mine are in her browser, and vice versa.
    await expect.poll(async () => (await rows(wife, "weights")).map((w) => w.weight)).toEqual([210]);
    expect((await stored(wife)).profile?.display_name).toBe(WIFE.name);
    expect(await rows(wife, "businesses")).toEqual([]);
    expect((await rows(me, "weights")).map((w) => w.weight)).toEqual([267]);
  });

  await test.step("4. Target weights and progress are calculated from each confirmed baseline", async () => {
    await me.goto("/#/progress");
    await expect(me.getByText("Goal 217.0 lb, stretch 207.0 lb.", { exact: false })).toBeVisible();
    await me.goto("/#/");
    await expect(me.getByText("207–217")).toBeVisible();
    await wife.goto("/#/progress");
    await expect(wife.getByText("Goal 150.0 lb.", { exact: false })).toBeVisible(); // 210 − 60
  });

  await test.step("5. A new weigh-in updates the trend and the meter; a typo is caught", async () => {
    await logWeight(me, addDays(today, -1), "162");
    await expect(me.getByRole("dialog", { name: "Double-check this weigh-in" })).toBeVisible();
    await me.getByRole("dialog", { name: "Double-check this weigh-in" }).getByRole("button", { name: "Cancel" }).click();
    await me.getByRole("form", { name: "Weigh-in form" }).getByLabel("Weight in pounds").fill("262");
    await me.getByRole("form", { name: "Weigh-in form" }).getByRole("button", { name: "Save weigh-in" }).click();
    await expect(me.getByText("Weigh-in saved.")).toBeVisible();
    // The cancelled typo never reached storage.
    await expect.poll(async () => (await rows(me, "weights")).map((w) => w.weight).sort()).toEqual([262, 267]);
    await me.goto("/#/");
    // 7-day average of 267 and 262 = 264.5 → 2.5 lb, 5% of the 50 lb goal
    await expect(me.getByText("264.5 lb").first()).toBeVisible();
    await expect(me.getByText("2.5", { exact: true }).first()).toBeVisible();
    await expect(me.getByText("5%", { exact: true }).first()).toBeVisible();
    await me.goto("/#/progress");
    await expect(me.locator(".recharts-surface").first()).toBeVisible();
  });

  await test.step("6. A five-pound milestone unlocks on the 7-day average and is celebrated", async () => {
    await logWeight(me, today, "261");
    await celebrate(me, "5 pounds lost");
    await settle(me);
    await me.goto("/#/achievements");
    await expect(me.getByTestId("timeline").getByText("5 pounds lost")).toBeVisible();
    await expect(me.getByTestId("timeline").getByText("10 pounds lost")).toHaveCount(0);
    // Once dismissed, the celebration is recorded and doesn't come back after a reload.
    await expect.poll(async () => (await rows(me, "achievements")).filter((a) => a.title === "5 pounds lost" && a.celebrated_at).length).toBe(1);
    await me.reload();
    await expect(me.getByTestId("timeline").getByText("5 pounds lost")).toBeVisible();
    await expect(me.getByRole("dialog", { name: "Milestone unlocked" })).toHaveCount(0);
  });

  await test.step("7–8. Business transactions keep revenue, cash, expenses and profit apart; revenue milestones unlock at thresholds", async () => {
    await settle(me);
    await me.goto("/#/log?tab=business");
    const form = me.getByRole("form", { name: "Transaction form" });
    await form.getByLabel("Revenue earned").fill("1500");
    await form.getByLabel("Cash collected now").fill("500");
    await form.getByRole("button", { name: "Record" }).click();
    await expect(me.getByText("Sale recorded, $500 collected.")).toBeVisible();
    await celebrate(me, /First paying client|First \$1,000 month/);
    await settle(me);

    await form.getByLabel("Type").selectOption("expense");
    await form.getByLabel("Amount").fill("200");
    await form.getByRole("button", { name: "Record" }).click();
    await expect(me.getByText("Recorded.")).toBeVisible();

    await form.getByLabel("Type").selectOption("gig_income");
    await form.getByLabel("Amount").fill("5000");
    await form.getByRole("button", { name: "Record" }).click();
    await expect(me.getByText("Recorded.").first()).toBeVisible();
    await settle(me);

    // Stored as separate records: the sale, its $500 payment, the expense and the gig income.
    await expect.poll(async () => (await rows(me, "transactions")).map((t) => `${t.kind}:${t.amount}`).sort()).toEqual(["expense:200", "gig_income:5000", "sale:1500"]);
    await expect.poll(async () => (await rows(me, "payments")).map((p) => p.amount)).toEqual([500]);

    await me.goto("/#/");
    const card = me.locator(".card", { has: me.getByRole("heading", { name: "Business" }) });
    await expect(card.getByText("$1,500", { exact: true }).first()).toBeVisible(); // revenue earned — gig income excluded
    await expect(card.getByText("$500", { exact: true })).toBeVisible(); // cash collected
    await expect(card.getByText("$1,300", { exact: true })).toBeVisible(); // net profit = 1,500 − 200

    await me.goto("/#/achievements");
    await expect(me.getByTestId("timeline").getByText("First $1,000 month")).toBeVisible();
    await expect(me.getByTestId("timeline").getByText("$2K month")).toHaveCount(0);

    await me.goto("/#/log?tab=business");
    await me.getByRole("form", { name: "Transaction form" }).getByLabel("Revenue earned").fill("600");
    await me.getByRole("form", { name: "Transaction form" }).getByRole("button", { name: "Record" }).click();
    await celebrate(me, "$2K month");
    await settle(me);
  });

  await test.step("9. Logging a workout updates the training dashboard", async () => {
    await me.goto("/#/log?tab=training");
    const form = me.getByRole("form", { name: "Workout form" });
    await form.getByLabel("Activity").selectOption("run_walk");
    await expect(me.getByText("Running with unassessed symptoms")).toBeVisible();
    await form.getByLabel("Duration").fill("25");
    await form.getByLabel("Distance").fill("1.5");
    await form.getByRole("button", { name: "Log workout" }).click();
    await expect(me.getByText("Workout logged.")).toBeVisible();
    await settle(me);
    await expect.poll(async () => (await rows(me, "workouts")).map((w) => [w.activity, w.duration_min, w.distance_mi])).toEqual([["run_walk", 25, 1.5]]);
    await me.goto("/#/train");
    await expect(me.getByText("1 / 3 sessions")).toBeVisible();
    await expect(me.getByText("1.5 mi").first()).toBeVisible();
  });

  await test.step("10. Completing habits updates the daily and weekly scores", async () => {
    await me.goto("/#/");
    await settle(me);
    const list = me.locator(".card", { has: me.getByRole("heading", { name: "Today" }) });
    const habits = list.locator("li button[aria-pressed]");
    await expect(habits.first()).toBeVisible();
    const n = await habits.count();
    expect(n).toBeGreaterThan(0);
    await expect(list.getByText(`0/${n}`)).toBeVisible();
    await habits.first().click();
    await expect(list.getByText(`1/${n}`)).toBeVisible();
    await expect(list.getByText(`${Math.round(100 / n)}%`, { exact: true })).toBeVisible();
    await expect.poll(async () => (await rows(me, "completions")).map((c) => c.completed_on)).toEqual([today]);
    await me.goto("/#/habits");
    await expect(me.getByText(`1/${n} incl. tasks`)).toBeVisible();
  });

  await test.step("11. Editing and deleting records recalculates metrics and milestones", async () => {
    await me.goto("/#/progress");
    await me.locator("li", { hasText: "261 lb" }).getByRole("button", { name: "Edit" }).click();
    const sheet = me.getByRole("dialog", { name: "Edit weigh-in" });
    await sheet.getByLabel("Weight in pounds").fill("264");
    await sheet.getByRole("button", { name: "Save changes" }).click();
    await expect(me.getByText("Weigh-in updated.")).toBeVisible();
    await expect.poll(async () => (await rows(me, "weights")).find((w) => w.entry_date === today)?.weight).toBe(264);
    // 7-day average (262 + 264) / 2 = 263 → 4.0 lb: the 5 lb milestone no longer holds
    await me.goto("/#/");
    await expect(me.getByText("4.0", { exact: true }).first()).toBeVisible();
    await me.goto("/#/achievements");
    await expect(me.getByTestId("timeline").getByText("5 pounds lost")).toHaveCount(0);

    await me.goto("/#/business");
    await me.locator("li", { hasText: "$600.00" }).getByRole("button", { name: "Delete" }).click();
    await me.getByRole("dialog", { name: "Delete this transaction?" }).getByRole("button", { name: "Delete" }).click();
    await expect(me.getByText("Deleted.")).toBeVisible();
    await expect.poll(async () => (await rows(me, "transactions")).some((t) => t.amount === 600)).toBe(false);
    await me.goto("/#/achievements");
    await expect(me.getByTestId("timeline").getByText("$2K month")).toHaveCount(0);
    await expect(me.getByTestId("timeline").getByText("First $1,000 month")).toBeVisible();
  });

  await test.step("12. Sharing: off the published page nothing leaves this browser, and the sharing settings still save", async () => {
    // Real two-person sharing needs the published page and is covered by its own test.
    await me.goto("/#/together");
    await expect(me.getByRole("heading", { name: "Sharing needs the published page" })).toBeVisible();
    await expect(me.getByText("Your records here aren't synced anywhere, so there's nothing for your partner to see from here.")).toBeVisible();
    await expect(me.getByText("invites the other person by email as an Editor", { exact: false })).toBeVisible();
    await expect(me.getByRole("region", { name: /shared progress/ })).toHaveCount(0);
    await expect(me.getByRole("link", { name: "Settings → Your data" })).toBeVisible();

    // Defaults: weight as % of goal, business private.
    const weightRow = me.locator("#sharing div.border-b", { hasText: "Weight progress" });
    const businessRow = me.locator("#sharing div.border-b", { hasText: "Business" });
    await expect(weightRow.getByRole("radio", { name: "% of goal" })).toBeChecked();
    await expect(businessRow.getByRole("radio", { name: "Private" })).toBeChecked();
    await expect(me.getByText("Health details and progress photos are never shared.", { exact: false })).toBeVisible();
    const save = me.getByRole("button", { name: "Save sharing" });
    await expect(save).toBeDisabled();
    await weightRow.getByRole("radio", { name: "Full detail" }).click();
    await save.click();
    await expect(me.getByText("Sharing saved.")).toBeVisible();
    await expect.poll(async () => (await stored(me)).singles.shareSettings?.weight).toBe("full");
    await me.reload();
    await expect(me.locator("#sharing div.border-b", { hasText: "Weight progress" }).getByRole("radio", { name: "Full detail" })).toBeChecked();

    // The wife's browser holds nothing of mine, and Today shows no partner card for either of us.
    expect(await rows(wife, "transactions")).toEqual([]);
    await me.goto("/#/");
    await expect(me.getByRole("heading", { name: /'s progress$/ })).toHaveCount(0);
  });

  await test.step("13. Weekly and monthly reviews use saved records", async () => {
    await me.goto(`/#/reviews?week=${weekStart(today)}`);
    const training = me.locator(".card", { has: me.getByText("Training", { exact: true }) }).first();
    await expect(training.getByText("1/3")).toBeVisible();
    await me.getByLabel("What went well?").fill("E2E test reflection: logged every day.");
    await me.getByRole("button", { name: "Complete review" }).click();
    await expect(me.getByText("Review completed. Well done.")).toBeVisible();
    await celebrate(me, "First weekly review completed");
    await settle(me);
    await expect.poll(async () => (await rows(me, "reviews")).map((r) => [r.period, r.period_start, r.went_well, !!r.completed_at]))
      .toEqual([["week", weekStart(today), "E2E test reflection: logged every day.", true]]);
    await me.goto(`/#/reviews?period=month&month=${monthStart(today)}`);
    const biz = me.locator(".card", { has: me.getByText("Business", { exact: true }) }).first();
    await expect(biz.getByText("$1,500")).toBeVisible();
  });

  await test.step("14. The countdown reflects the exact transformation dates", async () => {
    await me.goto("/#/");
    const c = countdown(today);
    if (c.status === "active") await expect(me.getByText(`Day ${c.dayNumber} of 227`, { exact: false })).toBeVisible();
    await expect(me.getByTestId("days-remaining")).toHaveText(String(c.remaining));
    await expect(me.getByText("Oct 10, 2026", { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(me.getByText("May 24, 2027", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  });

  await test.step("15. Everything is still there after closing the page and opening it again", async () => {
    // Every save has landed: nothing pending, no error.
    await me.goto("/#/settings");
    await expect(me.getByText(/All changes saved/)).toBeVisible();
    const ctx = me.context();
    await me.close();
    me = await ctx.newPage();
    me.on("pageerror", (e) => { throw e; });
    await me.goto("/");
    await me.waitForURL(atHome); // setup is remembered — no onboarding again
    expect((await stored(me)).profile?.display_name).toBe(ME.name);
    await expect(me.getByText("4.0", { exact: true }).first()).toBeVisible();
    const card = me.locator(".card", { has: me.getByRole("heading", { name: "Business" }) });
    await expect(card.getByText("$1,300", { exact: true })).toBeVisible();
    await me.goto("/#/train");
    await expect(me.getByText("1 / 3 sessions")).toBeVisible();
    await me.goto("/#/habits");
    await expect(me.getByText(/^1\/\d+ incl\. tasks$/)).toBeVisible();
    await me.goto(`/#/reviews?week=${weekStart(today)}`);
    await expect(me.getByLabel("What went well?")).toHaveValue("E2E test reflection: logged every day.");
  });
});

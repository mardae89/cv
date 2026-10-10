// End-to-end checks for the 15 "definition of done" workflows, run against a
// real Supabase stack with clearly labelled test accounts and sample values.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { addDays, countdown, monthStart, weekStart } from "../../src/lib/dates";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const API = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const stamp = Date.now();
const ME = { name: "Test Husband", email: `e2e-me-${stamp}@test.dev`, password: "e2e-password-1" };
const WIFE = { name: "Test Wife", email: `e2e-wife-${stamp}@test.dev`, password: "e2e-password-2" };

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

async function rest(page: Page, path: string): Promise<unknown[]> {
  return (await page.evaluate(async ([api, anon, p]) => {
    const raw = Object.entries(localStorage).find(([k]) => k.endsWith("-auth-token"))![1];
    const token = JSON.parse(raw).access_token;
    const r = await fetch(`${api}/rest/v1/${p}`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
    return r.json();
  }, [API, ANON, path] as const)) as unknown[];
}

async function signUp(browser: Browser, who: typeof ME): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { throw e; });
  await page.goto("/");
  await page.getByRole("radio", { name: "Create account" }).click();
  await page.getByLabel("Your name").fill(who.name);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/onboarding");
  return page;
}

async function logWeight(page: Page, date: string, weight: string) {
  await settle(page);
  await page.goto("/log?tab=body");
  const form = page.getByRole("form", { name: "Weigh-in form" });
  await form.getByLabel("Weight in pounds").fill(weight);
  await form.getByLabel("Date").fill(date);
  await form.getByRole("button", { name: "Save weigh-in" }).click();
}

test("BECOMING OS — the fifteen core workflows", async ({ browser }) => {
  test.setTimeout(360_000);
  let me!: Page;
  let wife!: Page;
  let today = "";

  await test.step("1. I can create an account and log in, and confirm my starting weight", async () => {
    me = await signUp(browser, ME);
    today = await me.evaluate(() => new Intl.DateTimeFormat("en-CA").format(new Date()));
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
    await me.waitForURL((u) => u.pathname === "/");
    await expect(me.getByText("days remain until May 24, 2027")).toBeVisible();
  });

  await test.step("2–3. My wife creates a separate account and enters her own starting weight", async () => {
    wife = await signUp(browser, WIFE);
    await wife.getByRole("button", { name: /My own transformation/ }).click();
    await wife.getByRole("button", { name: "Continue" }).click();
    await expect(wife.getByLabel("Starting weight")).toHaveValue(""); // never pre-filled for her
    await wife.getByLabel("Starting weight").fill("210");
    await wife.getByRole("button", { name: "Save & continue" }).click();
    await wife.getByRole("button", { name: "Skip", exact: true }).click(); // training — partial onboarding is allowed
    await wife.getByRole("button", { name: "Save & continue" }).click(); // habits
    await wife.getByRole("button", { name: "Save & continue" }).click(); // privacy defaults
    await wife.getByRole("button", { name: "Finish" }).click();
    await wife.waitForURL((u) => u.pathname === "/");
  });

  await test.step("4. Target weights and progress are calculated from each confirmed baseline", async () => {
    await me.goto("/progress");
    await expect(me.getByText("Goal 217.0 lb, stretch 207.0 lb.", { exact: false })).toBeVisible();
    await me.goto("/");
    await expect(me.getByText("207–217")).toBeVisible();
    await wife.goto("/progress");
    await expect(wife.getByText("Goal 150.0 lb.", { exact: false })).toBeVisible(); // 210 − 60
  });

  await test.step("5. A new weigh-in updates the trend and the meter; a typo is caught", async () => {
    await logWeight(me, addDays(today, -1), "162");
    await expect(me.getByRole("dialog", { name: "Double-check this weigh-in" })).toBeVisible();
    await me.getByRole("dialog", { name: "Double-check this weigh-in" }).getByRole("button", { name: "Cancel" }).click();
    await me.getByRole("form", { name: "Weigh-in form" }).getByLabel("Weight in pounds").fill("262");
    await me.getByRole("form", { name: "Weigh-in form" }).getByRole("button", { name: "Save weigh-in" }).click();
    await expect(me.getByText("Weigh-in saved.")).toBeVisible();
    await me.goto("/");
    // 7-day average of 267 and 262 = 264.5 → 2.5 lb, 5% of the 50 lb goal
    await expect(me.getByText("264.5 lb").first()).toBeVisible();
    await expect(me.getByText("2.5", { exact: true }).first()).toBeVisible();
    await expect(me.getByText("5%", { exact: true }).first()).toBeVisible();
    await me.goto("/progress");
    await expect(me.locator(".recharts-surface").first()).toBeVisible();
  });

  await test.step("6. A five-pound milestone unlocks on the 7-day average and is celebrated", async () => {
    await logWeight(me, today, "261");
    await celebrate(me, "5 pounds lost");
    await settle(me);
    await me.goto("/achievements");
    await expect(me.getByTestId("timeline").getByText("5 pounds lost")).toBeVisible();
    await expect(me.getByTestId("timeline").getByText("10 pounds lost")).toHaveCount(0);
  });

  await test.step("7–8. Business transactions keep revenue, cash, expenses and profit apart; revenue milestones unlock at thresholds", async () => {
    await settle(me);
    await me.goto("/log?tab=business");
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

    await me.goto("/");
    const card = me.locator(".card", { has: me.getByRole("heading", { name: "Business" }) });
    await expect(card.getByText("$1,500", { exact: true }).first()).toBeVisible(); // revenue earned — gig income excluded
    await expect(card.getByText("$500", { exact: true })).toBeVisible(); // cash collected
    await expect(card.getByText("$1,300", { exact: true })).toBeVisible(); // net profit = 1,500 − 200

    await me.goto("/achievements");
    await expect(me.getByTestId("timeline").getByText("First $1,000 month")).toBeVisible();
    await expect(me.getByTestId("timeline").getByText("$2K month")).toHaveCount(0);

    await me.goto("/log?tab=business");
    await me.getByRole("form", { name: "Transaction form" }).getByLabel("Revenue earned").fill("600");
    await me.getByRole("form", { name: "Transaction form" }).getByRole("button", { name: "Record" }).click();
    await celebrate(me, "$2K month");
    await settle(me);
  });

  await test.step("9. Logging a workout updates the training dashboard", async () => {
    await me.goto("/log?tab=training");
    const form = me.getByRole("form", { name: "Workout form" });
    await form.getByLabel("Activity").selectOption("run_walk");
    await expect(me.getByText("Running with unassessed symptoms")).toBeVisible();
    await form.getByLabel("Duration").fill("25");
    await form.getByLabel("Distance").fill("1.5");
    await form.getByRole("button", { name: "Log workout" }).click();
    await expect(me.getByText("Workout logged.")).toBeVisible();
    await settle(me);
    await me.goto("/train");
    await expect(me.getByText("1 / 3 sessions")).toBeVisible();
    await expect(me.getByText("1.5 mi").first()).toBeVisible();
  });

  await test.step("10. Completing habits updates the daily and weekly scores", async () => {
    await me.goto("/");
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
    await me.waitForTimeout(800);
    await me.goto("/habits");
    await expect(me.getByText(`1/${n} incl. tasks`)).toBeVisible();
  });

  await test.step("11. Editing and deleting records recalculates metrics and milestones", async () => {
    await me.goto("/progress");
    await me.locator("li", { hasText: "261 lb" }).getByRole("button", { name: "Edit" }).click();
    const sheet = me.getByRole("dialog", { name: "Edit weigh-in" });
    await sheet.getByLabel("Weight in pounds").fill("264");
    await sheet.getByRole("button", { name: "Save changes" }).click();
    await expect(me.getByText("Weigh-in updated.")).toBeVisible();
    // 7-day average (262 + 264) / 2 = 263 → 4.0 lb: the 5 lb milestone no longer holds
    await me.goto("/");
    await expect(me.getByText("4.0", { exact: true }).first()).toBeVisible();
    await me.goto("/achievements");
    await expect(me.getByTestId("timeline").getByText("5 pounds lost")).toHaveCount(0);

    await me.goto("/business");
    await me.locator("li", { hasText: "$600.00" }).getByRole("button", { name: "Delete" }).click();
    await me.getByRole("dialog", { name: "Delete this transaction?" }).getByRole("button", { name: "Delete" }).click();
    await expect(me.getByText("Deleted.")).toBeVisible();
    await me.goto("/achievements");
    await expect(me.getByTestId("timeline").getByText("$2K month")).toHaveCount(0);
    await expect(me.getByTestId("timeline").getByText("First $1,000 month")).toBeVisible();
  });

  await test.step("12. Shared visibility is enforced by the database", async () => {
    await me.goto("/together");
    await me.getByRole("button", { name: "Create invite code" }).click();
    const code = (await me.getByTestId("invite-code").textContent())!.trim();
    await wife.goto("/together");
    await wife.getByLabel("Invite code").fill(code);
    await wife.getByRole("button", { name: "Connect" }).click();
    await expect(wife.getByText("Connected. Welcome to the team.")).toBeVisible();

    const profiles = (await rest(me, "profiles?select=id,display_name")) as { id: string; display_name: string }[];
    const wifeId = profiles.find((p) => p.display_name === WIFE.name)!.id;
    const meId = profiles.find((p) => p.display_name === ME.name)!.id;
    // Her default is "% of goal": the database returns none of her weigh-ins to me.
    expect(await rest(me, `weight_entries?user_id=eq.${wifeId}`)).toEqual([]);
    expect(await rest(me, `body_goals?user_id=eq.${wifeId}`)).toEqual([]);
    // My business is private by default: none of my transactions reach her.
    expect(await rest(wife, `transactions?user_id=eq.${meId}`)).toEqual([]);
    expect(await rest(wife, `payments?user_id=eq.${meId}`)).toEqual([]);

    await me.goto("/");
    const card = me.locator(".card", { has: me.getByRole("heading", { name: `${WIFE.name}'s progress` }) });
    await expect(card.getByText("Shared as a percentage only")).toBeVisible();
    await expect(card.getByText("lb lost")).toHaveCount(0);

    await wife.goto("/settings#privacy");
    await wife.getByRole("radio", { name: "Full detail" }).click();
    await wife.getByRole("button", { name: "Save privacy" }).click();
    await expect(wife.getByText("Privacy saved — applies immediately.")).toBeVisible();
    expect((await rest(me, `weight_entries?user_id=eq.${wifeId}`)).length).toBe(1);
    expect(await rest(me, `daily_checkins?user_id=eq.${wifeId}`)).toEqual([]); // health stays private
    await me.goto("/together");
    await expect(me.getByText("210.0 lb").first()).toBeVisible();
  });

  await test.step("13. Weekly and monthly reviews use saved records", async () => {
    await me.goto(`/reviews?week=${weekStart(today)}`);
    const training = me.locator(".card", { has: me.getByText("Training", { exact: true }) }).first();
    await expect(training.getByText("1/3")).toBeVisible();
    await me.getByLabel("What went well?").fill("E2E test reflection: logged every day.");
    await me.getByRole("button", { name: "Complete review" }).click();
    await expect(me.getByText("Review completed. Well done.")).toBeVisible();
    await celebrate(me, "First weekly review completed");
    await settle(me);
    await me.goto(`/reviews?period=month&month=${monthStart(today)}`);
    const biz = me.locator(".card", { has: me.getByText("Business", { exact: true }) }).first();
    await expect(biz.getByText("$1,500")).toBeVisible();
  });

  await test.step("14. The countdown reflects the exact transformation dates", async () => {
    await me.goto("/");
    const c = countdown(today);
    if (c.status === "active") await expect(me.getByText(`Day ${c.dayNumber} of 227`, { exact: false })).toBeVisible();
    await expect(me.getByTestId("days-remaining")).toHaveText(String(c.remaining));
    await expect(me.getByText("Oct 10, 2026", { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(me.getByText("May 24, 2027", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  });

  await test.step("15. Everything is still there after logging out and back in", async () => {
    await me.goto("/settings");
    await me.getByRole("button", { name: "Sign out" }).click();
    await me.waitForURL("**/auth");
    await me.getByLabel("Email").fill(ME.email);
    await me.getByLabel("Password").fill(ME.password);
    await me.getByRole("button", { name: "Sign in" }).click();
    await me.waitForURL((u) => u.pathname === "/");
    await expect(me.getByText("4.0", { exact: true }).first()).toBeVisible();
    const card = me.locator(".card", { has: me.getByRole("heading", { name: "Business" }) });
    await expect(card.getByText("$1,300", { exact: true })).toBeVisible();
    await me.goto("/train");
    await expect(me.getByText("1 / 3 sessions")).toBeVisible();
  });
});

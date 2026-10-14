// The Power List is every day; Daily execution is what's scheduled for a given
// day. Older records that overlap get a one-tap tidy-up, and both lists are
// one tap from Today to edit.
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, go, openFresh, rows, settle } from "./helpers";

async function addHabit(page: Page, name: string) {
  await go(page, "/habits");
  await page.getByRole("button", { name: "New habit" }).click();
  const sheet = page.getByRole("dialog", { name: "New habit" });
  await sheet.getByLabel("Habit", { exact: true }).fill(name);
  await sheet.getByRole("button", { name: "Add habit" }).click();
  await expect.poll(async () => (await rows(page, "habits")).some((h) => h.name === name)).toBe(true);
}

for (const vp of ["mobile", "desktop"] as const) {
  test(`tidy up: overlapping habits are archived or renamed, cardio stays on the Power List (${vp})`, async ({ browser }) => {
    const { page, errors } = await openFresh(browser, vp, "skip");
    for (const n of ["Wake up on time", "Lights out on time", "Log nutrition", "Read or learn (20 min)", "Plan tomorrow"]) await addHabit(page, n);
    await go(page, "/power");
    await page.getByRole("button", { name: "Use my standard list" }).first().click();
    await expect.poll(async () => (await rows(page, "powerItems")).length).toBe(9);
    await settle(page, 1000);

    await go(page, "/");
    const card = page.locator(".card").filter({ hasText: "Your two lists overlap" });
    const steps = card.getByRole("list", { name: "Proposed changes" }).getByRole("checkbox");
    await expect(steps).toHaveCount(4);
    // Keep "Plan tomorrow" untouched; untick the rename to keep "Read or learn" as it is.
    await steps.filter({ hasText: "Rename" }).click();
    await expect(steps.filter({ hasText: "Rename" })).toHaveAttribute("aria-checked", "false");
    await card.getByRole("button", { name: /^Apply 3 changes/ }).click();
    await expect(card).toHaveCount(0, { timeout: 10_000 });

    const habits = await rows(page, "habits");
    const archived = (n: string) => !!habits.find((h) => h.name === n)?.archived_on;
    expect(archived("Wake up on time")).toBe(true);
    expect(archived("Lights out on time")).toBe(true);
    expect(archived("Log nutrition")).toBe(true);
    expect(archived("Plan tomorrow")).toBe(false);
    expect(habits.some((h) => h.name === "Read or learn (20 min)" && !h.archived_on)).toBe(true);

    // Daily execution no longer lists them; Edit opens the Habits page.
    await settle(page);
    const today = page.locator(".card").filter({ hasText: "Daily execution" }).first();
    await expect(today.getByText("Wake up on time")).toHaveCount(0);
    await today.getByRole("link", { name: "Edit Daily execution" }).click();
    await expect(page.getByRole("heading", { name: "Habits & routine" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
}

test("tidy up: rename to Learn for 20 minutes, and Not now hides the card", async ({ browser }) => {
  const { page, errors } = await openFresh(browser, "desktop", "skip");
  await addHabit(page, "Read or learn (20 min)");
  await go(page, "/power");
  await page.getByRole("button", { name: "Use my standard list" }).first().click();
  await expect.poll(async () => (await rows(page, "powerItems")).length).toBe(9);
  await settle(page, 1000);
  await go(page, "/");
  const card = page.locator(".card").filter({ hasText: "Your two lists overlap" });
  await expect(card.getByRole("checkbox")).toHaveCount(1);
  await card.getByRole("button", { name: /^Apply 1 change/ }).click();
  await expect.poll(async () => (await rows(page, "habits")).some((h) => h.name === "Learn for 20 minutes")).toBe(true);
  await expect(card).toHaveCount(0);

  // A second overlap appears later; Not now hides the card on this device.
  await addHabit(page, "Wake up on time");
  await go(page, "/");
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Not now" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await settle(page);
  await expect(card).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("tidy up: day-specific Power List items move to Daily execution; Morning cardio is added after waking", async ({ browser }) => {
  const { page, errors } = await openFresh(browser, "desktop", "skip");
  await go(page, "/power");
  await page.getByRole("button", { name: "Use my standard list" }).first().click();
  await expect.poll(async () => (await rows(page, "powerItems")).length).toBe(9);
  await settle(page, 1000);
  // Make it look like the older list: no cardio, and filming on Mondays and Tuesdays only.
  await page.getByRole("button", { name: /Edit list/ }).first().click();
  const sheet = page.getByRole("dialog").first();
  await sheet.getByRole("button", { name: "Delete Morning cardio" }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: /^Delete/ }).last().click();
  await expect.poll(async () => (await rows(page, "powerItems")).some((r) => r.name === "Morning cardio")).toBe(false);
  await page.getByRole("dialog").getByRole("button", { name: /Add item/ }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Item").fill("Film session");
  for (const d of ["Sunday", "Wednesday", "Thursday", "Friday", "Saturday"]) await form.getByRole("button", { name: d, exact: true }).click();
  await form.getByRole("button", { name: /Save|Add/ }).last().click();
  await expect.poll(async () => (await rows(page, "powerItems")).find((r) => r.name === "Film session")?.days).toEqual([1, 2]);
  await page.keyboard.press("Escape");
  await settle(page, 1000);

  await go(page, "/");
  const card = page.locator(".card").filter({ hasText: "Your two lists overlap" });
  await expect(card.getByRole("checkbox")).toHaveText([
    "Add “Morning cardio” to the Power List, every day.",
    "Move “Film session” to Daily execution — it's only due on certain days.",
  ].map((t) => `✓${t}`));
  await card.getByRole("button", { name: /^Apply 2 changes/ }).click();
  await expect(card).toHaveCount(0, { timeout: 10_000 });

  const power = (await rows(page, "powerItems")).filter((r) => !r.archived_on).sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
  expect(power.slice(0, 2).map((r) => r.name)).toEqual(["Wake up by 5:45am", "Morning cardio"]);
  expect(power.some((r) => r.name === "Film session")).toBe(false);
  const film = (await rows(page, "habits")).find((h) => h.name === "Film session");
  expect(film?.schedule_days).toEqual([1, 2]);
  expect(film?.archived_on ?? null).toBeNull();
  expect(errors).toEqual([]);
});

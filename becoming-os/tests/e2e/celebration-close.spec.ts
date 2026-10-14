// The milestone dialog can always be closed: the X (or Escape) closes it and
// anything queued behind it; every milestone stays on the timeline.
import { expect, test, type Page } from "@playwright/test";
import { go, openFresh, rows } from "./helpers";

/** Ticks every Power List item due today, leaving the celebrations open. */
async function perfectDay(page: Page) {
  await go(page, "/power");
  await page.getByRole("button", { name: "Use my standard list" }).first().click();
  const day = page.locator('[aria-label="Day checklist"]').first();
  const dialog = page.getByRole("dialog", { name: "Milestone unlocked" });
  for (let i = 0; i < 40; i++) {
    if (await dialog.isVisible()) break;
    const done = day.getByRole("button", { name: /^Mark .* done/ }).and(page.locator(":enabled")).first();
    if (await done.count()) { await done.click(); continue; }
    const open = day.locator('button[aria-pressed="false"]').first();
    if (!(await open.count())) break;
    await open.click();
  }
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

for (const vp of ["mobile", "desktop"] as const) {
  test(`milestone dialog: X closes it and everything queued (${vp})`, async ({ browser }) => {
    const { page, errors } = await openFresh(browser, vp, "skip");
    const dialog = await perfectDay(page);
    const close = dialog.getByRole("button", { name: "Close", exact: true });
    await expect(close).toBeVisible();
    await close.click();
    await expect(dialog).toHaveCount(0);
    // Nothing reopens: every milestone so far is marked as seen, and still saved.
    await page.waitForTimeout(1500);
    await expect(dialog).toHaveCount(0);
    const ach = (await rows(page, "achievements")).filter((a) => a.category !== "level");
    expect(ach.length).toBeGreaterThan(0);
    expect(ach.every((a) => a.celebrated_at)).toBe(true);
    // No empty "Previous —" / "Next —" boxes are ever shown.
    expect(errors).toEqual([]);
  });
}

test("milestone dialog: Escape closes it", async ({ browser }) => {
  const { page, errors } = await openFresh(browser, "desktop", "skip");
  const dialog = await perfectDay(page);
  await expect(dialog.getByText("—", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

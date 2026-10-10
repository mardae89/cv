import { test } from "@playwright/test";
import { go, openFresh, rows } from "./helpers";

test(`repro`, async ({ browser }) => {
  const { page, errors } = await openFresh(browser, "desktop", "skip");
  await go(page, `/log?tab=audience`);
  const ig = page.getByLabel("Instagram followers");
  await ig.click();
  await page.keyboard.type("12,500");
  console.log("typed value:", JSON.stringify(await ig.inputValue()));
  await page.getByLabel("YouTube subscribers").fill("300");
  await page.getByRole("button", { name: "Save audience" }).click();
  await page.waitForTimeout(800);
  console.log("audience rows:", JSON.stringify((await rows(page, "audience")).map((r) => [r.platform, r.count])));
  console.log("toasts:", await page.getByRole("status").allTextContents());
  // paste
  await ig.fill("");
  await page.evaluate(() => navigator.clipboard?.writeText?.("4,200").catch(() => 0));

  await go(page, `/log?tab=body`);
  const wf = page.getByRole("form", { name: "Weigh-in form" });
  await wf.getByLabel("Weight in pounds").fill("200");
  await wf.getByRole("button", { name: "Save weigh-in" }).click();
  await page.waitForTimeout(500);
  await wf.getByLabel("Waist (optional)").fill("40");
  await wf.getByRole("button", { name: "Save weigh-in" }).click();
  await page.waitForTimeout(500);
  console.log("weights:", JSON.stringify((await rows(page, "weights")).map((r) => [r.entry_date, r.weight, r.waist_in])));
  console.log("hint:", await wf.locator("p").allTextContents());

  const cf = page.getByRole("form", { name: "Check-in form" });
  await cf.getByLabel("Sleep", { exact: true }).fill("7");
  await cf.getByRole("button", { name: "Save check-in" }).click();
  await page.waitForTimeout(500);
  const y = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString("en-CA"); });
  await cf.getByLabel("Date").fill(y);
  console.log("after date change sleep=", await cf.getByLabel("Sleep", { exact: true }).inputValue(), "button=", await cf.getByRole("button").last().textContent());
  await cf.getByRole("button", { name: /check-in/ }).click();
  await page.waitForTimeout(500);
  console.log("checkins:", JSON.stringify((await rows(page, "checkins")).map((r) => [r.checkin_date, r.sleep_hours])));
  console.log(errors);
});

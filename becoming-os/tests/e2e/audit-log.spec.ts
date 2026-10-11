// Control-by-control audit of the Log page (Body, Nutrition, Audience, Habits & mind
// and the tab bar) on a phone and on a desktop. Every control is checked to be on
// screen and not hidden behind the bottom bar, to accept a value, to save, to
// survive a reload, and to update every place that shows the data right away.
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, openFresh, rows, settle, stored, toast, type ViewportName } from "./helpers";

const SIZES: ViewportName[] = ["mobile", "desktop"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${MONTHS[m - 1]} ${day}, ${y}`;
};
const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

const TOUCH = new WeakMap<Page, boolean>();

/** Stored records land a moment after the screen updates; check often. */
const poll = <T,>(fn: () => Promise<T> | T) => expect.poll(fn, { intervals: [50, 100, 150, 250] });

async function open(browser: Browser, vp: ViewportName, setup: "skip" | "demo") {
  const o = await openFresh(browser, vp, setup);
  TOUCH.set(o.page, vp === "mobile");
  return o;
}

/** The app's "today" (the demo clock in demo mode). */
async function appToday(page: Page): Promise<string> {
  const p = (await stored(page)).profile as { demo_mode?: boolean; demo_today?: string } | null;
  if (p?.demo_mode && p.demo_today) return p.demo_today;
  return page.evaluate(() => new Date().toLocaleDateString("en-CA"));
}

const celebration = (page: Page) => page.getByRole("dialog", { name: "Milestone unlocked" });

/** One look: on screen, not clipped, and nothing (bottom bar, + button, a sheet) sits on top of it. */
async function checkUncovered(loc: Locator) {
  const r = await loc.evaluate((el) => {
    el.scrollIntoView({ block: "center", inline: "center" });
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
}

/** Controls already checked in this test (positions only move down as lists grow, so once is enough). */
const CHECKED = new WeakMap<Page, Set<string>>();
const seen = (loc: Locator) => {
  const set = CHECKED.get(loc.page()) ?? new Set<string>();
  CHECKED.set(loc.page(), set);
  const k = loc.toString();
  const had = set.has(k);
  set.add(k);
  return had;
};

async function expectUncovered(loc: Locator) {
  await expect(loc).toBeVisible();
  if (seen(loc)) return;
  await expect(async () => {
    // Milestones earned along the way are celebrated over the page; dismiss them first.
    if (await celebration(loc.page()).isVisible()) await settle(loc.page());
    await checkUncovered(loc);
  }).toPass({ timeout: 8000 });
}

/** Every element `loc` matches (e.g. the buttons of a 0–10 scale) is reachable, checked in one pass. */
async function expectAllUncovered(loc: Locator, count: number) {
  await expect(loc).toHaveCount(count);
  await expect(async () => {
    const bad = await loc.evaluateAll((els) => els.flatMap((el, i) => {
      el.scrollIntoView({ block: "center", inline: "center" });
      const b = el.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      const ok = b.top >= 0 && b.bottom <= window.innerHeight + 0.5 && b.left >= -0.5 && b.right <= window.innerWidth + 0.5 && !!hit && (hit === el || el.contains(hit));
      return ok ? [] : [`#${i} ${el.textContent} covered by ${hit?.outerHTML.slice(0, 100)}`];
    }));
    expect(bad).toEqual([]);
  }).toPass({ timeout: 8000 });
}

/** Tap on the phone, click on the desktop — after checking the control can be reached. */
/** A sheet that is still sliding in moves its buttons between where a tap aims and where it lands; wait for it to arrive. */
async function sheetArrived(loc: Locator) {
  await loc.evaluate((el) => Promise.all((el.closest("[role=dialog]")?.getAnimations({ subtree: true }) ?? [])
    .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
    .map((a) => a.finished.catch(() => undefined))));
}

async function press(loc: Locator) {
  const page = loc.page();
  await expect(loc).toBeVisible();
  await sheetArrived(loc);
  const check = !seen(loc);
  await expect(async () => {
    if (await celebration(page).isVisible()) await settle(page);
    if (check) await checkUncovered(loc);
    // A celebration can open between the check and the press; then this try fails before pressing and is retried.
    if (TOUCH.get(page)) await loc.tap({ timeout: 2000 });
    else await loc.click({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
}

async function type(loc: Locator, value: string) {
  await expectUncovered(loc);
  await loc.fill(value);
  await expect(loc).toHaveValue(value);
}

/** A future date is refused, by the date picker's own limit or by the form's message; nothing is saved. */
async function expectFutureRefused(page: Page, dateInput: Locator, submit: Locator, message: string) {
  await press(submit);
  const native = await dateInput.evaluate((el: HTMLInputElement) => el.validationMessage);
  if (!native) await alertToast(page, message);
}

async function alertToast(page: Page, text: string | RegExp) {
  await expect(page.getByRole("alert").filter({ hasText: text }).first()).toBeVisible();
}

const panel = (page: Page, title: string) =>
  page.locator(".card").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
const item = (scope: Locator, text: string | RegExp) => scope.getByRole("listitem").filter({ hasText: text });
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });

/**
 * Opens an edit sheet. "all" first checks every way of closing it (the X, Escape, the
 * dimmed backdrop), "x" just the X; then it is opened again for editing.
 */
async function openSheet(page: Page, row: Locator, name: string, closing: "all" | "x" | "none" = "x") {
  const sheet = dialog(page, name);
  const edit = row.getByRole("button", { name: "Edit" });
  if (closing !== "none") {
    await press(edit);
    await expect(sheet).toBeVisible();
    await press(sheet.getByRole("button", { name: "Close" }));
    await expect(sheet).toBeHidden();
  }
  if (closing === "all") {
    await press(edit);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await press(edit);
    await sheet.click({ position: { x: 8, y: 8 } }); // the dimmed backdrop
    await expect(sheet).toBeHidden();
  }
  await press(edit);
  await expect(sheet).toBeVisible();
  return sheet;
}

/** In-app navigation (no reload); celebrations that pop up are dismissed by the next press. */
async function nav(page: Page, route: string) {
  await page.goto(`/#${route}`);
  await expect(page.locator("main")).toBeVisible();
}

/** Delete with the confirm: Cancel keeps it, Delete removes it. */
async function deleteRow(page: Page, row: Locator, title: string) {
  await press(row.getByRole("button", { name: "Delete" }));
  const confirm = dialog(page, title);
  await press(confirm.getByRole("button", { name: "Cancel" }));
  await expect(confirm).toBeHidden();
  await expect(row).toHaveCount(1);
  await press(row.getByRole("button", { name: "Delete" }));
  await press(confirm.getByRole("button", { name: "Delete" }));
  await toast(page, "Deleted.");
  await expect(row).toHaveCount(0);
}

/** The value shown under each platform on an Audience card: Instagram, YouTube, Skool. */
async function expectAudienceCard(card: Locator, values: [string, string, string]) {
  const stats = card.locator(".grid > div");
  for (let i = 0; i < 3; i++) await expect(stats.nth(i).locator(":scope > div").nth(1)).toHaveText(values[i]);
}

async function finish(page: Page, errors: string[]) {
  await expectNoHorizontalScroll(page);
  expect(errors, "console or page errors").toEqual([]);
  await page.context().close();
}

for (const vp of SIZES) {
  test.describe(`Log page audit · ${vp}`, () => {
    test("tab bar: every tab opens its panel, deep links and reloads keep it, and the open tab is in view", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "demo");
      await nav(page, "/log");
      const bar = page.getByRole("radiogroup", { name: "What to log" });
      const tabs: [string, string, string][] = [
        ["Body", "body", "Weigh-in"], ["Training", "training", "Log a workout"], ["Nutrition", "nutrition", "Log a meal"],
        ["Business", "business", "Record a transaction"], ["Audience", "audience", "Record audience"], ["Habits & mind", "mind", "Journal & learning"],
      ];
      await expect(bar.getByRole("radio")).toHaveText(tabs.map((t) => t[0]));
      await expect(bar.getByRole("radio", { name: "Body" })).toHaveAttribute("aria-checked", "true");
      for (const [label, key, heading] of tabs) {
        const t = bar.getByRole("radio", { name: label, exact: true });
        await press(t);
        await expect(t).toHaveAttribute("aria-checked", "true");
        await expect(page).toHaveURL(new RegExp(`tab=${key}$`));
        await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
        await expectNoHorizontalScroll(page);
      }
      // Deep link straight to the last tab: it is selected and scrolled into view in the bar.
      await nav(page, "/log?tab=mind");
      await expect(bar.getByRole("radio", { name: "Habits & mind" })).toHaveAttribute("aria-checked", "true");
      await expect(bar.getByRole("radio", { name: "Habits & mind" })).toBeInViewport({ ratio: 1 });
      await page.reload();
      await settle(page);
      await expect(page.getByRole("heading", { name: "Journal & learning" })).toBeVisible();
      // "Update counts" on Today's Audience card lands on the Audience tab, with the tab in view.
      await nav(page, "/");
      await press(page.getByRole("link", { name: "Update counts →" }));
      await expect(page).toHaveURL(/#\/log\?tab=audience$/);
      // The new page opens at its top, not at Today's scroll offset.
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
      await expect(bar.getByRole("radio", { name: "Audience" })).toHaveAttribute("aria-checked", "true");
      await expect(bar.getByRole("radio", { name: "Audience" })).toBeInViewport({ ratio: 1 });
      await expect(page.getByLabel("Instagram followers")).toBeInViewport();
      // On the Audience tab itself the card has no links that lead back to this same page.
      await expect(page.getByRole("link", { name: /Update counts|Record your counts|Open Audience/ })).toHaveCount(0);
      // A business tab link while business is off falls back to Body.
      await finish(page, errors);
    });

    test("weigh-in: decimals, waist only, same-day update, unusual-change confirm, edit sheet, delete, reload", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      await nav(page, "/log?tab=body");
      const today = await appToday(page);
      const form = page.getByRole("form", { name: "Weigh-in form" });
      const weight = form.getByLabel("Weight in pounds");
      const date = form.getByLabel("Date");
      const waist = form.getByLabel("Waist (optional)");
      const note = form.getByLabel("Note");
      const save = form.getByRole("button", { name: "Save weigh-in" });
      const list = panel(page, "Recent weigh-ins");
      const saved = async () => (await rows(page, "weights")).map((w) => [w.entry_date, w.weight, w.waist_in, w.note, w.flagged]).sort();
      await expect(date).toHaveValue(today);
      await expect(list.getByText("Nothing logged yet.")).toBeVisible();

      // Validation keeps what was typed.
      await press(save);
      await alertToast(page, "Enter a weight or a waist measurement.");
      await type(weight, "50");
      await press(save);
      await alertToast(page, "Weight must be between 70 and 700 lb.");
      await expect(weight).toHaveValue("50");
      await type(weight, "201");
      await type(date, addDays(today, 1));
      await expectFutureRefused(page, date, save, "You can't log a weigh-in for a future date.");
      expect(await rows(page, "weights")).toHaveLength(0);

      // Every field, with decimals, on an earlier date.
      const d2 = addDays(today, -2);
      await type(weight, "201.6");
      await type(date, d2);
      await type(waist, "40.5");
      await type(note, "after travel");
      await press(save);
      await toast(page, "Weigh-in saved.");
      await poll(saved).toEqual([[d2, 201.6, 40.5, "after travel", false]]);
      await expect(weight).toHaveValue("");
      await expect(item(list, "201.6 lb")).toContainText(`${fmtDate(d2)} · waist 40.5 in · after travel`);

      // Today, then a second save the same day updates that entry.
      await type(date, today);
      await type(weight, "200");
      await press(save);
      await toast(page, "Weigh-in saved.");
      await type(weight, "199.2");
      await expect(form.getByText(/You already logged 200 lb on\s+this date — saving updates it/)).toBeVisible();
      await press(save);
      await toast(page, `Updated the weigh-in for ${fmtDate(today)}.`);
      await poll(saved).toEqual([[d2, 201.6, 40.5, "after travel", false], [today, 199.2, null, null, false]]);
      await expect(item(list, "199.2 lb")).toHaveCount(1);
      await expect(item(list, /^200 lb/)).toHaveCount(0);

      // Waist only on a day that has a weight keeps the weight.
      await type(waist, "39.5");
      await press(save);
      await toast(page, `Updated the weigh-in for ${fmtDate(today)}.`);
      await poll(saved).toContainEqual([today, 199.2, 39.5, null, false]);
      await expect(item(list, "199.2 lb")).toContainText("waist 39.5 in");

      // Waist only on a new day.
      const d1 = addDays(today, -1);
      await type(date, d1);
      await type(waist, "39.8");
      await press(save);
      await toast(page, "Weigh-in saved.");
      await poll(saved).toContainEqual([d1, null, 39.8, null, false]);
      await expect(item(list, "Waist 39.8 in")).toContainText(fmtDate(d1));

      // An unusual change asks first: Cancel keeps the typed value and saves nothing.
      await type(date, today);
      await type(weight, "150");
      await press(save);
      const check = dialog(page, "Double-check this weigh-in");
      await expect(check).toContainText("150 lb is");
      await press(check.getByRole("button", { name: "Cancel" }));
      await expect(check).toBeHidden();
      await expect(weight).toHaveValue("150");
      await poll(saved).toContainEqual([today, 199.2, 39.5, null, false]);
      await press(save);
      await press(check.getByRole("button", { name: "It's correct — save" }));
      await toast(page, `Updated the weigh-in for ${fmtDate(today)}.`);
      await poll(saved).toContainEqual([today, 150, 39.5, null, true]);
      await expect(item(list, "150 lb")).toContainText("confirmed unusual change");

      // Edit sheet (close, Escape, backdrop, then save).
      const sheet = await openSheet(page, item(list, "150 lb"), "Edit weigh-in", "all");
      await expect(sheet.getByLabel("Weight in pounds")).toHaveValue("150");
      await expect(sheet.getByLabel("Waist (optional)")).toHaveValue("39.5");
      await type(sheet.getByLabel("Weight in pounds"), "198.4");
      await type(sheet.getByLabel("Note"), "fixed typo");
      await press(sheet.getByRole("button", { name: "Save changes" }));
      await toast(page, "Weigh-in updated.");
      await expect(sheet).toBeHidden();
      await poll(saved).toContainEqual([today, 198.4, 39.5, "fixed typo", false]);
      await expect(item(list, "198.4 lb")).toContainText("fixed typo");
      await expect(item(list, "150 lb")).toHaveCount(0);

      // Delete.
      await deleteRow(page, item(list, "198.4 lb"), "Delete this weigh-in?");
      await poll(async () => (await saved()).length).toBe(2);

      await page.reload();
      await settle(page);
      await expect(item(list, "201.6 lb")).toBeVisible();
      await expect(item(list, "Waist 39.8 in")).toBeVisible();
      await expect(list.getByRole("listitem")).toHaveCount(2);
      await finish(page, errors);
    });

    test("daily check-in and pain & symptoms: every scale and field, date switching, edit sheets, deletes", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      await nav(page, "/log?tab=body");
      const today = await appToday(page);
      const form = page.getByRole("form", { name: "Check-in form" });
      const date = form.getByLabel("Date");
      const sleep = form.getByLabel("Sleep", { exact: true });
      const water = form.getByLabel("Water");
      const notes = form.getByLabel("Notes");
      const scale = (f: Locator, name: string) => f.getByRole("radiogroup", { name });
      const pick = async (f: Locator, name: string, n: string) => {
        const r = scale(f, name).getByRole("radio", { name: n, exact: true });
        await press(r);
        await expect(r).toHaveAttribute("aria-checked", "true");
      };
      const list = panel(page, "Recent check-ins & symptoms");
      const checkins = async () => (await rows(page, "checkins")).map((c) => [c.checkin_date, c.sleep_hours, c.sleep_quality, c.energy, c.soreness, c.fatigue, c.water_oz, c.note]).sort();

      await press(form.getByRole("button", { name: "Save check-in" }));
      await alertToast(page, "Fill in at least one thing before saving.");
      await type(sleep, "25");
      await press(form.getByRole("button", { name: "Save check-in" }));
      await alertToast(page, "Sleep must be between 0 and 24 hours.");
      await expect(sleep).toHaveValue("25");

      await type(sleep, "7.5");
      for (const [name, n] of [["Sleep quality", "4"], ["Energy", "3"], ["Soreness", "2"], ["Fatigue", "5"]] as const) {
        await expectAllUncovered(scale(form, name).getByRole("radio"), 5);
        await pick(form, name, n);
      }
      // "clear" empties a scale.
      await press(scale(form, "Fatigue").locator("..").getByRole("button", { name: "clear" }));
      await expect(scale(form, "Fatigue").getByRole("radio", { checked: true })).toHaveCount(0);
      await type(water, "64.5");
      await type(notes, "slept well");
      await press(form.getByRole("button", { name: "Save check-in" }));
      await toast(page, "Check-in saved.");
      await poll(checkins).toEqual([[today, 7.5, 4, 3, 2, null, 64.5, "slept well"]]);
      await expect(form.getByRole("button", { name: "Update check-in" })).toBeVisible();
      await expect(item(list, fmtDate(today))).toContainText("7.5 h sleep · energy 3/5 · soreness 2/5 · 64.5 oz water");

      // Updating keeps one check-in per day.
      await pick(form, "Energy", "5");
      await press(form.getByRole("button", { name: "Update check-in" }));
      await toast(page, "Check-in saved.");
      await poll(checkins).toEqual([[today, 7.5, 4, 5, 2, null, 64.5, "slept well"]]);

      // Another date shows that date's check-in (none yet), then today's again.
      const d1 = addDays(today, -1);
      await type(date, d1);
      await expect(sleep).toHaveValue("");
      await expect(scale(form, "Energy").getByRole("radio", { checked: true })).toHaveCount(0);
      await expect(form.getByRole("button", { name: "Save check-in" })).toBeVisible();
      await type(sleep, "6");
      await pick(form, "Soreness", "1");
      // Typed-but-unsaved values stay when moving to another date with nothing saved.
      await type(date, addDays(today, -3));
      await expect(sleep).toHaveValue("6");
      await type(date, d1);
      await expect(scale(form, "Soreness").getByRole("radio", { name: "1" })).toHaveAttribute("aria-checked", "true");
      await press(form.getByRole("button", { name: "Save check-in" }));
      await toast(page, "Check-in saved.");
      await poll(async () => (await checkins()).length).toBe(2);
      await type(date, today);
      await expect(sleep).toHaveValue("7.5");
      await expect(scale(form, "Energy").getByRole("radio", { name: "5" })).toHaveAttribute("aria-checked", "true");

      // Water shows in the Nutrition tab's day total.
      await press(page.getByRole("radiogroup").first().getByRole("radio", { name: "Nutrition" }));
      await expect(page.locator(".card", { hasText: "Day total" }).getByText("64.5oz")).toBeVisible();
      await press(page.getByRole("radiogroup").first().getByRole("radio", { name: "Body" }));

      // Edit sheet: the date is fixed, the scales change, and the main form follows.
      const sheet = await openSheet(page, item(list, fmtDate(today)), "Edit check-in");
      await expect(sheet.getByLabel("Date")).toBeDisabled();
      await expect(sheet.getByLabel("Sleep", { exact: true })).toHaveValue("7.5");
      await pick(sheet, "Soreness", "4");
      await pick(sheet, "Fatigue", "2");
      await press(sheet.getByRole("button", { name: "Update check-in" }));
      await toast(page, "Check-in saved.");
      await expect(sheet).toBeHidden();
      await poll(checkins).toContainEqual([today, 7.5, 4, 5, 4, 2, 64.5, "slept well"]);
      await expect(scale(form, "Soreness").getByRole("radio", { name: "4" })).toHaveAttribute("aria-checked", "true");
      await expect(item(list, fmtDate(today))).toContainText("soreness 4/5");
      await deleteRow(page, item(list, fmtDate(d1)), "Delete this check-in?");
      await poll(async () => (await checkins()).map((c) => c[0])).toEqual([today]);

      // Pain & symptoms.
      const sym = page.locator("form", { has: page.getByRole("button", { name: "Log symptoms" }) });
      const where = sym.getByLabel("Where");
      const pain = (n: string) => sym.getByRole("radiogroup", { name: "Pain (0 = none, 10 = worst)" }).getByRole("radio", { name: n, exact: true });
      const symptoms = async () => (await rows(page, "symptoms")).map((s) => [s.log_date, s.body_area, s.side, s.pain_level, s.pain_type, s.during, s.note]);
      await press(sym.getByRole("button", { name: "Log symptoms" }));
      await alertToast(page, "Choose a pain level from 0 to 10.");
      await type(where, "");
      await press(pain("3"));
      await press(sym.getByRole("button", { name: "Log symptoms" }));
      await alertToast(page, "Say where it hurts");
      expect(await rows(page, "symptoms")).toHaveLength(0);

      await type(sym.getByLabel("Date"), d1);
      await type(where, "Knee");
      for (const s of ["Left", "Right", "Both", "N/A", "Left"]) {
        await press(sym.getByRole("radio", { name: s, exact: true }));
        await expect(sym.getByRole("radio", { name: s, exact: true })).toHaveAttribute("aria-checked", "true");
      }
      await expectAllUncovered(sym.getByRole("radiogroup", { name: "Pain (0 = none, 10 = worst)" }).getByRole("radio"), 11);
      await press(pain("6"));
      await expect(sym.getByRole("alert").filter({ hasText: "Consider getting this checked" })).toBeVisible();
      await expectUncovered(sym.getByLabel("Type"));
      await sym.getByLabel("Type").selectOption("dull");
      await expectUncovered(sym.getByLabel("When"));
      await sym.getByLabel("When").selectOption("stairs");
      await type(sym.getByLabel("Notes"), "worse going down");
      await press(sym.getByRole("button", { name: "Log symptoms" }));
      await toast(page, "Symptoms logged.");
      await poll(symptoms).toEqual([[d1, "Knee", "left", 6, "dull", "stairs", "worse going down"]]);
      await expect(item(list, "Knee (left) · 6/10")).toContainText(`${fmtDate(d1)} · dull · stairs`);

      const ssheet = await openSheet(page, item(list, "Knee (left) · 6/10"), "Edit symptoms");
      await expect(ssheet.getByLabel("Where")).toHaveValue("Knee");
      await press(ssheet.getByRole("radiogroup", { name: "Pain (0 = none, 10 = worst)" }).getByRole("radio", { name: "2", exact: true }));
      await ssheet.getByLabel("Type").selectOption("stiffness");
      await press(ssheet.getByRole("button", { name: "Save changes" }));
      await toast(page, "Symptoms logged.");
      await poll(symptoms).toEqual([[d1, "Knee", "left", 2, "stiffness", "stairs", "worse going down"]]);
      await expect(item(list, "Knee (left) · 2/10")).toContainText("stiffness");

      await page.reload();
      await settle(page);
      await expect(item(list, "Knee (left) · 2/10")).toBeVisible();
      await expect(item(list, fmtDate(today))).toContainText("soreness 4/5");
      await deleteRow(page, item(list, "Knee (left) · 2/10"), "Delete this symptom log?");
      await poll(symptoms).toEqual([]);
      await finish(page, errors);
    });

    test("progress photo (choose, reject a non-image, upload with date/pose/caption, shows on Body page) and body lists (Show all, Full history)", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "demo");
      await nav(page, "/log?tab=body");
      const today = await appToday(page);
      const form = page.locator("form", { has: page.getByRole("button", { name: "Upload photo" }) });
      const upload = form.getByRole("button", { name: "Upload photo" });
      const input = form.locator('input[type="file"]');
      const before = (await rows(page, "photos")).length;
      await expect(upload).toBeDisabled();
      await expectUncovered(form.locator("label").filter({ hasText: "Take or choose a progress photo" }));
      await expect(input).toHaveAttribute("accept", "image/*");
      expect(await input.getAttribute("capture"), "phones must offer the photo library, not only the camera").toBeNull();

      await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a photo") });
      await expect(form.getByText("notes.txt")).toBeVisible();
      await press(upload);
      await alertToast(page, "That file isn't an image.");

      const png = await page.evaluate(() => {
        const c = document.createElement("canvas");
        c.width = 300;
        c.height = 400;
        const g = c.getContext("2d")!;
        g.fillStyle = "#c9a14a";
        g.fillRect(0, 0, 300, 400);
        g.fillStyle = "#222";
        g.fillRect(100, 80, 100, 240);
        return c.toDataURL("image/png").split(",")[1];
      });
      await input.setInputFiles({ name: "progress.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
      await expect(form.getByText("progress.png")).toBeVisible();
      await expect(upload).toBeEnabled();
      const d1 = addDays(today, -1);
      await type(form.getByLabel("Date"), d1);
      await expectUncovered(form.getByLabel("Pose"));
      for (const p of ["back", "other", "side"]) {
        await form.getByLabel("Pose").selectOption(p);
        await expect(form.getByLabel("Pose")).toHaveValue(p);
      }
      await type(form.getByLabel("Caption"), "Week 10");
      await press(upload);
      await toast(page, "Photo saved privately.");
      await poll(async () => (await rows(page, "photos")).length).toBe(before + 1);
      const ph = (await rows(page, "photos")).find((p) => p.caption === "Week 10")!;
      expect([ph.taken_on, ph.pose]).toEqual([d1, "side"]);
      await expect(upload).toBeDisabled();
      await expect(form.getByText("Take or choose a progress photo")).toBeVisible();
      await expect(form.getByLabel("Caption")).toHaveValue("");

      await nav(page, "/progress");
      const fig = page.locator("figure").filter({ has: page.getByRole("img", { name: `Progress photo ${fmtDate(d1)}` }) });
      await fig.first().scrollIntoViewIfNeeded();
      await expect(fig.first()).toBeVisible();
      await expect(fig.first()).toContainText("side");
      await poll(() => fig.first().locator("img").evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
      await page.reload();
      await settle(page);
      await fig.first().scrollIntoViewIfNeeded();
      await poll(() => fig.first().locator("img").evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(0);

      // Recent lists: Show all, and Full history.
      await nav(page, "/log?tab=body");
      const weighins = panel(page, "Recent weigh-ins");
      const total = (await rows(page, "weights")).length;
      await expect(weighins.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Edit" }) })).toHaveCount(10);
      await press(weighins.getByRole("button", { name: `Show all ${total}` }));
      await expect(weighins.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Edit" }) })).toHaveCount(total);
      const checks = panel(page, "Recent check-ins & symptoms");
      const nChecks = (await rows(page, "checkins")).length;
      await press(checks.getByRole("button", { name: `Show all ${nChecks}` }));
      await expect(checks.locator("ul").first().getByRole("listitem").filter({ has: page.getByRole("button", { name: "Edit" }) })).toHaveCount(nChecks);
      await press(weighins.getByRole("link", { name: "Full history →" }));
      await expect(page).toHaveURL(/#\/progress$/);
      await expect(page.getByRole("heading", { name: "All weigh-ins" })).toBeVisible();
      await finish(page, errors);
    });

    test("nutrition: meal types, macros with decimals, duplicate confirm, day picker in step with the form, edit, delete", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      await nav(page, "/log?tab=nutrition");
      const today = await appToday(page);
      const form = page.locator("form", { has: page.getByRole("button", { name: "Log meal" }) });
      const day = page.getByLabel("Day", { exact: true });
      const totals = page.locator(".card", { hasText: "Day total" });
      const tile = (k: string) => totals.locator(".grid > div", { hasText: k }).locator("div").nth(1);
      const expectTotals = async (cal: string, p: string, c: string, f: string) => {
        await expect(tile("Calories")).toHaveText(cal);
        await expect(tile("Protein")).toHaveText(p);
        await expect(tile("Carbs")).toHaveText(c);
        await expect(tile("Fat")).toHaveText(f);
      };
      const meals = async () => (await rows(page, "nutrition")).map((m) => [m.log_date, m.meal, m.description, m.calories, m.protein_g, m.carbs_g, m.fat_g, m.note]);
      await expect(day).toHaveValue(today);
      await expect(form.getByLabel("Date")).toHaveValue(today);
      for (const k of ["Calories", "Protein", "Carbs", "Fat", "Water"]) await expectUncovered(totals.locator(".grid > div", { hasText: k }));
      // The tile labels fit their tiles (no overlapping labels on a phone).
      expect(await totals.locator(".grid > div > div:first-child").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent))).toEqual([]);

      await press(form.getByRole("button", { name: "Log meal" }));
      await alertToast(page, "Describe the meal or enter at least calories or protein.");
      await type(form.getByLabel("Calories (optional)"), "-5");
      await press(form.getByRole("button", { name: "Log meal" }));
      await alertToast(page, "Calories must be between 0 and 10000.");
      await expect(form.getByLabel("Calories (optional)")).toHaveValue("-5");

      for (const m of ["Breakfast", "Dinner", "Snack", "Lunch"]) {
        await press(form.getByRole("radio", { name: m }));
        await expect(form.getByRole("radio", { name: m })).toHaveAttribute("aria-checked", "true");
      }
      await type(form.getByLabel("What"), "Chicken & rice");
      await type(form.getByLabel("Calories (optional)"), "650");
      await type(form.getByLabel("Protein"), "45.5");
      await type(form.getByLabel("Carbs"), "70");
      await type(form.getByLabel("Fat"), "12.5");
      await type(form.getByLabel("Note"), "post-run");
      await press(form.getByRole("button", { name: "Log meal" }));
      await toast(page, "Meal logged.");
      await poll(meals).toEqual([[today, "lunch", "Chicken & rice", 650, 45.5, 70, 12.5, "post-run"]]);
      await expect(form.getByLabel("What")).toHaveValue("");
      await expectTotals("650", "46g", "70g", "13g");
      await expect(item(totals, "Lunch · Chicken & rice")).toContainText("650 kcal · 45.5 g protein");

      // The same meal again asks first.
      await type(form.getByLabel("What"), "Chicken & rice");
      await type(form.getByLabel("Calories (optional)"), "650");
      await press(form.getByRole("button", { name: "Log meal" }));
      const dup = dialog(page, "Possible duplicate");
      await press(dup.getByRole("button", { name: "Cancel" }));
      await expect(dup).toBeHidden();
      expect(await rows(page, "nutrition")).toHaveLength(1);
      await press(form.getByRole("button", { name: "Log meal" }));
      await press(dup.getByRole("button", { name: "Log it again" }));
      await toast(page, "Meal logged.");
      await poll(async () => (await rows(page, "nutrition")).length).toBe(2);
      await expectTotals("1300", "46g", "70g", "13g");
      await deleteRow(page, item(totals, "Lunch · Chicken & rice").filter({ hasNotText: "protein" }), "Delete this meal?");
      await expectTotals("650", "46g", "70g", "13g");

      // Edit sheet.
      const sheet = await openSheet(page, item(totals, "Lunch · Chicken & rice"), "Edit meal");
      await expect(sheet.getByLabel("Calories (optional)")).toHaveValue("650");
      await press(sheet.getByRole("radio", { name: "Dinner" }));
      await type(sheet.getByLabel("Calories (optional)"), "700");
      await type(sheet.getByLabel("Fat"), "20.4");
      await press(sheet.getByRole("button", { name: "Save changes" }));
      await toast(page, "Meal updated.");
      await expect(sheet).toBeHidden();
      await poll(meals).toEqual([[today, "dinner", "Chicken & rice", 700, 45.5, 70, 20.4, "post-run"]]);
      await expectTotals("700", "46g", "70g", "20g");

      // The day picker and the form's date move together, so a meal logged for another day shows in its list.
      const d1 = addDays(today, -1);
      await type(day, d1);
      await expect(form.getByLabel("Date")).toHaveValue(d1);
      await expect(totals.getByText("No meals logged for this day.")).toBeVisible();
      await expectTotals("0", "0g", "0g", "0g");
      await press(form.getByRole("radio", { name: "Snack" }));
      await type(form.getByLabel("What"), "Apple");
      await type(form.getByLabel("Calories (optional)"), "95");
      await press(form.getByRole("button", { name: "Log meal" }));
      await toast(page, "Meal logged.");
      await expect(item(totals, "Snack · Apple")).toBeVisible();
      await expectTotals("95", "0g", "0g", "0g");
      await type(form.getByLabel("Date"), today);
      await expect(day).toHaveValue(today);
      await expectTotals("700", "46g", "70g", "20g");

      await page.reload();
      await settle(page);
      await expectTotals("700", "46g", "70g", "20g");
      await deleteRow(page, item(totals, "Dinner · Chicken & rice"), "Delete this meal?");
      await expectTotals("0", "0g", "0g", "0g");
      await poll(async () => (await meals()).map((m) => m[2])).toEqual(["Apple"]);

      // With no habits yet, Habits & mind points to where they're created.
      await press(page.getByRole("radiogroup").first().getByRole("radio", { name: "Habits & mind" }));
      expect(await rows(page, "habits")).toHaveLength(0);
      await expect(page.getByText("No habits yet.")).toBeVisible();
      await press(page.getByRole("link", { name: "Create habits" }));
      await expect(page).toHaveURL(/#\/habits$/);
      await finish(page, errors);
    });

    test("audience: each platform alone and together, validation, typo confirm, same-day replace — and every view updates", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      await nav(page, "/log?tab=audience");
      const today = await appToday(page);
      const d14 = addDays(today, -14);
      const form = page.getByRole("form", { name: "Audience form" });
      const ig = form.getByLabel("Instagram followers");
      const yt = form.getByLabel("YouTube subscribers");
      const sk = form.getByLabel("Skool members");
      const date = form.getByLabel("Reading date");
      const note = form.getByLabel("Note");
      const save = form.getByRole("button", { name: "Save audience" });
      const card = panel(page, "Audience");
      const chart = page.locator("section.card", { has: page.getByRole("radio", { name: "Skool" }) });
      const recent = panel(page, "Recent readings");
      const saved = async () => (await rows(page, "audience")).map((r) => [r.platform, r.recorded_on, r.count, r.note]).sort();
      for (const c of [ig, yt, sk, date, note, save]) await expectUncovered(c);
      await expect(date).toHaveValue(today);
      for (const f of [ig, yt, sk]) await expect(form.getByText("First reading")).toHaveCount(3);
      await expectAudienceCard(card, ["—", "—", "—"]);
      await expect(chart.getByText("No Instagram readings yet.")).toBeVisible();
      await expect(recent.getByText("No readings yet. Enter today's totals above.")).toBeVisible();

      // Validation: readable, keeps what was typed, saves nothing.
      await press(save);
      await alertToast(page, "Enter at least one count.");
      for (const [v, msg] of [["-5", "Instagram followers can't be negative."], ["12.5", "Instagram followers must be a whole number."], ["lots", "Instagram followers: enter a number"]]) {
        await type(ig, v);
        await press(save);
        await alertToast(page, msg);
        await expect(ig).toHaveValue(v);
      }
      expect(await rows(page, "audience")).toHaveLength(0);

      // YouTube alone, on an earlier date: the chart switches to the platform that has readings.
      await type(ig, "");
      await type(date, d14);
      await type(yt, "980");
      await type(note, "starting point");
      await press(save);
      await toast(page, "Saved 980 YouTube.");
      // Toasts have nothing to tap, so taps pass through them to whatever is underneath.
      await expect(page.getByRole("status").filter({ hasText: "Saved 980 YouTube." }).first()).toHaveCSS("pointer-events", "none");
      await poll(saved).toEqual([["youtube", d14, 980, "starting point"]]);
      await expect(yt).toHaveValue("");
      await expect(note).toHaveValue("");
      await expect(date).toHaveValue(d14);
      // Each row's buttons say which reading they act on.
      await expect(recent.getByRole("button", { name: "Edit YouTube · 980 subscribers", exact: true })).toBeVisible();
      await expect(recent.getByRole("button", { name: "Delete YouTube · 980 subscribers", exact: true })).toBeVisible();
      await expectAudienceCard(card, ["—", "980", "—"]);
      await expect(chart.getByRole("heading", { name: "YouTube subscribers" })).toBeVisible();
      await expect(chart.locator(".recharts-surface")).toBeVisible();
      await expect(item(recent, "YouTube · 980 subscribers")).toContainText(`${fmtDate(d14)} · starting point`);

      // Instagram alone, typed with a thousands separator.
      await type(ig, "1,180");
      await press(save);
      await toast(page, "Saved 1,180 Instagram.");
      await poll(saved).toContainEqual(["instagram", d14, 1180, null]);
      await expectAudienceCard(card, ["1,180", "980", "—"]);
      await expect(item(recent, "Instagram · 1,180 followers")).toBeVisible();

      // All three together today, YouTube in the abbreviated form the apps show.
      await type(date, today);
      await expect(form.getByText(`Last: 1,180 on ${fmtDate(d14)}`)).toBeVisible();
      await expect(form.getByText(`Last: 980 on ${fmtDate(d14)}`)).toBeVisible();
      await type(ig, "1,240");
      await type(yt, "1.1K");
      await type(sk, "52");
      await type(note, "launch week");
      await press(save);
      await toast(page, "Saved 1,240 Instagram, 1,100 YouTube, 52 Skool.");
      await expect(dialog(page, "Milestone unlocked")).toBeVisible(); // 1,000 YouTube subscribers
      await settle(page);
      await poll(saved).toEqual([
        ["instagram", d14, 1180, null], ["instagram", today, 1240, "launch week"], ["skool", today, 52, "launch week"],
        ["youtube", d14, 980, "starting point"], ["youtube", today, 1100, "launch week"],
      ]);
      await expectAudienceCard(card, ["1,240", "1,100", "52"]);
      await expect(card).toContainText(`Last recorded ${fmtDate(today)}`);

      // Same day again replaces that platform's reading.
      await type(ig, "1260");
      await expect(form.getByText("1,240 already recorded for this date — saving replaces it.")).toBeVisible();
      await press(save);
      await toast(page, "Saved 1,260 Instagram.");
      await poll(async () => (await saved()).filter((r) => r[0] === "instagram")).toEqual([["instagram", d14, 1180, null], ["instagram", today, 1260, null]]);
      await expect(item(recent, "Instagram · 1,260 followers")).toHaveCount(1);
      await expect(item(recent, "Instagram · 1,240 followers")).toHaveCount(0);

      // A big jump asks first: Cancel keeps the typed number; "They're correct" saves it.
      await type(ig, "12,600");
      await press(save);
      const check = dialog(page, "Double-check these numbers");
      await expect(check).toContainText("Instagram: 12,600 followers is a big jump from 1,180 14 day(s) earlier.");
      await press(check.getByRole("button", { name: "Cancel" }));
      await expect(check).toBeHidden();
      await expect(ig).toHaveValue("12,600");
      await poll(saved).toContainEqual(["instagram", today, 1260, null]);
      await press(save);
      await press(check.getByRole("button", { name: "They're correct — save" }));
      await toast(page, "Saved 12,600 Instagram.");
      await expect(dialog(page, "Milestone unlocked")).toBeVisible();
      await settle(page);
      await poll(saved).toContainEqual(["instagram", today, 12600, null]);
      await expectAudienceCard(card, ["12,600", "1,100", "52"]);

      // Future dates are refused.
      await type(date, addDays(today, 1));
      await type(sk, "60");
      await expectFutureRefused(page, date, save, "You can't record counts for a future date.");
      await poll(async () => (await saved()).length).toBe(5);

      // Skool alone, back-dated: the card still shows the latest reading.
      await type(date, d14);
      await type(sk, "40");
      await press(save);
      await toast(page, "Saved 40 Skool.");
      await poll(saved).toContainEqual(["skool", d14, 40, null]);
      await expectAudienceCard(card, ["12,600", "1,100", "52"]);
      await expect(item(recent, "Skool · 40 members")).toContainText(fmtDate(d14));
      await type(date, today);

      // Today and Business show the same numbers right away.
      await nav(page, "/");
      await expectAudienceCard(panel(page, "Audience"), ["12,600", "1,100", "52"]);
      await nav(page, "/business");
      await expectAudienceCard(panel(page, "Audience"), ["12,600", "1,100", "52"]);
      await expect(panel(page, "Audience")).toContainText(`+11,420 since ${fmtDate(d14).replace(/, \d+$/, "")}`);

      // Charts: each platform is a metric.
      await nav(page, "/charts");
      await press(page.getByRole("radio", { name: "30D" }));
      for (const [label, change] of [["Instagram followers", "11,420"], ["YouTube subscribers", "120"], ["Skool members", "12"]]) {
        await page.getByLabel("Metric").selectOption({ label });
        await expect(page.getByRole("heading", { name: label })).toBeVisible();
        await expect(page.locator(".card", { hasText: "Change · this period" }).locator(".num")).toHaveText(change);
      }

      // Milestones: the Audience category shows what was earned and what's next.
      await nav(page, "/achievements");
      await press(page.getByRole("radio", { name: "Audience" }));
      const tile = (t: string) => page.locator("button.rounded-2xl").filter({ has: page.getByText(t, { exact: true }) });
      for (const t of ["2,500 Instagram followers", "5,000 Instagram followers", "10,000 Instagram followers", "1,000 YouTube subscribers"]) {
        await expect(tile(t)).toContainText(fmtDate(today));
      }
      await expect(tile("25,000 Instagram followers")).toContainText("12,600 followers of 25,000 followers");
      await expect(tile("100 Skool members")).toContainText("52 members of 100 members");
      await expect(page.getByTestId("timeline")).toContainText("10,000 Instagram followers");

      await page.reload();
      await settle(page);
      await nav(page, "/log?tab=audience");
      await expectAudienceCard(panel(page, "Audience"), ["12,600", "1,100", "52"]);
      await expect(recent.getByRole("listitem")).toHaveCount(6);
      await finish(page, errors);
    });

    test("audience: edit sheet, date clash, delete, chart platform picker, Show all — milestones and cards recalculate", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      await nav(page, "/log?tab=audience");
      const today = await appToday(page);
      const form = page.getByRole("form", { name: "Audience form" });
      const save = form.getByRole("button", { name: "Save audience" });
      const card = panel(page, "Audience");
      const chart = page.locator("section.card", { has: page.getByRole("radio", { name: "Skool" }) });
      const recent = panel(page, "Recent readings");
      const saved = async () => (await rows(page, "audience")).map((r) => [r.platform, r.recorded_on, r.count, r.note]).sort();
      // Five weekly readings of each platform (13 in all), entered one week at a time.
      for (let w = 4; w >= 0; w--) {
        await type(form.getByLabel("Reading date"), addDays(today, -7 * w));
        await type(form.getByLabel("Instagram followers"), String(2000 + 120 * (4 - w)));
        await type(form.getByLabel("YouTube subscribers"), String(400 + 30 * (4 - w)));
        if (w <= 2) await type(form.getByLabel("Skool members"), String(80 + 5 * (2 - w)));
        await press(save);
        await toast(page, /^Saved /);
      }
      await expect(dialog(page, "Milestone unlocked")).toBeVisible(); // 500 YouTube subscribers
      await settle(page);
      await poll(async () => (await rows(page, "audience")).length).toBe(13);
      await expectAudienceCard(card, ["2,480", "520", "90"]);

      // Show all.
      const editable = recent.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Edit" }) });
      await expect(editable).toHaveCount(12);
      await press(recent.getByRole("button", { name: "Show all 13" }));
      await expect(editable).toHaveCount(13);

      // Chart platform picker.
      const curve = chart.locator("path.recharts-line-curve");
      for (const [p, title] of [["YouTube", "YouTube subscribers"], ["Skool", "Skool members"], ["Instagram", "Instagram followers"]]) {
        await press(chart.getByRole("radio", { name: p }));
        await expect(chart.getByRole("radio", { name: p })).toHaveAttribute("aria-checked", "true");
        await expect(chart.getByRole("heading", { name: title })).toBeVisible();
        await expect(curve).toHaveCount(1);
      }
      await poll(() => curve.getAttribute("d")).toMatch(/^M/);
      const shapeBefore = await curve.getAttribute("d");

      // Edit today's Instagram reading: count and note.
      const row = item(recent, "Instagram · 2,480 followers");
      const sheet = await openSheet(page, row, "Edit reading", "all");
      await expect(sheet.getByLabel("Instagram followers")).toHaveValue("2480");
      await expect(sheet.getByLabel("Reading date")).toHaveValue(today);
      await expect(sheet.getByLabel("YouTube subscribers")).toHaveCount(0);
      await expect(sheet.getByLabel("Skool members")).toHaveCount(0);
      await expectUncovered(sheet.getByRole("button", { name: "Save changes" }));
      await type(sheet.getByLabel("Instagram followers"), "2,610");
      await type(sheet.getByLabel("Note"), "collab reel");
      await press(sheet.getByRole("button", { name: "Save changes" }));
      await toast(page, "Reading updated.");
      await expect(sheet).toBeHidden();
      await expect(dialog(page, "Milestone unlocked")).toBeVisible(); // 2,500 Instagram followers
      await settle(page);
      await poll(saved).toContainEqual(["instagram", today, 2610, "collab reel"]);
      await expectAudienceCard(card, ["2,610", "520", "90"]);
      await expect(item(recent, "Instagram · 2,610 followers")).toContainText(`${fmtDate(today)} · collab reel`);
      await poll(() => curve.getAttribute("d")).not.toBe(shapeBefore);
      await nav(page, "/achievements");
      await press(page.getByRole("radio", { name: "Audience" }));
      const tile = page.locator("button.rounded-2xl").filter({ has: page.getByText("2,500 Instagram followers", { exact: true }) });
      await expect(tile).toContainText(fmtDate(today));
      await expect(tile).toBeEnabled();

      // Edit back below 2,500: the milestone is no longer earned.
      await nav(page, "/log?tab=audience");
      const sheet2 = await openSheet(page, item(recent, "Instagram · 2,610 followers"), "Edit reading", "none");
      await type(sheet2.getByLabel("Instagram followers"), "2490");
      await press(sheet2.getByRole("button", { name: "Save changes" }));
      await toast(page, "Reading updated.");
      await expectAudienceCard(card, ["2,490", "520", "90"]);
      await nav(page, "/achievements");
      await press(page.getByRole("radio", { name: "Audience" }));
      await expect(tile).toBeDisabled();
      await expect(tile).toContainText("2,490 followers of 2,500 followers");
      await poll(async () => (await rows(page, "achievements")).filter((a) => a.key === "audience.instagram.2500").length).toBe(0);

      // Delete every Skool reading: the card, chart, Charts page and milestones all drop it.
      await nav(page, "/log?tab=audience");
      await press(recent.getByRole("button", { name: "Show all 13" }));
      for (const n of ["90", "85", "80"]) await deleteRow(page, item(recent, `Skool · ${n} members`), "Delete this reading?");
      await poll(async () => (await saved()).filter((r) => r[0] === "skool")).toEqual([]);
      await expectAudienceCard(card, ["2,490", "520", "—"]);
      await press(chart.getByRole("radio", { name: "Skool" }));
      await expect(chart.getByText("No Skool readings yet.")).toBeVisible();
      await nav(page, "/charts");
      await press(page.getByRole("radio", { name: "30D" }));
      await page.getByLabel("Metric").selectOption({ label: "Skool members" });
      await expect(page.getByText("No saved records for this metric in this range.")).toBeVisible();
      await nav(page, "/achievements");
      await press(page.getByRole("radio", { name: "Audience" }));
      await expect(page.getByRole("button", { name: /Skool members/ })).toHaveCount(0);
      await nav(page, "/");
      await expectAudienceCard(panel(page, "Audience"), ["2,490", "520", "—"]);

      // Moving a reading onto a date that already has one is refused with a clear message, and nothing changes.
      await nav(page, "/log?tab=audience");
      const sheet3 = await openSheet(page, item(recent, "Instagram · 2,490 followers"), "Edit reading", "none");
      await type(sheet3.getByLabel("Reading date"), addDays(today, -7));
      await expect(sheet3.getByText("2,360 is already recorded for this date — choose another date.")).toBeVisible();
      await press(sheet3.getByRole("button", { name: "Save changes" }));
      await alertToast(page, `Instagram already has a reading for ${fmtDate(addDays(today, -7))} (2,360).`);
      await expect(sheet3).toBeVisible();
      await expect(sheet3.getByLabel("Reading date")).toHaveValue(addDays(today, -7));
      await page.keyboard.press("Escape");
      await expect(sheet3).toBeHidden();
      await poll(saved).toContainEqual(["instagram", today, 2490, "collab reel"]);
      await poll(saved).toContainEqual(["instagram", addDays(today, -7), 2360, null]);

      await page.reload();
      await settle(page);
      await nav(page, "/log?tab=audience");
      await poll(async () => (await rows(page, "audience")).length).toBe(10);
      await expect(item(recent, "Instagram · 2,490 followers")).toContainText("collab reel");
      await finish(page, errors);
    });

    test("habits & mind: habit toggles on any date, journal kinds, sharing, edit, delete, Show all", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "demo");
      await nav(page, "/log?tab=mind");
      const today = await appToday(page);
      const habits = page.locator(".card", { has: page.getByRole("heading", { name: "Habits", exact: true }) });
      const habitDate = page.getByLabel("Habit date");
      const all = await rows(page, "habits");
      const plan = all.find((h) => h.name === "Plan tomorrow")!;
      const done = async (habitId: unknown, d: string) => (await rows(page, "completions")).some((c) => c.habit_id === habitId && c.completed_on === d);
      await expect(habitDate).toHaveValue(today);
      const btn = habits.getByRole("button", { name: /^Plan tomorrow/ });
      const todayBtn = page.getByRole("button", { name: /^Plan tomorrow/ });
      const left = async () => Number((await page.getByText(/^\d+ left of \d+ scheduled$/).textContent())!.split(" ")[0]);
      await nav(page, "/");
      await expect(todayBtn).toHaveAttribute("aria-pressed", "true");
      const leftBefore = await left();
      await nav(page, "/log?tab=mind");
      await expect(btn).toHaveAttribute("aria-pressed", "true");
      await press(btn);
      await expect(btn).toHaveAttribute("aria-pressed", "false");
      await poll(() => done(plan.id, today)).toBe(false);
      await nav(page, "/");
      await expect(todayBtn).toHaveAttribute("aria-pressed", "false");
      expect(await left()).toBe(leftBefore + 1);
      await nav(page, "/log?tab=mind");
      await press(btn);
      await expect(btn).toHaveAttribute("aria-pressed", "true");
      await poll(() => done(plan.id, today)).toBe(true);
      await settle(page);

      // An earlier date: the list follows it and toggles that day.
      const d1 = addDays(today, -1);
      await type(habitDate, d1);
      const was = await done(plan.id, d1);
      await expect(btn).toHaveAttribute("aria-pressed", String(was));
      await press(btn);
      await expect(btn).toHaveAttribute("aria-pressed", String(!was));
      await poll(() => done(plan.id, d1)).toBe(!was);
      await press(btn);
      await poll(() => done(plan.id, d1)).toBe(was);
      await settle(page);

      // An unscheduled habit can still be ticked.
      await type(habitDate, today);
      const extra = habits.getByRole("listitem").filter({ hasText: "not scheduled" }).getByRole("button").first();
      if (await extra.count()) {
        const name = (await extra.textContent())!.replace("not scheduled", "").trim();
        const h = all.find((x) => x.name === name)!;
        await press(extra);
        await expect(extra).toHaveAttribute("aria-pressed", "true");
        await poll(() => done(h.id, today)).toBe(true);
        await settle(page);
        await press(extra);
        await poll(() => done(h.id, today)).toBe(false);
      }
      await settle(page);

      // Journal.
      const form = page.locator("form", { has: page.getByRole("button", { name: "Save entry" }) });
      const list = panel(page, "Recent entries");
      const entries = async () => (await rows(page, "journal")).filter((j) => !String(j.title ?? "").includes("(demo)"))
        .map((j) => [j.entry_date, j.kind, j.title, j.body, j.minutes, j.shared]);
      await press(form.getByRole("button", { name: "Save entry" }));
      await alertToast(page, "Write something first.");
      for (const k of ["Reflection", "Learning", "Journal"]) {
        await press(form.getByRole("radio", { name: k }));
        await expect(form.getByRole("radio", { name: k })).toHaveAttribute("aria-checked", "true");
      }
      await type(form.getByLabel("Title"), "Morning pages");
      await type(form.getByLabel("Entry", { exact: true }), "Felt strong today.\nSecond line.");
      const share = form.getByRole("switch", { name: /Share this entry with my partner/ });
      await press(share);
      await expect(share).toHaveAttribute("aria-checked", "true");
      await press(form.getByRole("button", { name: "Save entry" }));
      await toast(page, "Entry saved.");
      await poll(entries).toEqual([[today, "journal", "Morning pages", "Felt strong today.\nSecond line.", null, true]]);
      await expect(share).toHaveAttribute("aria-checked", "false");
      await expect(item(list, "Morning pages")).toContainText("journal · shared with partner");

      await press(form.getByRole("radio", { name: "Learning" }));
      await type(form.getByLabel("Date"), d1);
      await type(form.getByLabel("Minutes"), "25.5");
      await type(form.getByLabel("What did you read or learn?"), "Atomic Habits ch. 3");
      await type(form.getByLabel("Notes"), "Identity first.");
      await press(form.getByRole("button", { name: "Save entry" }));
      await toast(page, "Entry saved.");
      await poll(entries).toContainEqual([d1, "learning", "Atomic Habits ch. 3", "Identity first.", 26, false]);
      await expect(item(list, "Atomic Habits ch. 3")).toContainText("learning · 26 min · private");

      await press(form.getByRole("radio", { name: "Reflection" }));
      await type(form.getByLabel("Reflection"), "A calm week.");
      await press(form.getByRole("button", { name: "Save entry" }));
      await toast(page, "Entry saved.");
      await expect(item(list, "A calm week.")).toContainText("reflection · private");

      // Show all (10 demo entries + 3).
      const total = (await rows(page, "journal")).length;
      await press(list.getByRole("button", { name: `Show all ${total}` }));
      await expect(list.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Edit" }) })).toHaveCount(total);

      const sheet = await openSheet(page, item(list, "Morning pages"), "Edit entry");
      await expect(sheet.getByLabel("Entry", { exact: true })).toHaveValue("Felt strong today.\nSecond line.");
      await press(sheet.getByRole("switch"));
      await type(sheet.getByLabel("Title"), "Morning pages, edited");
      await press(sheet.getByRole("button", { name: "Save changes" }));
      await toast(page, "Entry updated.");
      await poll(entries).toContainEqual([today, "journal", "Morning pages, edited", "Felt strong today.\nSecond line.", null, false]);
      await expect(item(list, "Morning pages, edited")).toContainText("private");

      await deleteRow(page, item(list, "Atomic Habits ch. 3"), "Delete this entry?");
      await poll(async () => (await entries()).length).toBe(2);
      await page.reload();
      await settle(page);
      await expect(item(list, "Morning pages, edited")).toBeVisible();
      await press(list.getByRole("link", { name: "Weekly reflection →" }));
      await expect(page).toHaveURL(/#\/reviews/);
      await finish(page, errors);
    });
  });
}

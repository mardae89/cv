// Control-by-control audit of setup (src/pages/Onboarding.tsx) on a phone and a
// desktop: every step's fields, plan cards, switches, Back / Skip / Save, "Skip
// setup for now", the sample-data dialog, what gets stored, where it shows up
// afterwards, and running setup again after the records are cleared.
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, go, openFresh, rows, settle, stored, type ViewportName } from "./helpers";

const SIZES: ViewportName[] = ["mobile", "desktop"];
const atHome = (u: URL) => u.hash === "#/" || u.hash === "";

function addDays(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const localToday = (page: Page) => page.evaluate(() => new Intl.DateTimeFormat("en-CA").format(new Date()));

/** Scrolled into view, inside the screen's width, and the topmost thing where a finger lands. */
async function reachable(loc: Locator) {
  await loc.scrollIntoViewIfNeeded();
  await expect(loc).toBeVisible();
  const r = await loc.evaluate((el) => {
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    const top = !!hit && (hit === el || el.contains(hit));
    return { inside: b.left >= -0.5 && b.right <= window.innerWidth + 0.5 && b.height > 0, top, ...(top ? {} : { el: el.outerHTML.slice(0, 120), hit: hit?.outerHTML.slice(0, 120) }) };
  });
  expect(r, "control is on screen and not covered").toEqual({ inside: true, top: true });
}

/**
 * A fresh person on the first setup screen. Step changes slide in; most tests
 * ask for reduced motion so they don't wait out each slide (the full-setup test
 * keeps the motion on).
 */
async function open(browser: Browser, vp: ViewportName, motion = false) {
  const o = await openFresh(browser, vp, "onboarding");
  if (!motion) await o.page.emulateMedia({ reducedMotion: "reduce" });
  return o;
}

const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });
const stepText = (page: Page) => page.getByText(/^Setup · step \d+ of \d+$/);
const btn = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const alertText = (page: Page, text: string) => page.getByRole("alert").filter({ hasText: text }).first();
const plan = (page: Page) => ({
  primary: page.getByRole("button", { name: /^Body, business and a 10K/ }),
  partner: page.getByRole("button", { name: /^My own transformation/ }),
  custom: page.getByRole("button", { name: /^Custom/ }),
});
const bizSwitch = (page: Page) => page.getByRole("switch", { name: /Track business performance/ });

async function to(page: Page, button: "Continue" | "Save & continue" | "Skip" | "Back", next: string) {
  await btn(page, button).click();
  await expect(heading(page, next)).toBeVisible();
  // A new step opens at its heading, not scrolled to where the last one ended.
  await expect(heading(page, next)).toBeInViewport();
}

/** What Settings → reset leaves behind: no records, setup not done, sharing and reminders kept. */
async function clearRecords(page: Page) {
  await page.goto("/icon.svg"); // same origin, without the app running
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("becoming-os");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise<void>((res, rej) => {
      const t = db.transaction("docs", "readwrite");
      const st = t.objectStore("docs");
      const all = st.getAll();
      all.onsuccess = () => {
        for (const d of all.result as { path: string; data: Record<string, unknown> }[]) {
          if (!d.path.startsWith("data/users/local/")) continue;
          const id = d.path.slice("data/users/local/".length);
          if (id.startsWith("t~") || ["s~goals", "s~athletic", "s~businessSettings"].includes(id)) st.delete(d.path);
          else if (id === "profile") {
            const row = { ...(d.data.row as Record<string, unknown>), onboarding_done: false, demo_mode: false, demo_today: null, plan_preset: null, business_enabled: false };
            st.put({ ...d, data: { ...d.data, row } });
          }
        }
      };
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
    db.close();
  });
  await page.goto("/");
  await page.waitForURL("**/#/onboarding");
}

for (const vp of SIZES) {
  test.describe(`onboarding @ ${vp}`, () => {
    test("plan step: name, plan cards, business switch, Continue and Back", async ({ browser }) => {
      const { page, errors } = await open(browser, vp);
      const p = plan(page);
      const name = page.getByLabel("Your name");
      const cont = btn(page, "Continue");
      await expect(heading(page, "Welcome.")).toBeVisible();
      await expect(stepText(page)).toHaveText("Setup · step 1 of 6");
      for (const c of [btn(page, "Skip setup for now"), name, p.primary, p.partner, p.custom, bizSwitch(page),
        page.getByRole("button", { name: /Explore with sample data instead/ })]) await reachable(c);
      // Nobody gets a plan chosen for them.
      for (const c of Object.values(p)) await expect(c).toHaveAttribute("aria-pressed", "false");
      await expect(cont).toBeDisabled();

      await name.fill("Jordan Lee");
      await expect(name).toHaveValue("Jordan Lee");

      await p.custom.click();
      await expect(p.custom).toHaveAttribute("aria-pressed", "true");
      await expect(bizSwitch(page)).toHaveAttribute("aria-checked", "false");
      await expect(cont).toBeEnabled();
      await reachable(cont);
      await bizSwitch(page).click();
      await expect(bizSwitch(page)).toHaveAttribute("aria-checked", "true");
      await expect(stepText(page)).toHaveText("Setup · step 1 of 7"); // adds the business step
      await page.getByText("Track business performance", { exact: true }).click(); // the label works too
      await expect(bizSwitch(page)).toHaveAttribute("aria-checked", "false");
      await expect(stepText(page)).toHaveText("Setup · step 1 of 6");

      await p.primary.click();
      await expect(p.primary).toHaveAttribute("aria-pressed", "true");
      await expect(p.custom).toHaveAttribute("aria-pressed", "false");
      await expect(bizSwitch(page)).toHaveAttribute("aria-checked", "true");
      await p.partner.click();
      await expect(bizSwitch(page)).toHaveAttribute("aria-checked", "false");
      await p.primary.click();
      await expectNoHorizontalScroll(page);

      await to(page, "Continue", "Body baseline");
      await expect(stepText(page)).toHaveText("Setup · step 2 of 7");
      await expect.poll(async () => {
        const pr = (await stored(page)).profile;
        return [pr?.plan_preset, pr?.business_enabled, pr?.display_name, pr?.onboarding_done];
      }).toEqual(["primary", true, "Jordan Lee", false]);

      // Back keeps the choices, and a changed plan is saved again on Continue.
      await to(page, "Back", "Welcome, Jordan Lee.");
      await expect(p.primary).toHaveAttribute("aria-pressed", "true");
      await expect(name).toHaveValue("Jordan Lee");
      await p.partner.click();
      await to(page, "Continue", "Body baseline");
      await expect(stepText(page)).toHaveText("Setup · step 2 of 6");
      await expect.poll(async () => {
        const pr = (await stored(page)).profile;
        return [pr?.plan_preset, pr?.business_enabled];
      }).toEqual(["partner", false]);
      expect(errors).toEqual([]);
    });

    test("Skip setup for now keeps the name, plan and business choice and opens Today", async ({ browser }) => {
      const { page, errors } = await open(browser, vp);
      await page.getByLabel("Your name").fill("Sam");
      await plan(page).primary.click();
      await btn(page, "Skip setup for now").click();
      await page.waitForURL(atHome);
      await settle(page);
      await expect.poll(async () => {
        const pr = (await stored(page)).profile;
        return [pr?.onboarding_done, pr?.display_name, pr?.plan_preset, pr?.business_enabled];
      }).toEqual([true, "Sam", "primary", true]);
      const notice = page.getByText("Finish setting up when you're ready");
      await expect(notice).toBeVisible();
      for (const l of ["starting weight", "training readiness", "current business revenue"]) await expect(page.getByRole("link", { name: l, exact: true })).toBeVisible();
      await expect(heading(page, "Business")).toBeVisible();
      if (vp === "desktop") await expect(page.locator("aside")).toContainText("Sam");
      await page.reload();
      await expect(page.getByTestId("days-remaining")).toBeVisible();
      expect(page.url()).not.toContain("onboarding");
      expect(errors).toEqual([]);
    });

    test("sample data: Cancel, Escape, Close and the backdrop change nothing; confirming loads it", async ({ browser }) => {
      const { page, errors } = await open(browser, vp);
      await page.getByLabel("Your name").fill("Riley");
      const sample = page.getByRole("button", { name: /Explore with sample data instead/ });
      const dialog = page.getByRole("dialog", { name: "Load sample data?" });
      await sample.click();
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("Dec 15, 2026");
      for (const b of ["Close", "Cancel", "Load sample data"]) await reachable(dialog.getByRole("button", { name: b, exact: true }));
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
      await sample.click();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await sample.click();
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await expect(dialog).toBeHidden();
      await sample.click();
      await page.mouse.click(8, 8); // the dimmed backdrop
      await expect(dialog).toBeHidden();
      expect(page.url()).toContain("#/onboarding");
      expect(await rows(page, "weights")).toEqual([]);
      expect((await stored(page)).profile?.onboarding_done).toBe(false);

      await sample.click();
      await dialog.getByRole("button", { name: "Load sample data" }).click();
      await page.waitForURL(atHome, { timeout: 20_000 });
      await settle(page);
      await expect(page.getByText(/DEMO ACCOUNT — sample data only/)).toBeVisible();
      await expect.poll(async () => {
        const pr = (await stored(page)).profile;
        return [pr?.demo_mode, pr?.demo_today, pr?.display_name, pr?.onboarding_done, pr?.business_enabled];
      }).toEqual([true, "2026-12-15", "Riley", true, true]);
      expect((await rows(page, "weights")).length).toBeGreaterThan(10);
      await page.reload();
      await expect(page.getByText(/DEMO ACCOUNT — sample data only/)).toBeVisible();
      expect(errors).toEqual([]);
    });

    test("body step: every field takes input, mistakes keep what was typed, saving stores goals and the first weigh-in", async ({ browser }) => {
      const { page, errors } = await open(browser, vp);
      const today = await localToday(page);
      await plan(page).primary.click();
      await to(page, "Continue", "Body baseline");
      const start = page.getByLabel("Confirm your starting weight");
      const date = page.getByLabel("Weigh-in date");
      const loss = page.getByLabel("Target loss (50–60 lb)");
      const tw = page.getByLabel("Target weight");
      const stretch = page.getByLabel("Stretch goal (optional)");
      const waist = page.getByLabel("Waist (optional)");
      const activity = page.getByLabel("Activity level today");
      const minutes = page.getByLabel("Training time available");
      const notes = page.getByLabel("Health considerations (private)");
      const chip = (n: string) => page.getByRole("button", { name: n, exact: true });
      const pace = (n: string) => page.getByRole("radio", { name: n, exact: true });
      for (const c of [start, date, loss, tw, stretch, waist, pace("Gentle"), pace("Steady"), pace("Ambitious"), activity, minutes,
        chip("Walking"), chip("Dancing"), notes, btn(page, "Back"), btn(page, "Skip"), btn(page, "Save & continue")]) await reachable(c);
      await expectNoHorizontalScroll(page);

      // The plan pre-fills, but asks to be confirmed.
      await expect(start).toHaveValue("267");
      await expect(page.getByText("Pre-filled with the 267 lb from your plan")).toBeVisible();
      await expect(date).toHaveValue(today);
      await expect(loss).toHaveValue("50");
      await expect(tw).toHaveValue("217");
      await expect(stretch).toHaveValue("60");
      await expect(page.getByText("Target: 217 lb · stretch 207 lb")).toBeVisible();

      await start.fill("251.6");
      await expect(page.getByText("Pre-filled with the 267 lb")).toBeHidden();
      await expect(tw).toHaveValue("201.6");
      // A target weight typed key by key (with a decimal) works out the loss; clearing it clears the loss.
      await tw.click();
      await tw.press("ControlOrMeta+a");
      await tw.pressSequentially("199.6");
      await expect(tw).toHaveValue("199.6");
      await expect(loss).toHaveValue("52");
      await tw.press("ControlOrMeta+a");
      await tw.press("Backspace");
      await expect(tw).toHaveValue("");
      await expect(loss).toHaveValue("");
      await loss.fill("52.5");
      await expect(tw).toHaveValue("199.1");
      await stretch.fill("62");
      await waist.fill("44.5");
      const startDate = addDays(today, -3);
      await date.fill(startDate);
      await expect(date).toHaveValue(startDate);
      const perWeek = round2(52.5 / (daysBetween(startDate, "2027-05-24") / 7));
      await expect(page.getByText("Target: 199.1 lb · stretch 189.6 lb")).toBeVisible();
      await expect(page.getByText(`Reaching 52.5 lb by May 24, 2027 averages ${perWeek} lb/week.`, { exact: false })).toBeVisible();

      await expect(pace("Steady")).toHaveAttribute("aria-checked", "true");
      await expect(page.getByText("caps planning at 1.89 lb/week", { exact: false })).toBeVisible();
      await pace("Gentle").click();
      await expect(pace("Gentle")).toHaveAttribute("aria-checked", "true");
      await pace("Ambitious").click();
      await expect(pace("Ambitious")).toHaveAttribute("aria-checked", "true");
      await expect(pace("Steady")).toHaveAttribute("aria-checked", "false");
      await expect(page.getByText("caps planning at 2 lb/week", { exact: false })).toBeVisible();
      await activity.selectOption("light");
      await expect(activity).toHaveValue("light");
      await minutes.fill("150");
      for (const c of ["Walking", "Cycling", "Swimming"]) {
        await chip(c).click();
        await expect(chip(c)).toHaveAttribute("aria-pressed", "true");
      }
      await chip("Walking").click();
      await expect(chip("Walking")).toHaveAttribute("aria-pressed", "false");
      await notes.fill("Left knee — avoid jumping.");

      // Mistakes show a readable message and keep everything typed.
      const save = btn(page, "Save & continue");
      await start.fill("50");
      await save.click();
      await expect(alertText(page, "Enter a starting weight between 70 and 700 lb.")).toBeVisible();
      await expect(start).toHaveValue("50");
      await expect(notes).toHaveValue("Left knee — avoid jumping.");
      await start.fill("251.6");
      await stretch.fill("40");
      await save.click();
      await expect(alertText(page, "The stretch goal should be at least the main goal.")).toBeVisible();
      await expect(stretch).toHaveValue("40");
      await stretch.fill("62");
      await loss.fill("");
      await save.click();
      await expect(alertText(page, "Enter how many pounds you want to lose.")).toBeVisible();
      await loss.fill("52.5");
      await date.fill(addDays(today, 2));
      await save.click();
      await expect(alertText(page, "The weigh-in date can't be in the future.")).toBeVisible();
      await expect(date).toHaveValue(addDays(today, 2));
      await date.fill(startDate);
      await expect(heading(page, "Body baseline")).toBeVisible();
      expect(await rows(page, "weights")).toEqual([]);

      await to(page, "Save & continue", "Training readiness");
      await expect.poll(async () => {
        const g = (await stored(page)).singles.goals ?? {};
        return [g.start_weight, g.start_date, g.target_loss, g.stretch_loss, g.start_waist, g.pace, g.activity_level, g.health_notes, g.preferred_activities, g.weekly_training_minutes];
      }).toEqual([251.6, startDate, 52.5, 62, 44.5, "ambitious", "light", "Left knee — avoid jumping.", ["Cycling", "Swimming"], 150]);
      expect((await rows(page, "weights")).map((w) => [w.entry_date, w.weight, w.waist_in, w.note])).toEqual([[startDate, 251.6, 44.5, "Starting weight"]]);

      // Going back and correcting the start corrects the first weigh-in too (no stale second row).
      await to(page, "Back", "Body baseline");
      // Once saved, it's no longer a pre-fill to confirm.
      await expect(page.getByLabel("Confirm your starting weight")).toHaveCount(0);
      const savedStart = page.getByLabel("Starting weight", { exact: true });
      await expect(savedStart).toHaveValue("251.6");
      await expect(chip("Cycling")).toHaveAttribute("aria-pressed", "true");
      await savedStart.fill("250.2");
      await date.fill(addDays(today, -1));
      await to(page, "Save & continue", "Training readiness");
      await expect.poll(async () => (await rows(page, "weights")).map((w) => [w.entry_date, w.weight])).toEqual([[addDays(today, -1), 250.2]]);
      await expect.poll(async () => (await stored(page)).singles.goals?.start_weight).toBe(250.2);

      // Sample data is refused once something real is logged.
      await to(page, "Back", "Body baseline");
      await to(page, "Back", "Welcome.");
      await page.getByRole("button", { name: /Explore with sample data instead/ }).click();
      await expect(alertText(page, "Sample data can only be loaded before you've logged anything.")).toBeVisible();
      await expect(page.getByRole("dialog")).toBeHidden();
      expect(errors).toEqual([]);
    });

    test("body step without a starting weight still saves the other answers", async ({ browser }) => {
      const { page, errors } = await open(browser, vp);
      await plan(page).partner.click();
      await to(page, "Continue", "Body baseline");
      const start = page.getByLabel("Starting weight", { exact: true });
      const loss = page.getByLabel("Pounds to lose");
      const tw = page.getByLabel("Target weight");
      await expect(start).toHaveValue(""); // never pre-filled for this plan
      await expect(loss).toHaveValue("60");
      await expect(tw).toHaveValue("");

      // A target weight typed before the starting weight is kept and becomes the loss once the weight is in.
      await tw.fill("150");
      await expect(tw).toHaveValue("150");
      await start.fill("212");
      await expect(loss).toHaveValue("62");
      await start.fill("");
      await btn(page, "Save & continue").click();
      await expect(alertText(page, "Enter your starting weight so the target weight can be worked out")).toBeVisible();
      await tw.fill("");
      await expect(loss).toHaveValue("");
      await loss.fill("60");

      await page.getByRole("radio", { name: "Gentle" }).click();
      await page.getByLabel("Activity level today").selectOption("sedentary");
      await page.getByLabel("Training time available").fill("90");
      await page.getByLabel("Waist (optional)").fill("38");
      await page.getByRole("button", { name: "Yoga / mobility", exact: true }).click();
      await to(page, "Save & continue", "Training readiness");
      await expect.poll(async () => {
        const g = (await stored(page)).singles.goals ?? {};
        return [g.start_weight, g.target_loss, g.pace, g.activity_level, g.weekly_training_minutes, g.start_waist, g.preferred_activities];
      }).toEqual([null, 60, "gentle", "sedentary", 90, 38, ["Yoga / mobility"]]);
      expect(await rows(page, "weights")).toEqual([]);

      await to(page, "Skip", "Daily system");
      await to(page, "Skip", "What your partner can see");
      await to(page, "Skip", "Reminders");
      await btn(page, "Skip").click(); // the last Skip finishes setup
      await page.waitForURL(atHome);
      await settle(page);
      await expect(page.getByRole("link", { name: "starting weight", exact: true })).toBeVisible();
      await expect(page.getByText("Confirm your starting weight and goal to start the meters.")).toBeVisible();
      await go(page, "/settings");
      const body = page.locator("#body");
      await expect(body.getByLabel("Target loss")).toHaveValue("60");
      await expect(body.getByLabel("Starting waist")).toHaveValue("38");
      await expect(body.getByRole("radio", { name: "Gentle" })).toHaveAttribute("aria-checked", "true");
      expect(errors).toEqual([]);
    });

    test("training step: readiness, assessed date, notes, days, sessions and goal", async ({ browser }) => {
      const { page, errors } = await open(browser, vp);
      const today = await localToday(page);
      await plan(page).custom.click();
      await to(page, "Continue", "Body baseline");
      await to(page, "Skip", "Training readiness");
      const ready = (n: string) => page.getByRole("button", { name: n, exact: true });
      const assessed = page.getByLabel("Date assessed");
      const injury = page.getByLabel("Injury notes (private)");
      const sessions = page.getByLabel("Sessions per week");
      const goal = page.getByLabel("Athletic goal");
      const day = (n: string) => page.getByRole("button", { name: n, exact: true });
      const labels = ["No current injury", "Symptoms, not yet assessed", "Under a clinician's care", "Assessed — clinician OK'd running"];
      for (const c of [...labels.map(ready), injury, ...["Sunday", "Monday", "Saturday"].map(day), sessions, goal,
        btn(page, "Back"), btn(page, "Skip"), btn(page, "Save & continue")]) await reachable(c);
      await expectNoHorizontalScroll(page);

      await expect(assessed).toHaveCount(0);
      for (const l of labels) {
        await ready(l).click();
        await expect(ready(l)).toHaveAttribute("aria-pressed", "true");
      }
      await ready("Under a clinician's care").click();
      await expect(assessed).toBeVisible();
      await assessed.fill(addDays(today, -20));
      await ready("No current injury").click();
      await expect(assessed).toHaveCount(0);
      await ready("Assessed — clinician OK'd running").click();
      await expect(assessed).toHaveValue(addDays(today, -20));
      await reachable(assessed);
      await assessed.fill(addDays(today, 3));
      await btn(page, "Save & continue").click();
      await expect(alertText(page, "The assessment date can't be in the future.")).toBeVisible();
      await expect(assessed).toHaveValue(addDays(today, 3));
      await assessed.fill(addDays(today, -20));

      await injury.fill("Ankle sore after long walks.");
      for (const d of ["Monday", "Wednesday", "Friday"]) await expect(day(d)).toHaveAttribute("aria-pressed", "true");
      await day("Sunday").click();
      await day("Monday").click();
      await expect(day("Sunday")).toHaveAttribute("aria-pressed", "true");
      await expect(day("Monday")).toHaveAttribute("aria-pressed", "false");
      await expect(sessions).toHaveValue("3");
      await sessions.fill("4");
      await expect(goal).toHaveValue(""); // a custom plan starts blank; blank saves as "Complete a 10K"
      await goal.fill("Run a 10K under 60 minutes");
      await to(page, "Save & continue", "Daily system");
      await expect.poll(async () => {
        const a = (await stored(page)).singles.athletic ?? {};
        return [a.readiness, a.assessed_on, a.injury_notes, a.training_days, a.weekly_session_target, a.goal_text];
      }).toEqual(["cleared_by_clinician", addDays(today, -20), "Ankle sore after long walks.", [0, 3, 5], 4, "Run a 10K under 60 minutes"]);

      // Switching to a readiness without an assessment drops the hidden date.
      await to(page, "Back", "Training readiness");
      await expect(injury).toHaveValue("Ankle sore after long walks.");
      await ready("No current injury").click();
      await to(page, "Save & continue", "Daily system");
      await expect.poll(async () => {
        const a = (await stored(page)).singles.athletic ?? {};
        return [a.readiness, a.assessed_on];
      }).toEqual(["no_injury", null]);
      expect(errors).toEqual([]);
    });

    test("business step: goal measure, baselines and workspace templates", async ({ browser }) => {
      const { page, errors } = await open(browser, vp);
      const today = await localToday(page);
      await plan(page).primary.click();
      await to(page, "Continue", "Body baseline");
      await to(page, "Skip", "Training readiness");
      await to(page, "Skip", "Business baseline");
      const metric = (n: string) => page.getByRole("radio", { name: n, exact: true });
      const rev = page.getByLabel("Current monthly revenue");
      const exp = page.getByLabel("Current monthly expenses");
      const lrg = page.getByRole("checkbox", { name: /Lost Revenue Group/ });
      const em = page.getByRole("checkbox", { name: /Exchange Mastery/ });
      for (const c of [metric("Revenue"), metric("Cash collected"), metric("Net profit"), rev, exp, lrg, em,
        btn(page, "Back"), btn(page, "Skip"), btn(page, "Save & continue")]) await reachable(c);
      await expectNoHorizontalScroll(page);

      await expect(metric("Revenue")).toHaveAttribute("aria-checked", "true");
      await metric("Net profit").click();
      await expect(metric("Net profit")).toHaveAttribute("aria-checked", "true");
      await metric("Cash collected").click();
      await expect(metric("Cash collected")).toHaveAttribute("aria-checked", "true");
      await expect(metric("Revenue")).toHaveAttribute("aria-checked", "false");
      await expect(lrg).toBeChecked();
      await expect(em).toBeChecked();
      await em.click();
      await expect(em).not.toBeChecked();
      await page.getByText("Exchange Mastery", { exact: true }).click(); // tapping the card's title works too
      await expect(em).toBeChecked();
      await page.getByText("Exchange Mastery", { exact: true }).click();
      await expect(em).not.toBeChecked();

      await rev.fill("-5");
      await exp.fill("300.25");
      await btn(page, "Save & continue").click();
      await expect(alertText(page, "Monthly revenue and expenses can't be negative.")).toBeVisible();
      await expect(rev).toHaveValue("-5");
      await rev.fill("1250.50");
      await to(page, "Save & continue", "Daily system");
      await expect.poll(async () => {
        const b = (await stored(page)).singles.businessSettings ?? {};
        return [b.goal_metric, b.baseline_revenue, b.baseline_expenses, b.baseline_confirmed_on];
      }).toEqual(["cash", 1250.5, 300.25, today]);
      await expect.poll(async () => (await rows(page, "businesses")).map((b) => b.name)).toEqual(["Lost Revenue Group"]);
      const lrgId = (await rows(page, "businesses"))[0].id;
      expect((await rows(page, "offers")).map((o) => o.business_id)).toEqual([lrgId, lrgId]);
      expect((await rows(page, "metrics")).length).toBe(7);

      // Back: the created workspace is locked in; the other can still be added, without duplicates.
      await to(page, "Back", "Business baseline");
      await expect(lrg).toBeChecked();
      await expect(lrg).toBeDisabled();
      await expect(page.getByText("Lost Revenue Group (created)")).toBeVisible();
      await em.check();
      await to(page, "Save & continue", "Daily system");
      await expect.poll(async () => (await rows(page, "businesses")).map((b) => [b.name, b.sort_order])).toEqual([["Lost Revenue Group", 0], ["Exchange Mastery", 1]]);
      expect((await rows(page, "offers")).length).toBe(6);
      expect((await rows(page, "metrics")).length).toBe(13);
      expect(errors).toEqual([]);
    });

    test("habits step: picks follow the business switch; hidden picks are never saved", async ({ browser }) => {
      const { page, errors } = await open(browser, vp);
      await plan(page).primary.click();
      await to(page, "Continue", "Body baseline");
      await to(page, "Skip", "Training readiness");
      await to(page, "Skip", "Business baseline");
      await to(page, "Skip", "Daily system");
      const habit = (n: string) => page.getByRole("button", { name: new RegExp(`^${n.replace(/[()/]/g, "\\$&")}`) });
      const on = ["Wake up on time", "Lights out on time", "Read or learn (20 min)", "Strength training", "Log nutrition", "Business outreach", "Plan tomorrow", "Quality time together"];
      const off = ["Cardio / conditioning", "Hit hydration goal", "Publish content", "Sales activity", "Reflect / journal", "Mobility & recovery"];
      for (const n of [...on, ...off]) await reachable(habit(n));
      for (const c of [btn(page, "Back"), btn(page, "Skip"), btn(page, "Save & continue")]) await reachable(c);
      await expectNoHorizontalScroll(page);
      for (const n of on) await expect(habit(n)).toHaveAttribute("aria-pressed", "true");
      for (const n of off) await expect(habit(n)).toHaveAttribute("aria-pressed", "false");
      await habit("Cardio / conditioning").click();
      await habit("Log nutrition").click();
      await habit("Publish content").click();
      await expect(habit("Cardio / conditioning")).toHaveAttribute("aria-pressed", "true");
      await expect(habit("Log nutrition")).toHaveAttribute("aria-pressed", "false");

      // Turn business tracking off: its habits disappear and must not be created.
      await to(page, "Back", "Business baseline");
      await to(page, "Back", "Training readiness");
      await to(page, "Back", "Body baseline");
      await to(page, "Back", "Welcome.");
      await bizSwitch(page).click();
      await to(page, "Continue", "Body baseline");
      await to(page, "Skip", "Training readiness");
      await to(page, "Skip", "Daily system");
      await expect(habit("Business outreach")).toHaveCount(0);
      await expect(habit("Publish content")).toHaveCount(0);
      await to(page, "Save & continue", "What your partner can see");
      const expected = ["Wake up on time", "Lights out on time", "Read or learn (20 min)", "Strength training", "Cardio / conditioning", "Plan tomorrow", "Quality time together"];
      await expect.poll(async () => (await rows(page, "habits")).map((h) => h.name).sort()).toEqual([...expected].sort());
      // Saved habits show as already added and can't be added twice.
      await to(page, "Back", "Daily system");
      await expect(habit("Wake up on time")).toBeDisabled();
      await to(page, "Save & continue", "What your partner can see");
      expect((await rows(page, "habits")).length).toBe(expected.length);
      // No business row on the sharing step either.
      await expect(page.getByRole("group", { name: "Business" })).toHaveCount(0);
      expect(errors).toEqual([]);
    });

    test("privacy and reminders: every level and hour saves; Finish opens Today and Settings agrees", async ({ browser }) => {
      const { page, errors } = await open(browser, vp);
      await plan(page).primary.click();
      await to(page, "Continue", "Body baseline");
      for (const h of ["Training readiness", "Business baseline", "Daily system", "What your partner can see"]) await to(page, "Skip", h);
      const groups: [string, string[], string][] = [
        ["Weight progress", ["Hidden", "% of goal", "Pounds lost", "Full detail"], "Pounds lost"],
        ["Training", ["Hidden", "Summary", "Full"], "Full"],
        ["Habits", ["Hidden", "Summary", "Full"], "Hidden"],
        ["Milestones", ["Hidden", "Shared"], "Hidden"],
        ["Health details", ["Private", "Shared"], "Shared"],
        ["Business", ["Private", "Goal only", "Full"], "Goal only"],
      ];
      await expect(page.getByRole("group", { name: "Weight progress" }).getByRole("radio", { name: "% of goal" })).toHaveAttribute("aria-checked", "true");
      for (const [g, opts, pick] of groups) {
        const grp = page.getByRole("group", { name: g, exact: true });
        for (const o of opts) {
          const r = grp.getByRole("radio", { name: o, exact: true });
          await reachable(r);
          await r.click();
          await expect(r).toHaveAttribute("aria-checked", "true");
        }
        await grp.getByRole("radio", { name: pick, exact: true }).click();
      }
      await expectNoHorizontalScroll(page);
      await to(page, "Save & continue", "Reminders");
      await expect.poll(async () => {
        const s = (await stored(page)).singles.shareSettings ?? {};
        return [s.weight, s.training, s.habits, s.milestones, s.health, s.business, s.photos];
      }).toEqual(["pounds", "full", "none", "none", "full", "summary", "none"]);
      await to(page, "Back", "What your partner can see");
      await expect(page.getByRole("group", { name: "Weight progress" }).getByRole("radio", { name: "Pounds lost" })).toHaveAttribute("aria-checked", "true");
      await to(page, "Skip", "Reminders");

      const hour = page.getByLabel("Daily logging reminder after");
      for (const c of [hour, btn(page, "Back"), btn(page, "Skip"), btn(page, "Finish")]) await reachable(c);
      await expectNoHorizontalScroll(page);
      await expect(hour).toHaveValue("20");
      await hour.selectOption("7");
      await expect(hour).toHaveValue("7");
      await btn(page, "Finish").click();
      await page.waitForURL(atHome);
      await settle(page);
      await expect.poll(async () => {
        const s = await stored(page);
        return [s.singles.reminderSettings?.daily_logging_hour, s.profile?.onboarding_done];
      }).toEqual([7, true]);

      await go(page, "/settings");
      await expect(page.locator("#privacy").getByRole("group", { name: "Weight progress" }).getByRole("radio", { name: "Pounds lost" })).toHaveAttribute("aria-checked", "true");
      await expect(page.locator("#privacy").getByRole("group", { name: "Business" }).getByRole("radio", { name: "Goal only" })).toHaveAttribute("aria-checked", "true");
      await expect(page.locator("#reminders").getByLabel("Daily logging reminder after")).toHaveValue("7");
      expect(errors).toEqual([]);
    });

    test("a full setup shows up on Today, Progress, Settings, Business and Habits, and survives a reload", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, true);
      await page.getByLabel("Your name").fill("Alex");
      await plan(page).primary.click();
      await to(page, "Continue", "Body baseline");
      await page.getByLabel("Confirm your starting weight").fill("248.4");
      await page.getByLabel("Waist (optional)").fill("46");
      await to(page, "Save & continue", "Training readiness");
      await page.getByRole("button", { name: "Symptoms, not yet assessed", exact: true }).click();
      await page.getByLabel("Sessions per week").fill("4");
      await to(page, "Save & continue", "Business baseline");
      await page.getByLabel("Current monthly revenue").fill("2000");
      await to(page, "Save & continue", "Daily system");
      await to(page, "Save & continue", "What your partner can see");
      await to(page, "Save & continue", "Reminders");
      await btn(page, "Finish").click();
      await page.waitForURL(atHome);
      await settle(page);

      // Today
      await expect(page.getByText("Finish setting up when you're ready")).toHaveCount(0);
      await expect(page.getByText("248.4 lb", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("188.4–198.4")).toBeVisible();
      await expect(heading(page, "Business")).toBeVisible();
      await expect(page.getByText("Wake up on time").first()).toBeVisible();
      if (vp === "desktop") await expect(page.locator("aside")).toContainText("Alex");
      // Progress
      await go(page, "/progress");
      await expect(page.getByText("Goal 198.4 lb, stretch 188.4 lb.", { exact: false })).toBeVisible();
      // Settings
      await go(page, "/settings");
      await expect(page.locator("#profile").getByLabel("Name")).toHaveValue("Alex");
      const body = page.locator("#body");
      await expect(body.getByLabel("Starting weight")).toHaveValue("248.4");
      await expect(body.getByLabel("Target loss")).toHaveValue("50");
      await expect(body.getByLabel("Stretch goal")).toHaveValue("60");
      await expect(body.getByLabel("Starting waist")).toHaveValue("46");
      await expect(page.locator("#training").getByLabel("Readiness")).toHaveValue("symptoms_not_assessed");
      await expect(page.locator("#training").getByLabel("Sessions per week")).toHaveValue("4");
      await expect(page.locator("#business").getByLabel("Baseline monthly revenue")).toHaveValue("2000");
      // Business workspaces and habits
      await go(page, "/business");
      await expect(page.getByText("Lost Revenue Group").first()).toBeVisible();
      await expect(page.getByText("Exchange Mastery").first()).toBeVisible();
      await go(page, "/habits");
      for (const h of ["Wake up on time", "Business outreach", "Quality time together"]) await expect(page.getByText(new RegExp(`^${h}`)).first()).toBeVisible();
      await expect(page.getByText(/^Cardio \/ conditioning/)).toHaveCount(0);
      // Reload: all of it was stored, not just shown.
      await go(page, "/");
      await page.reload();
      await settle(page);
      await expect(page.getByText("188.4–198.4")).toBeVisible();
      expect(page.url()).not.toContain("onboarding");
      expect(errors).toEqual([]);
    });

    test("Skip and Back on every step move without saving; Skip setup for now works mid-way", async ({ browser }) => {
      const { page, errors } = await open(browser, vp);
      await plan(page).primary.click();
      await to(page, "Continue", "Body baseline");
      const order = ["Body baseline", "Training readiness", "Business baseline", "Daily system", "What your partner can see", "Reminders"];
      for (let k = 0; k < order.length; k++) {
        await expect(heading(page, order[k])).toBeVisible();
        await expect(stepText(page)).toHaveText(`Setup · step ${k + 2} of 7`);
        for (const b of ["Back", "Skip", k === order.length - 1 ? "Finish" : "Save & continue"]) await reachable(btn(page, b));
        await reachable(btn(page, "Skip setup for now"));
        await expectNoHorizontalScroll(page);
        if (k < order.length - 1) await to(page, "Skip", order[k + 1]);
      }
      for (let k = order.length - 1; k > 0; k--) await to(page, "Back", order[k - 1]);
      await to(page, "Back", "Welcome.");
      let s = await stored(page);
      expect([s.singles.goals ?? null, s.singles.athletic ?? null, s.singles.businessSettings ?? null]).toEqual([null, null, null]);
      expect(s.lists.habits ?? []).toEqual([]);
      expect(s.lists.weights ?? []).toEqual([]);

      await to(page, "Continue", "Body baseline");
      await to(page, "Skip", "Training readiness");
      await to(page, "Skip", "Business baseline");
      await btn(page, "Skip setup for now").click();
      await page.waitForURL(atHome);
      await settle(page);
      s = await stored(page);
      expect([s.profile?.onboarding_done, s.profile?.business_enabled, s.singles.goals ?? null, s.lists.businesses ?? []]).toEqual([true, true, null, []]);
      expect(errors).toEqual([]);
    });

    test("setup runs again cleanly after the records are cleared", async ({ browser }) => {
      const { page, errors } = await open(browser, vp);
      await page.getByLabel("Your name").fill("Casey");
      await plan(page).primary.click();
      await to(page, "Continue", "Body baseline");
      await to(page, "Save & continue", "Training readiness");
      await to(page, "Skip", "Business baseline");
      await to(page, "Save & continue", "Daily system");
      await to(page, "Save & continue", "What your partner can see");
      await to(page, "Skip", "Reminders");
      await btn(page, "Finish").click();
      await page.waitForURL(atHome);
      await settle(page);
      await expect.poll(async () => (await rows(page, "businesses")).length).toBe(2);

      await clearRecords(page);
      await expect(heading(page, "Welcome, Casey.")).toBeVisible();
      await expect(page.getByLabel("Your name")).toHaveCount(0); // the name is kept
      await expect(stepText(page)).toHaveText("Setup · step 1 of 6");
      for (const c of Object.values(plan(page))) await expect(c).toHaveAttribute("aria-pressed", "false");
      await expect(btn(page, "Continue")).toBeDisabled();
      await plan(page).primary.click();
      await to(page, "Continue", "Body baseline");
      const start = page.getByLabel("Confirm your starting weight");
      await expect(start).toHaveValue("267");
      await start.fill("255");
      await to(page, "Save & continue", "Training readiness");
      await to(page, "Skip", "Business baseline");
      await expect(page.getByRole("checkbox", { name: /Lost Revenue Group/ })).toBeEnabled();
      await expect(page.getByRole("checkbox", { name: /Lost Revenue Group/ })).toBeChecked();
      await to(page, "Save & continue", "Daily system");
      await expect(page.getByRole("button", { name: /^Wake up on time/ })).toBeEnabled();
      await to(page, "Save & continue", "What your partner can see");
      await to(page, "Skip", "Reminders");
      await btn(page, "Finish").click();
      await page.waitForURL(atHome);
      await settle(page);
      await expect.poll(async () => {
        const s = await stored(page);
        return [s.profile?.onboarding_done, s.profile?.display_name, (s.lists.weights ?? []).map((w) => w.weight), (s.lists.businesses ?? []).length, (s.lists.habits ?? []).length];
      }).toEqual([true, "Casey", [255], 2, 8]);
      await expect(page.getByText("255.0 lb", { exact: true }).first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}

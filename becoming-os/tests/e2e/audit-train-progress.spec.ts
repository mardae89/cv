// Control-by-control audit of the Train page (plan settings, injury awareness,
// workout form for every activity, charts and ranges, strength records, history),
// the Log page's Training tab, and the Progress page (weigh-ins, ranges, history,
// milestone photos, photo gallery) on a phone and on a desktop. Every control is
// checked to be on screen and not hidden behind the bottom bar, to accept a value,
// to save, to survive a reload, and to update every place that shows the data.
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, go, openFresh, rows, settle, stored, toast, type ViewportName } from "./helpers";

const SIZES: ViewportName[] = ["mobile", "desktop"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${MONTHS[m - 1]} ${day}, ${y}`;
};
const fmtShort = (d: string) => fmtDate(d).replace(/, \d+$/, "");
const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
/** "Dec 14, 2026" → "2026-12-14" */
const isoOf = (s: string) => {
  const m = /([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/.exec(s);
  if (!m) throw new Error(`no date in "${s}"`);
  return `${m[3]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
};
const descending = (xs: string[]) => xs.every((x, i) => i === 0 || xs[i - 1] >= x);
const ascending = (xs: string[]) => xs.every((x, i) => i === 0 || xs[i - 1] <= x);

type Row = Record<string, unknown>;
const TOUCH = new WeakMap<Page, boolean>();

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

/**
 * One look: on screen, not clipped, and at least part of it isn't under anything else (bottom bar,
 * + button, a sheet, a toast). Returns a point (relative to the control) that a finger can reach.
 */
async function checkUncovered(loc: Locator): Promise<{ x: number; y: number }> {
  const r = await loc.evaluate((el) => {
    el.scrollIntoView({ block: "center", inline: "center" });
    const b = el.getBoundingClientRect();
    const mine = (hit: Element | null) => !!hit && (hit === el || el.contains(hit) || (el instanceof HTMLInputElement && !!el.labels?.[0]?.contains(hit)));
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    const centre = document.elementFromPoint(cx, cy);
    let point: { x: number; y: number } | null = mine(centre) ? { x: b.width / 2, y: b.height / 2 } : null;
    // The middle is covered (say, by a toast): look for another part of it that can still be tapped.
    for (let i = 1; !point && i < 10; i++) {
      for (const fy of [0.5, 0.25, 0.75]) {
        const x = b.left + (b.width * i) / 10;
        const y = b.top + b.height * fy;
        if (mine(document.elementFromPoint(x, y))) {
          point = { x: x - b.left, y: y - b.top };
          break;
        }
      }
    }
    return {
      inView: b.top >= 0 && b.bottom <= window.innerHeight + 0.5 && b.left >= -0.5 && b.right <= window.innerWidth + 0.5,
      point,
      what: centre ? centre.outerHTML.slice(0, 140) : "nothing",
    };
  });
  expect(r.inView, `${loc} is clipped`).toBe(true);
  expect(r.point, `${loc} is covered by ${r.what}`).not.toBeNull();
  return r.point!;
}

async function expectUncovered(loc: Locator) {
  await expect(loc).toBeVisible();
  await expect(async () => {
    if (await celebration(loc.page()).isVisible()) await settle(loc.page());
    await checkUncovered(loc);
  }).toPass({ timeout: 8000 });
}

/** Tap on the phone, click on the desktop — on a part of the control that can be reached. */
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
  await expect(async () => {
    if (await celebration(page).isVisible()) await settle(page);
    const position = await checkUncovered(loc);
    if (TOUCH.get(page)) await loc.tap({ position, timeout: 2000 });
    else await loc.click({ position, timeout: 2000 });
  }).toPass({ timeout: 15_000 });
}

async function type(loc: Locator, value: string) {
  await expectUncovered(loc);
  await loc.fill(value);
  await expect(loc).toHaveValue(value);
}

async function choose(select: Locator, value: string | { label: string }) {
  await expectUncovered(select);
  await select.selectOption(value);
}

async function alertToast(page: Page, text: string | RegExp) {
  await expect(page.getByRole("alert").filter({ hasText: text }).first()).toBeVisible();
}

/** A future date is refused, by the date picker's own limit or by the form's message. */
async function expectFutureRefused(page: Page, dateInput: Locator, submit: Locator, message: string) {
  await press(submit);
  const native = await dateInput.evaluate((el: HTMLInputElement) => el.validationMessage);
  if (!native) await alertToast(page, message);
}

const card = (page: Page, title: string | RegExp) =>
  page.locator(".card").filter({ has: page.getByRole("heading", { name: title, exact: typeof title === "string" }) });
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const radio = (scope: Locator, group: string, name: string) =>
  scope.getByRole("radiogroup", { name: group }).getByRole("radio", { name, exact: true });

/** Opens a sheet and checks every way of closing it (✕, Escape, the backdrop), then opens it again. */
async function openSheet(page: Page, opener: Locator, name: string) {
  const sheet = dialog(page, name);
  await press(opener);
  await expect(sheet).toBeVisible();
  await press(sheet.getByRole("button", { name: "Close" }));
  await expect(sheet).toBeHidden();
  await press(opener);
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await press(opener);
  await expect(sheet).toBeVisible();
  await sheet.click({ position: { x: 8, y: 8 } }); // the dimmed backdrop
  await expect(sheet).toBeHidden();
  await press(opener);
  await expect(sheet).toBeVisible();
  return sheet;
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

async function finish(page: Page, errors: string[]) {
  await expectNoHorizontalScroll(page);
  expect(errors, "console or page errors").toEqual([]);
  await page.context().close();
}

// ─────────────────────────────────────────────────────── workout form helpers ──
const mainButton = (page: Page, name: string) => page.getByRole("main").getByRole("button", { name, exact: true });

async function openWorkoutSheet(page: Page) {
  await press(mainButton(page, "Log workout"));
  const sheet = dialog(page, "Log workout");
  await expect(sheet).toBeVisible();
  return sheet;
}

const field = (scope: Locator, label: string) => scope.getByLabel(label, { exact: true });
const exercise = (scope: Locator, n: number) => ({
  name: field(scope, `Exercise ${n}`),
  sets: field(scope, `Sets for exercise ${n}`),
  reps: field(scope, `Reps for exercise ${n}`),
  weight: field(scope, `Weight in lb for exercise ${n}`),
  remove: scope.getByRole("button", { name: `Remove exercise ${n}`, exact: true }),
});

/** Saves the workout form; a sheet closes only once the save is stored, the inline form clears its duration. */
async function submitWorkout(page: Page, scope: Locator, label = "Log workout", message = "Workout logged.") {
  const isSheet = (await scope.getAttribute("role")) === "dialog";
  await press(scope.getByRole("button", { name: label, exact: true }));
  await toast(page, message);
  if (isSheet) await expect(scope).toBeHidden();
  else await expect(field(scope, "Duration")).toHaveValue("");
}
const record = (page: Page, exercise: string) =>
  card(page, "Strength records").getByRole("row").filter({ has: page.getByRole("cell", { name: exercise, exact: true }) });
const latestOf = (page: Page, activity: string) => async () => (await workoutsBy(page, activity)).at(-1);

const history = (page: Page) => card(page, "Workout history").getByRole("listitem").filter({ has: page.getByRole("button", { name: "Edit" }) });
const workoutsBy = async (page: Page, activity: string) => (await rows(page, "workouts")).filter((w) => w.activity === activity);
const setsOf = async (page: Page, workoutId: unknown) =>
  (await rows(page, "sets")).filter((s) => s.workout_id === workoutId).map((s) => [s.exercise, s.reps, s.weight_lb]);
const weekCard = (page: Page) => page.locator(".card").filter({ hasText: "Run miles" }).filter({ hasText: "Minutes" }).first();
const statusLine = (page: Page) => page.locator("p").filter({ hasText: /^Status:/ });
const r1 = (n: number) => Math.round(n * 10) / 10;

for (const vp of SIZES) {
  test.describe(`Train & Progress audit · ${vp}`, () => {
    test("plan settings: every field accepts a value, validates, saves, survives reload and updates Train and Today", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      const today = await appToday(page);
      await go(page, "/train");
      await expect(statusLine(page)).toContainText("Status: not set");

      const sheet = await openSheet(page, mainButton(page, "Plan settings"), "Training plan");
      const readiness = field(sheet, "Readiness");
      const phase = field(sheet, "Current phase");
      const assessed = field(sheet, "Date assessed");
      await expect(phase.locator("option", { hasText: "Return to running" })).toBeDisabled();
      await expect(sheet.getByText("Running phases unlock when readiness is", { exact: false })).toBeVisible();

      await choose(readiness, { label: "Under a clinician's care" });
      await expect(assessed).toBeVisible();
      await choose(readiness, { label: "No current injury" });
      await expect(assessed).toBeHidden();
      await expect(sheet.getByText("Running phases unlock when readiness is", { exact: false })).toBeHidden();
      await expect(phase.locator("option", { hasText: "Aerobic base" })).toBeEnabled();
      await choose(phase, "aerobic_base");
      await expect(sheet.getByText("Build consistent, mostly easy running", { exact: false })).toBeVisible();
      // Reporting symptoms again locks running phases: the chosen one goes back to Foundation instead of a disabled option.
      await choose(readiness, { label: "Symptoms, not yet assessed" });
      await expect(phase).toHaveValue("foundation");
      await choose(readiness, { label: "Assessed — clinician OK'd running" });
      await type(assessed, addDays(today, 2));
      await choose(phase, "return_to_running");
      await type(field(sheet, "Injury notes (private)"), "Left ankle, rolled in September.");
      const sessions = field(sheet, "Sessions per week");
      const goal = field(sheet, "Goal");
      const raceName = field(sheet, "Race name");
      const raceDate = field(sheet, "Race date");
      await type(goal, "Finish the city 10K");
      await type(raceName, "City 10K");
      await type(raceDate, addDays(today, 190));
      const days = sheet.getByRole("group", { name: "Days of the week" });
      await expect(days.getByRole("button", { name: "Monday" })).toHaveAttribute("aria-pressed", "true");
      await press(days.getByRole("button", { name: "Monday" }));
      await press(days.getByRole("button", { name: "Tuesday" }));
      await press(days.getByRole("button", { name: "Saturday" }));
      await expect(days.getByRole("button", { name: "Monday" })).toHaveAttribute("aria-pressed", "false");
      await expect(days.getByRole("button", { name: "Saturday" })).toHaveAttribute("aria-pressed", "true");

      // Validation keeps everything typed and explains what to fix.
      const save = sheet.getByRole("button", { name: "Save plan" });
      for (const bad of ["0", "2.5", "15"]) {
        await type(sessions, bad);
        await press(save);
        await alertToast(page, "Sessions per week must be a whole number from 1 to 14.");
        await expect(sheet).toBeVisible();
        await expect(sessions).toHaveValue(bad);
      }
      await type(sessions, "4");
      await press(save);
      await alertToast(page, "The assessment date can't be in the future.");
      await expect(goal).toHaveValue("Finish the city 10K");
      await type(assessed, addDays(today, -3));
      expect((await stored(page)).singles.athletic?.goal_text).not.toBe("Finish the city 10K");
      await press(save);
      await toast(page, "Training plan saved.");
      await expect(sheet).toBeHidden();

      const want = {
        readiness: "cleared_by_clinician", assessed_on: addDays(today, -3), injury_notes: "Left ankle, rolled in September.",
        phase: "return_to_running", weekly_session_target: 4, training_days: [2, 3, 5, 6], goal_text: "Finish the city 10K",
        race_name: "City 10K", race_date: addDays(today, 190),
      };
      await expect.poll(async () => (await stored(page)).singles.athletic).toMatchObject(want);

      const check = async () => {
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("Finish the city 10K");
        await expect(page.getByText(`City 10K · ${fmtDate(addDays(today, 190))} · 190 days`)).toBeVisible();
        await expect(statusLine(page)).toContainText(`Assessed — clinician OK'd running · assessed ${fmtDate(addDays(today, -3))}`);
        await expect(card(page, "Phased roadmap").getByRole("listitem").filter({ hasText: "Return to running" })).toContainText("CURRENT");
        await expect(page.getByText("0 / 4 sessions")).toBeVisible();
        await expect(page.getByText("Target 4", { exact: true })).toBeVisible();
      };
      await check();
      await page.reload();
      await settle(page);
      await check();

      // Reopened, the sheet shows what was saved.
      await press(mainButton(page, "Plan settings"));
      await expect(readiness).toHaveValue("cleared_by_clinician");
      await expect(assessed).toHaveValue(addDays(today, -3));
      await expect(phase).toHaveValue("return_to_running");
      await expect(sessions).toHaveValue("4");
      await expect(raceName).toHaveValue("City 10K");
      await expect(days.getByRole("button", { name: "Tuesday" })).toHaveAttribute("aria-pressed", "true");
      // A readiness without an assessment drops the (now hidden) assessment date instead of keeping it.
      await choose(readiness, { label: "No current injury" });
      await press(save);
      await toast(page, "Training plan saved.");
      await expect.poll(async () => (await stored(page)).singles.athletic).toMatchObject({ readiness: "no_injury", assessed_on: null });
      await expect(statusLine(page)).toContainText("Status: No current injury");
      await expect(statusLine(page)).not.toContainText("assessed");

      await go(page, "/");
      await expect(page.getByText("Phase · Return to running")).toBeVisible();
      await expect(page.getByText("0 / 4 sessions")).toBeVisible();
      await finish(page, errors);
    });

    test("injury awareness: log pain from Train, validation, card, status and pain chart update in date order", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      const today = await appToday(page);
      await go(page, "/train");
      const injury = card(page, /No recent symptoms|Symptoms worth getting checked/);
      await expect(injury.getByRole("heading", { name: "No recent symptoms" })).toBeVisible();
      await expect(page.getByText("No symptoms logged in this range.")).toBeVisible();

      const sheet = await openSheet(page, mainButton(page, "Log pain / symptoms"), "Pain & symptoms");
      await type(field(sheet, "Where"), "Left ankle");
      await press(sheet.getByRole("button", { name: "Log symptoms" }));
      await alertToast(page, "Choose a pain level from 0 to 10.");
      await expect(field(sheet, "Where")).toHaveValue("Left ankle");
      await press(sheet.getByRole("radio", { name: "Left", exact: true }));
      await press(radio(sheet, "Pain (0 = none, 10 = worst)", "6"));
      await expect(sheet.getByText("Consider getting this checked")).toBeVisible();
      await choose(field(sheet, "Type"), "sharp");
      await choose(field(sheet, "When"), "running");
      await type(field(sheet, "Notes"), "Worse on stairs");
      await press(sheet.getByRole("button", { name: "Log symptoms" }));
      await toast(page, "Symptoms logged.");
      await expect(sheet).toBeHidden();
      await expect.poll(async () => (await rows(page, "symptoms")).map((s) => [s.log_date, s.body_area, s.side, s.pain_level, s.pain_type, s.during, s.note]))
        .toEqual([[today, "Left ankle", "left", 6, "sharp", "running", "Worse on stairs"]]);
      await expect(page.getByRole("heading", { name: "Symptoms worth getting checked" })).toBeVisible();
      await expect(page.getByText("1 symptom log in 14 days, max 6/10", { exact: false })).toBeVisible();
      await expect(page.getByText("No symptoms logged in this range.")).toBeHidden();

      // A second, earlier entry: the pain chart plots both, oldest on the left.
      await press(mainButton(page, "Log pain / symptoms"));
      await type(field(sheet, "Date"), addDays(today, -3));
      await press(radio(sheet, "Pain (0 = none, 10 = worst)", "2"));
      await press(sheet.getByRole("button", { name: "Log symptoms" }));
      await toast(page, "Symptoms logged.");
      await expect(page.getByText("2 symptom logs in 14 days, max 6/10", { exact: false })).toBeVisible();
      const pain = page.locator("section.card").filter({ has: page.getByRole("heading", { name: "Pain log" }) });
      await expect(pain.locator(".recharts-xAxis .recharts-cartesian-axis-tick-value")).toHaveText([fmtShort(addDays(today, -3)), fmtShort(today)]);
      await page.reload();
      await settle(page);
      await expect(page.getByText("2 symptom logs in 14 days, max 6/10", { exact: false })).toBeVisible();
      await finish(page, errors);
    });

    test("workout form: every activity type accepts its fields, saves, and updates the week, records, charts and history", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      const today = await appToday(page);
      await go(page, "/train");
      await expect(page.getByText("0 / 3 sessions")).toBeVisible();
      for (const t of ["No sessions in this range.", "No runs in this range.", "Your longest-run records appear here."]) await expect(page.getByText(t)).toBeVisible();

      // Strength: decimals, heart rate, two exercises (one bodyweight), a third added and removed, intensity, RPE with clear.
      let sheet = await openSheet(page, mainButton(page, "Log workout"), "Log workout");
      await expect(field(sheet, "Activity")).toHaveValue("strength");
      await expect(field(sheet, "Date")).toHaveValue(today);
      await type(field(sheet, "Duration"), "45.5");
      await type(field(sheet, "Avg heart rate"), "128");
      await type(field(sheet, "Title"), "Upper body");
      let ex = exercise(sheet, 1);
      await type(ex.name, "Bench press");
      await type(ex.sets, "3");
      await type(ex.reps, "8");
      await type(ex.weight, "135.5");
      await press(sheet.getByRole("button", { name: "Add exercise" }));
      ex = exercise(sheet, 2);
      await expect(ex.sets).toHaveValue("3");
      await type(ex.name, "Push-up");
      await type(ex.sets, "2");
      await type(ex.reps, "15");
      await press(sheet.getByRole("button", { name: "Add exercise" }));
      await type(exercise(sheet, 3).name, "Not this one");
      await press(exercise(sheet, 3).remove);
      await expect(exercise(sheet, 3).name).toHaveCount(0);
      await expect(exercise(sheet, 2).name).toHaveValue("Push-up");
      await press(sheet.getByRole("group", { name: "Intensity" }).getByRole("radio", { name: "Hard" }));
      await expect(sheet.getByRole("group", { name: "Intensity" }).getByRole("radio", { name: "Hard" })).toHaveAttribute("aria-checked", "true");
      await press(radio(sheet, "Perceived effort (RPE)", "8"));
      await press(sheet.getByRole("button", { name: "clear" }));
      await expect(sheet.getByRole("radiogroup", { name: "Perceived effort (RPE)" }).locator('[aria-checked="true"]')).toHaveCount(0);
      await press(radio(sheet, "Perceived effort (RPE)", "7"));
      await expect(sheet.getByRole("radiogroup", { name: "Pain during the session (0 = none)" })).toHaveCount(0);
      await expect(sheet.getByRole("switch", { name: "This was a race" })).toHaveCount(0);
      await type(field(sheet, "Notes"), "Felt strong");
      await type(field(sheet, "Recovery notes"), "Stretched after");
      await submitWorkout(page, sheet);
      const [strength] = await workoutsBy(page, "strength");
      expect(strength).toMatchObject({
        workout_date: today, duration_min: 45.5, avg_hr: 128, rpe: 7, intensity: "hard", title: "Upper body",
        notes: "Felt strong", recovery_notes: "Stretched after", distance_mi: null, pain_level: null, is_race: false,
      });
      expect(await setsOf(page, strength.id)).toEqual([
        ["Bench press", 8, 135.5], ["Bench press", 8, 135.5], ["Bench press", 8, 135.5], ["Push-up", 15, null], ["Push-up", 15, null],
      ]);
      await expect(page.getByText("1 / 3 sessions")).toBeVisible();
      const records = card(page, "Strength records");
      await expect(records.getByRole("row").filter({ hasText: "Bench press" })).toContainText("135.5 lb × 8");
      await expect(records.getByRole("row").filter({ hasText: "Push-up" })).toContainText("Bodyweight × 15");
      await expect(history(page).first()).toContainText("Strength · Upper body");
      await expect(history(page).first()).toContainText("45.5 min");
      await expect(history(page).first()).toContainText("5 sets");

      // Run: no false injury notice when readiness isn't set, live pace, pain, race flag on and off.
      sheet = await openWorkoutSheet(page);
      await choose(field(sheet, "Activity"), "run");
      await expect(sheet.getByText("Running with unassessed symptoms")).toHaveCount(0);
      await type(field(sheet, "Duration"), "30");
      await type(field(sheet, "Distance"), "3.1");
      await expect(sheet.getByText("Pace 9:41 /mi")).toBeVisible();
      await press(radio(sheet, "Pain during the session (0 = none)", "2"));
      const race = sheet.getByRole("switch", { name: "This was a race" });
      await press(race);
      await expect(race).toHaveAttribute("aria-checked", "true");
      await press(race);
      await expect(race).toHaveAttribute("aria-checked", "false");
      await press(race);
      await submitWorkout(page, sheet);
      await expect.poll(latestOf(page, "run")).toMatchObject({ duration_min: 30, distance_mi: 3.1, pain_level: 2, is_race: true });
      await expect(history(page).first()).toContainText("Run · Race");
      await expect(page.getByText("3.1 mi", { exact: true }).first()).toBeVisible();
      await expect(card(page, "Athletic milestones").getByRole("listitem").filter({ hasText: "First 5K completed" })).toContainText(fmtDate(today));

      // Run-walk and walk: pain scale, race flag only for running.
      sheet = await openWorkoutSheet(page);
      await choose(field(sheet, "Activity"), "run_walk");
      await type(field(sheet, "Duration"), "20");
      await type(field(sheet, "Distance"), "1.5");
      await press(radio(sheet, "Pain during the session (0 = none)", "0"));
      await expect(sheet.getByRole("switch", { name: "This was a race" })).toBeVisible();
      await submitWorkout(page, sheet);
      await expect.poll(latestOf(page, "run_walk")).toMatchObject({ duration_min: 20, distance_mi: 1.5, pain_level: 0, is_race: false });

      sheet = await openWorkoutSheet(page);
      await choose(field(sheet, "Activity"), "walk");
      await type(field(sheet, "Duration"), "40");
      await type(field(sheet, "Distance"), "2");
      await expect(sheet.getByText("Pace 20:00 /mi")).toBeVisible();
      await expect(sheet.getByRole("switch", { name: "This was a race" })).toHaveCount(0);
      await press(radio(sheet, "Pain during the session (0 = none)", "1"));
      await submitWorkout(page, sheet);
      await expect.poll(latestOf(page, "walk")).toMatchObject({ duration_min: 40, distance_mi: 2, pain_level: 1 });

      // Swim in yards (converted to miles), units switch both ways.
      sheet = await openWorkoutSheet(page);
      await choose(field(sheet, "Activity"), "swim");
      await expect(field(sheet, "Distance (miles)")).toBeVisible();
      await press(sheet.getByRole("button", { name: "Use yards" }));
      await expect(field(sheet, "Distance (yards)")).toBeVisible();
      await press(sheet.getByRole("button", { name: "Use miles" }));
      await expect(field(sheet, "Distance (miles)")).toBeVisible();
      await press(sheet.getByRole("button", { name: "Use yards" }));
      await type(field(sheet, "Duration"), "30");
      await type(field(sheet, "Distance (yards)"), "1000");
      await expect(sheet.getByRole("radiogroup", { name: "Pain during the session (0 = none)" })).toHaveCount(0);
      await submitWorkout(page, sheet);
      await expect.poll(latestOf(page, "swim")).toMatchObject({ duration_min: 30, distance_mi: 0.57 });

      // Cycle (decimal distance), mobility (no distance), recovery (no duration, intensity or RPE), other.
      sheet = await openWorkoutSheet(page);
      await choose(field(sheet, "Activity"), "cycle");
      await type(field(sheet, "Duration"), "60.5");
      await type(field(sheet, "Distance"), "15.25");
      await submitWorkout(page, sheet);
      await expect.poll(latestOf(page, "cycle")).toMatchObject({ duration_min: 60.5, distance_mi: 15.25 });

      sheet = await openWorkoutSheet(page);
      await choose(field(sheet, "Activity"), "mobility");
      await expect(field(sheet, "Distance")).toHaveCount(0);
      await type(field(sheet, "Duration"), "25");
      await submitWorkout(page, sheet);

      sheet = await openWorkoutSheet(page);
      await choose(field(sheet, "Activity"), "recovery");
      await expect(sheet.getByRole("group", { name: "Intensity" })).toHaveCount(0);
      await expect(sheet.getByRole("radiogroup", { name: "Perceived effort (RPE)" })).toHaveCount(0);
      await type(field(sheet, "Recovery notes"), "Foam roller");
      await submitWorkout(page, sheet);
      await expect.poll(latestOf(page, "recovery")).toMatchObject({ duration_min: null, intensity: null, rpe: null, recovery_notes: "Foam roller" });

      sheet = await openWorkoutSheet(page);
      await choose(field(sheet, "Activity"), "other");
      await type(field(sheet, "Duration"), "15");
      await type(field(sheet, "Title"), "Yard work");
      await submitWorkout(page, sheet);

      // The week counts 8 sessions (recovery isn't one): 266 minutes, 4.6 run miles.
      const check = async () => {
        await expect(page.getByText("8 / 3 sessions")).toBeVisible();
        const week = page.locator(".card").filter({ hasText: "8 / 3 sessions" });
        await expect(week).toContainText("4.6");
        await expect(week).toContainText("266");
        await expect(history(page)).toHaveCount(9);
        for (const t of ["No sessions in this range.", "No runs in this range.", "Your longest-run records appear here."]) await expect(page.getByText(t)).toHaveCount(0);
      };
      await check();

      // Activity filter: each activity shows just its own workout.
      const filter = page.getByLabel("Filter by activity");
      for (const [value, label] of [["run", "Run · Race"], ["swim", "Swim"], ["recovery", "Recovery day"], ["other", "Other · Yard work"]]) {
        await choose(filter, value);
        await expect(history(page)).toHaveCount(1);
        await expect(history(page).first()).toContainText(label);
      }
      await choose(filter, "all");
      await expect(history(page)).toHaveCount(9);

      await page.reload();
      await settle(page);
      await check();
      expect(await rows(page, "workouts")).toHaveLength(9);
      await go(page, "/");
      await expect(page.getByText("8 / 3 sessions")).toBeVisible();
      await finish(page, errors);
    });

    test("workout form: validation keeps what was typed; unusual-workout and duplicate confirms; hidden fields don't leak", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      const today = await appToday(page);
      await go(page, "/train");
      let sheet = await openWorkoutSheet(page);
      const submit = sheet.getByRole("button", { name: "Log workout", exact: true });
      await type(field(sheet, "Title"), "Keep me");
      await press(submit);
      await alertToast(page, "Enter how long the session lasted.");
      await expect(field(sheet, "Title")).toHaveValue("Keep me");

      await type(field(sheet, "Duration"), "45");
      await type(field(sheet, "Date"), addDays(today, 1));
      await expectFutureRefused(page, field(sheet, "Date"), submit, "You can't log a workout for a future date.");
      await type(field(sheet, "Date"), addDays(today, -1));
      await type(field(sheet, "Avg heart rate"), "20");
      await press(submit);
      await alertToast(page, "Heart rate must be between 30 and 230.");
      await type(field(sheet, "Avg heart rate"), "");

      const ex = exercise(sheet, 1);
      await type(ex.weight, "100");
      await press(submit);
      await alertToast(page, "Name each exercise you entered a weight for, or remove that row.");
      await type(ex.name, "Squat");
      for (const [loc, bad, good, msg] of [
        [ex.sets, "abc", "3", "Sets for Squat must be a whole number from 1 to 20."],
        [ex.sets, "25", "3", "Sets for Squat must be a whole number from 1 to 20."],
        [ex.reps, "8.5", "8", "Reps for Squat must be a whole number from 0 to 500."],
        [ex.weight, "heavy", "185.5", "Weight for Squat must be a number of pounds from 0 to 2000."],
      ] as [Locator, string, string, string][]) {
        await type(loc, bad);
        await press(submit);
        await alertToast(page, msg);
        await expect(loc).toHaveValue(bad);
        await expect(ex.name).toHaveValue("Squat");
        await expect(field(sheet, "Title")).toHaveValue("Keep me");
        await type(loc, good);
      }
      expect(await rows(page, "workouts")).toHaveLength(0);
      await submitWorkout(page, sheet);
      const [squat] = await workoutsBy(page, "strength");
      expect(squat).toMatchObject({ workout_date: addDays(today, -1), duration_min: 45, title: "Keep me", avg_hr: null });
      expect(await setsOf(page, squat.id)).toEqual(Array(3).fill(["Squat", 8, 185.5]));

      // Faster than 5:00/mi: Cancel keeps the sheet and values and saves nothing; confirming saves.
      sheet = await openWorkoutSheet(page);
      await choose(field(sheet, "Activity"), "run");
      await type(field(sheet, "Duration"), "10");
      await type(field(sheet, "Distance"), "3");
      await press(submit);
      const odd = dialog(page, "Double-check this workout");
      await expect(odd).toContainText("That's a pace faster than 5:00 per mile.");
      await press(odd.getByRole("button", { name: "Cancel" }));
      await expect(odd).toBeHidden();
      await expect(sheet).toBeVisible();
      await expect(field(sheet, "Distance")).toHaveValue("3");
      expect(await workoutsBy(page, "run")).toHaveLength(0);
      await press(submit);
      await press(odd.getByRole("button", { name: "It's correct — save" }));
      await toast(page, "Workout logged.");
      await expect(sheet).toBeHidden();
      expect(await workoutsBy(page, "run")).toHaveLength(1);

      // The same workout again asks first: Cancel saves nothing, "Log it again" saves it.
      const dupe = dialog(page, "Possible duplicate");
      const logSwim = async (answer: "Cancel" | "Log it again" | null) => {
        sheet = await openWorkoutSheet(page);
        await choose(field(sheet, "Activity"), "swim");
        await press(sheet.getByRole("button", { name: "Use yards" }));
        await type(field(sheet, "Duration"), "30");
        await type(field(sheet, "Distance (yards)"), "1000");
        await press(submit);
        if (answer) {
          await press(dupe.getByRole("button", { name: answer }));
          await expect(dupe).toBeHidden();
          if (answer === "Cancel") {
            await expect(sheet).toBeVisible();
            await press(sheet.getByRole("button", { name: "Close" }));
            return;
          }
        }
        await toast(page, "Workout logged.");
        await expect(sheet).toBeHidden();
      };
      await logSwim(null);
      await logSwim("Cancel"); // 1000 yd is saved as 0.57 mi; the duplicate check compares the saved distance
      expect(await workoutsBy(page, "swim")).toHaveLength(1);
      await logSwim("Log it again");
      expect(await workoutsBy(page, "swim")).toHaveLength(2);

      // A distance typed for a run, then switched to strength, is neither saved nor used to tell workouts apart.
      sheet = await openWorkoutSheet(page);
      await choose(field(sheet, "Activity"), "run");
      await type(field(sheet, "Distance"), "5");
      await choose(field(sheet, "Activity"), "strength");
      await type(field(sheet, "Date"), addDays(today, -1));
      await type(field(sheet, "Duration"), "45");
      await press(radio(sheet, "Perceived effort (RPE)", "6"));
      await choose(field(sheet, "Activity"), "recovery"); // RPE is hidden for recovery and not saved
      await choose(field(sheet, "Activity"), "strength");
      await press(submit);
      await press(dupe.getByRole("button", { name: "Log it again" }));
      await toast(page, "Workout logged.");
      await expect(sheet).toBeHidden();
      const second = (await workoutsBy(page, "strength")).find((w) => w.id !== squat.id)!;
      expect(second).toMatchObject({ distance_mi: null, rpe: 6 });
      sheet = await openWorkoutSheet(page);
      await press(radio(sheet, "Perceived effort (RPE)", "9"));
      await choose(field(sheet, "Activity"), "recovery");
      await submitWorkout(page, sheet);
      await expect.poll(latestOf(page, "recovery")).toMatchObject({ rpe: null, intensity: null });
      await finish(page, errors);
    });

    test("workout history: sorted by date, show all, ranges, edit (exercises kept exactly), change activity, delete, filter", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "demo");
      const today = await appToday(page);
      // The Log tab lists the latest 12 with "Show all"; top the sample up past the Train page's 40 from there.
      await go(page, "/log?tab=training");
      const recent = card(page, "Recent workouts").getByRole("listitem").filter({ has: page.getByRole("button", { name: "Edit" }) });
      const form = page.getByRole("form", { name: "Workout form" });
      const sample = (await rows(page, "workouts")).length;
      await expect(recent).toHaveCount(12);
      await choose(field(form, "Activity"), "other");
      for (let i = 0; i < 41 - sample; i++) {
        await type(field(form, "Duration"), String(10 + i));
        await type(field(form, "Date"), addDays(today, -1 - i));
        await submitWorkout(page, form);
      }
      const total = (await rows(page, "workouts")).length;
      expect(total).toBe(Math.max(41, sample));
      await press(card(page, "Recent workouts").getByRole("button", { name: `Show all ${total}` }));
      await expect(recent).toHaveCount(total);
      await go(page, "/train");
      await expect(history(page)).toHaveCount(40);

      // Backfill one: it lands at its date, not on top.
      let sheet = await openWorkoutSheet(page);
      await choose(field(sheet, "Activity"), "mobility");
      await type(field(sheet, "Date"), addDays(today, -20));
      await type(field(sheet, "Duration"), "30");
      await type(field(sheet, "Title"), "Backfilled");
      await submitWorkout(page, sheet);
      await expect(history(page).first()).not.toContainText("Backfilled");
      await press(card(page, "Workout history").getByRole("button", { name: `Show all ${total + 1}` }));
      await expect(history(page)).toHaveCount(total + 1);
      const dates = (await history(page).allInnerTexts()).map(isoOf);
      expect(descending(dates), `history out of date order: ${dates.join(", ")}`).toBe(true);
      await expect(history(page).filter({ hasText: "Backfilled" })).toContainText(fmtDate(addDays(today, -20)));

      // Range picker: each range is selectable and changes the weekly charts.
      const ranges = page.getByRole("main").getByRole("radiogroup").filter({ has: page.getByRole("radio", { name: "30D" }) });
      const bars = page.locator("section.card").filter({ has: page.getByRole("heading", { name: "Sessions per week" }) }).locator(".recharts-bar-rectangle");
      const counts: Record<string, number> = {};
      for (const r of ["30D", "90D", "Mission", "All"]) {
        await press(ranges.getByRole("radio", { name: r }));
        await expect(ranges.getByRole("radio", { name: r })).toHaveAttribute("aria-checked", "true");
        await expect(bars.first()).toBeVisible();
        counts[r] = await bars.count();
      }
      expect(counts["30D"]).toBeLessThan(counts["Mission"]);
      expect(counts["90D"]).toBeGreaterThan(counts["30D"]);

      // Edit the latest strength workout: every exercise prefilled; change, remove and add exercises.
      const latest = history(page).filter({ hasText: "Strength" }).first();
      const latestDate = isoOf(await latest.innerText());
      const target = (await workoutsBy(page, "strength")).find((w) => w.workout_date === latestDate)!;
      const before = await setsOf(page, target.id);
      const weekBefore = await weekCard(page).innerText();
      sheet = await openSheet(page, latest.getByRole("button", { name: "Edit" }), "Edit workout");
      await expect(field(sheet, "Activity")).toHaveValue("strength");
      await expect(field(sheet, "Duration")).toHaveValue("45");
      const names = [...new Set(before.map((s) => s[0] as string))];
      for (let i = 0; i < names.length; i++) await expect(exercise(sheet, i + 1).name).toHaveValue(names[i]);
      await type(field(sheet, "Duration"), "50");
      await type(exercise(sheet, 1).weight, "60");
      await press(exercise(sheet, names.length).remove);
      await press(sheet.getByRole("button", { name: "Add exercise" }));
      await type(exercise(sheet, names.length).name, "Plank");
      await type(exercise(sheet, names.length).reps, "");
      await submitWorkout(page, sheet, "Save changes", "Workout updated.");
      await expect(sheet).toBeHidden();
      expect((await rows(page, "workouts")).find((w) => w.id === target.id)).toMatchObject({ duration_min: 50 });
      const after = await setsOf(page, target.id);
      expect(after.filter((s) => s[0] === names[0])).toEqual(Array(3).fill([names[0], 10, 60]));
      expect(after.some((s) => s[0] === names[names.length - 1])).toBe(false);
      expect(after.filter((s) => s[0] === "Plank")).toEqual(Array(3).fill(["Plank", null, null]));
      await expect(card(page, "Strength records").getByRole("row").filter({ hasText: names[0] })).toContainText("60 lb × 10");
      await expect(card(page, "Strength records").getByRole("row").filter({ hasText: "Plank" })).toContainText("Bodyweight");
      await expect(history(page).filter({ hasText: fmtDate(latestDate) }).filter({ hasText: "Strength" }).first()).toContainText("50 min");
      await expect(weekCard(page)).not.toHaveText(weekBefore); // the edited workout is in this week: minutes change

      // Two rows of one exercise at different weights survive an edit that only changes the title.
      sheet = await openWorkoutSheet(page);
      await type(field(sheet, "Duration"), "40");
      await type(field(sheet, "Title"), "Pyramid");
      await type(exercise(sheet, 1).name, "Deadlift");
      await type(exercise(sheet, 1).sets, "1");
      await type(exercise(sheet, 1).reps, "5");
      await type(exercise(sheet, 1).weight, "225");
      await press(sheet.getByRole("button", { name: "Add exercise" }));
      await type(exercise(sheet, 2).name, "Deadlift");
      await type(exercise(sheet, 2).sets, "1");
      await type(exercise(sheet, 2).reps, "3");
      await type(exercise(sheet, 2).weight, "245");
      await submitWorkout(page, sheet);
      const pyramid = (await rows(page, "workouts")).find((w) => w.title === "Pyramid")!;
      expect(await setsOf(page, pyramid.id)).toEqual([["Deadlift", 5, 225], ["Deadlift", 3, 245]]);
      const pyramidRow = history(page).filter({ hasText: "Pyramid" });
      await press(pyramidRow.getByRole("button", { name: "Edit" }));
      sheet = dialog(page, "Edit workout");
      await type(field(sheet, "Title"), "Pyramid day");
      await submitWorkout(page, sheet, "Save changes", "Workout updated.");
      expect(await setsOf(page, pyramid.id)).toEqual([["Deadlift", 5, 225], ["Deadlift", 3, 245]]);
      await expect(record(page, "Deadlift")).toContainText("245 lb × 3");

      // Changing a strength workout to another activity drops its exercises everywhere.
      await press(history(page).filter({ hasText: "Pyramid day" }).getByRole("button", { name: "Edit" }));
      await choose(field(sheet, "Activity"), "mobility");
      await submitWorkout(page, sheet, "Save changes", "Workout updated.");
      expect(await setsOf(page, pyramid.id)).toEqual([]);
      await expect(record(page, "Deadlift")).toHaveCount(0);
      await expect(history(page).filter({ hasText: "Pyramid day" })).toContainText("Mobility");

      // Delete the edited strength workout: its sets go too and the records fall back.
      const editedRow = history(page).filter({ hasText: fmtDate(latestDate) }).filter({ hasText: "50 min" });
      const count = await history(page).count();
      await deleteRow(page, editedRow, "Delete this workout?");
      await expect(history(page)).toHaveCount(count - 1);
      await expect.poll(async () => (await rows(page, "workouts")).some((w) => w.id === target.id)).toBe(false);
      expect(await setsOf(page, target.id)).toEqual([]);
      await expect(card(page, "Strength records").getByRole("row").filter({ hasText: "Plank" })).toHaveCount(0);
      await expect(card(page, "Strength records").getByRole("row").filter({ hasText: names[0] })).not.toContainText("60 lb");

      // Filters, including one with nothing in it.
      const filter = page.getByLabel("Filter by activity");
      await choose(filter, "swim");
      await expect(card(page, "Workout history")).toContainText("No swim workouts logged.");
      await choose(filter, "strength");
      for (const t of await history(page).allInnerTexts()) expect(t).toContain("Strength");
      await choose(filter, "all");
      await page.reload();
      await settle(page);
      await expect(history(page).first()).toContainText("Mobility · Pyramid day"); // logged today, so newest
      await press(card(page, "Workout history").getByRole("button", { name: `Show all ${total + 1}` }));
      await expect(history(page)).toHaveCount(total + 1);
      expect(descending((await history(page).allInnerTexts()).map(isoOf))).toBe(true);
      await finish(page, errors);
    });

    test("log → training tab: inline form resets after saving, rest day toggles, recent list edits and deletes", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      const today = await appToday(page);
      await go(page, "/log?tab=training");
      const form = page.getByRole("form", { name: "Workout form" });
      await type(field(form, "Duration"), "30");
      await type(field(form, "Avg heart rate"), "120");
      await type(field(form, "Title"), "Back day");
      await type(exercise(form, 1).name, "Row");
      await type(exercise(form, 1).weight, "50");
      await press(form.getByRole("button", { name: "Add exercise" }));
      await type(exercise(form, 2).name, "Curl");
      await press(radio(form, "Perceived effort (RPE)", "6"));
      await submitWorkout(page, form);
      // Nothing from the last workout is carried into the next one by mistake.
      for (const f of ["Duration", "Avg heart rate", "Title", "Notes", "Recovery notes"]) await expect(field(form, f)).toHaveValue("");
      await expect(exercise(form, 1).name).toHaveValue("");
      await expect(exercise(form, 1).weight).toHaveValue("");
      await expect(exercise(form, 2).name).toHaveCount(0);
      await expect(form.getByRole("radiogroup", { name: "Perceived effort (RPE)" }).locator('[aria-checked="true"]')).toHaveCount(0);
      const recent = card(page, "Recent workouts").getByRole("listitem");
      await expect(recent.first()).toContainText("Strength · Back day");
      const [w] = await rows(page, "workouts");
      expect(w).toMatchObject({ duration_min: 30, avg_hr: 120, rpe: 6, title: "Back day" });
      expect(await setsOf(page, w.id)).toEqual([...Array(3).fill(["Row", 10, 50]), ...Array(3).fill(["Curl", 10, null])]);

      // Rest day on and off.
      const rest = card(page, "Rest day");
      await press(rest.getByRole("button", { name: "Mark today" }));
      await toast(page, "Rest day marked.");
      await expect(rest.getByRole("button", { name: "Rest day" })).toBeVisible();
      await expect.poll(async () => (await rows(page, "restDays")).map((r) => r.rest_date)).toEqual([today]);
      await page.reload();
      await settle(page);
      await expect(rest.getByRole("button", { name: "Rest day" })).toBeVisible();
      await press(rest.getByRole("button", { name: "Rest day" }));
      await toast(page, "Rest day removed.");
      await expect(rest.getByRole("button", { name: "Mark today" })).toBeVisible();
      await expect.poll(async () => (await rows(page, "restDays")).length).toBe(0);

      // Edit from the recent list, then delete.
      const sheet = await openSheet(page, recent.first().getByRole("button", { name: "Edit" }), "Edit workout");
      await expect(exercise(sheet, 2).name).toHaveValue("Curl");
      await type(field(sheet, "Duration"), "35");
      await submitWorkout(page, sheet, "Save changes", "Workout updated.");
      await expect(recent.first()).toContainText("35 min");
      expect((await rows(page, "workouts"))[0]).toMatchObject({ duration_min: 35 });
      await deleteRow(page, recent.filter({ hasText: "Back day" }), "Delete this workout?");
      await expect(card(page, "Recent workouts")).toContainText("No workouts yet.");
      await expect.poll(async () => [(await rows(page, "workouts")).length, (await rows(page, "sets")).length]).toEqual([0, 0]);
      await finish(page, errors);
    });

    test("progress: without a starting weight, one button leads to the body settings", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      await go(page, "/progress");
      await expect(page.getByText("Set your starting point")).toBeVisible();
      expect(await page.locator("a button, button a").count(), "a button nested in a link").toBe(0);
      // Photos and weigh-ins logged before a starting weight is set can still be seen, edited and deleted here.
      await expect(card(page, "Progress photos").getByRole("button", { name: "Add photo" })).toBeVisible();
      await expect(card(page, "All weigh-ins")).toHaveCount(0);
      await go(page, "/log?tab=body");
      const wf = page.getByRole("form", { name: "Weigh-in form" });
      await type(wf.getByLabel("Weight in pounds"), "182.4");
      await press(wf.getByRole("button", { name: "Save weigh-in" }));
      await expect.poll(async () => (await rows(page, "weights")).map((w) => w.weight)).toEqual([182.4]);
      await go(page, "/progress");
      await expect(page.getByText("Set your starting point")).toBeVisible();
      const all = card(page, "All weigh-ins");
      await expect(all).toContainText("182.4 lb");
      await press(all.getByRole("button", { name: "Edit" }));
      const ed = dialog(page, "Edit weigh-in");
      await type(ed.getByLabel("Weight in pounds"), "181.6");
      await press(ed.getByRole("button", { name: /Save|Update/ }));
      await expect(ed).toBeHidden();
      await expect(all).toContainText("181.6 lb");
      await expect.poll(async () => (await rows(page, "weights")).map((w) => w.weight)).toEqual([181.6]);
      await deleteRow(page, all.getByRole("listitem").filter({ hasText: "181.6 lb" }), "Delete this weigh-in?");
      await expect(all).toHaveCount(0);
      await expect.poll(async () => (await rows(page, "weights")).length).toBe(0);
      await press(page.getByRole("button", { name: "Confirm starting weight" }));
      await expect(page).toHaveURL(/#\/settings/);
      await expect(page.locator("#body")).toBeVisible();
      await finish(page, errors);
    });

    test("progress: log, update and backfill weigh-ins; range picker; history sorted, edit, delete, show all; Today updates", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "demo");
      const today = await appToday(page);
      await go(page, "/progress");
      const weights = (await rows(page, "weights")) as Row[];
      const byDate = new Map(weights.map((w) => [w.entry_date as string, w]));
      const list = card(page, "All weigh-ins").getByRole("listitem").filter({ has: page.getByRole("button", { name: "Edit" }) });
      const latestScale = page.getByText("Latest weigh-in", { exact: true }).locator("..");
      await expect(list).toHaveCount(14);
      // What the weigh-in should move: the pounds-lost number, the 7-day average, this week's average.
      const lostNumber = page.locator(".card").filter({ has: page.locator(".eyebrow", { hasText: /^Pounds lost/ }) }).locator(".display-num");
      const avgStat = page.locator(".eyebrow").filter({ hasText: /^7-day average$/ }).locator("..");
      const weekRow = card(page, "Weekly averages").getByRole("row").nth(1);
      const before = { lost: await lostNumber.innerText(), avg: await avgStat.innerText(), week: await weekRow.innerText() };

      // Update today's weigh-in from the header button (one weigh-in per day).
      let sheet = await openSheet(page, mainButton(page, "Log weigh-in"), "Log weigh-in");
      await expect(sheet.getByText("You already logged", { exact: false })).toBeVisible();
      const w1 = r1(Number(byDate.get(today)!.weight) - 0.6);
      await type(sheet.getByLabel("Weight in pounds"), String(w1));
      await type(field(sheet, "Waist (optional)"), "43.5");
      await type(field(sheet, "Note"), "After travel");
      await press(sheet.getByRole("button", { name: "Save weigh-in" }));
      await toast(page, `Updated the weigh-in for ${fmtDate(today)}.`);
      await expect(sheet).toBeHidden();
      const newest = `${w1} lb`;
      await expect(latestScale).toContainText(newest);
      await expect(list.first()).toContainText(newest);
      await expect(list.first()).toContainText("waist 43.5 in");
      await expect(lostNumber).not.toHaveText(before.lost);
      await expect(avgStat).not.toHaveText(before.avg);
      await expect(weekRow).not.toHaveText(before.week);
      await expect.poll(async () => (await rows(page, "weights")).find((w) => w.entry_date === today)).toMatchObject({ weight: w1, waist_in: 43.5, note: "After travel" });

      // Backfill a missing day (close to its neighbour so it isn't flagged): it lands at its date, and the waist chart stays in order.
      let gap = addDays(today, -1);
      while (byDate.has(gap)) gap = addDays(gap, -1);
      let prev = addDays(gap, -1);
      while (!byDate.has(prev)) prev = addDays(prev, -1);
      const backfill = Number(byDate.get(prev)!.weight);
      await press(mainButton(page, "Log weigh-in"));
      await type(sheet.getByLabel("Weight in pounds"), String(backfill));
      await type(field(sheet, "Date"), gap);
      await type(field(sheet, "Waist (optional)"), "44.6");
      await press(sheet.getByRole("button", { name: "Save weigh-in" }));
      await toast(page, "Weigh-in saved.");
      await expect(list.first()).toContainText(newest);
      await press(card(page, "All weigh-ins").getByRole("button", { name: `Show all ${weights.length + 1}` }));
      await expect(list).toHaveCount(weights.length + 1);
      expect(descending((await list.allInnerTexts()).map(isoOf))).toBe(true);
      const waistTicks = page.locator("section.card").filter({ has: page.getByRole("heading", { name: "Waist" }) }).locator(".recharts-xAxis .recharts-cartesian-axis-tick-value");
      await expect(waistTicks.first()).toBeVisible();
      const months = (await waistTicks.allTextContents()).map((t) => {
        const [m, d] = t.split(" ");
        return `${String(MONTHS.indexOf(m) + 1).padStart(2, "0")}-${d.padStart(2, "0")}`;
      });
      expect(ascending(months), `waist chart out of order: ${months.join(", ")}`).toBe(true);

      // Range picker on the weight chart.
      const weightChart = page.locator("section.card").filter({ has: page.getByRole("heading", { name: "Weight", exact: true }) });
      const dots = weightChart.locator(".recharts-scatter circle");
      const counts: Record<string, number> = {};
      for (const r of ["30D", "90D", "Mission", "All"]) {
        await press(weightChart.getByRole("radio", { name: r }));
        await expect(weightChart.getByRole("radio", { name: r })).toHaveAttribute("aria-checked", "true");
        await expect(dots.first()).toBeVisible();
        counts[r] = await dots.count();
      }
      expect(counts["30D"]).toBeLessThan(counts["Mission"]);
      expect(counts["All"]).toBe(weights.length + 1);

      // Edit the backfilled weigh-in, then delete it.
      const row = list.filter({ hasText: fmtDate(gap) });
      sheet = await openSheet(page, row.getByRole("button", { name: "Edit" }), "Edit weigh-in");
      await expect(sheet.getByLabel("Weight in pounds")).toHaveValue(String(backfill));
      await type(sheet.getByLabel("Weight in pounds"), String(r1(backfill + 0.2)));
      await press(sheet.getByRole("button", { name: "Save changes" }));
      await toast(page, "Weigh-in updated.");
      await expect.poll(async () => (await rows(page, "weights")).find((w) => w.entry_date === gap)?.weight).toBe(r1(backfill + 0.2));
      await expect(row).toContainText(`${r1(backfill + 0.2)} lb`);
      await deleteRow(page, row, "Delete this weigh-in?");
      await expect.poll(async () => (await rows(page, "weights")).some((w) => w.entry_date === gap)).toBe(false);
      await expect(list).toHaveCount(weights.length);

      await page.reload();
      await settle(page);
      await expect(latestScale).toContainText(newest);
      await go(page, "/");
      await expect(page.getByText(`Scale ${w1.toFixed(1)} lb`)).toBeVisible();
      await finish(page, errors);
    });

    test("progress: photos upload, sort, attach to a milestone, detach, delete (with confirm) and unlink", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "demo");
      const today = await appToday(page);
      await go(page, "/progress");
      const photos = card(page, "Progress photos");
      await expect(photos).toContainText("No photos yet.");
      const milestone = (t: string) => page.getByRole("button", { name: new RegExp(`^(Attach|Change) photo for ${t}$`) });

      // A milestone with no photos to choose from explains what to do.
      let ms = await openSheet(page, milestone("5 pounds lost"), "Milestone photo");
      await expect(ms).toContainText("Upload a progress photo first");
      await press(ms.getByRole("button", { name: "Close" }));

      const png = Buffer.from(await page.evaluate(() => {
        const c = document.createElement("canvas");
        c.width = 30;
        c.height = 40;
        const g = c.getContext("2d")!;
        g.fillStyle = "#c9a24c";
        g.fillRect(0, 0, 30, 40);
        return c.toDataURL("image/png").split(",")[1];
      }), "base64");
      const upload = async (date: string, pose: string, caption: string, closing = false) => {
        const sheet = closing ? await openSheet(page, photos.getByRole("button", { name: "Add photo" }), "Progress photo")
          : (await press(photos.getByRole("button", { name: "Add photo" })), dialog(page, "Progress photo"));
        await expect(sheet.getByRole("button", { name: "Upload photo" })).toBeDisabled();
        const [chooser] = await Promise.all([page.waitForEvent("filechooser"), press(sheet.getByText("Take or choose a progress photo"))]);
        await chooser.setFiles({ name: `${pose}.png`, mimeType: "image/png", buffer: png });
        await expect(sheet.getByText(`${pose}.png`)).toBeVisible();
        await type(field(sheet, "Date"), date);
        await choose(field(sheet, "Pose"), pose);
        await type(field(sheet, "Caption"), caption);
        await press(sheet.getByRole("button", { name: "Upload photo" }));
        await toast(page, "Photo saved privately.");
        await expect(sheet).toBeHidden();
      };
      await upload(today, "side", "Week 9", true);
      await upload(addDays(today, -30), "front", "Week 5");
      const figures = photos.locator("figure");
      await expect(figures).toHaveCount(2);
      await expect(figures.first().locator("img")).toHaveAttribute("alt", `Progress photo ${fmtDate(today)}`);
      await expect(figures.first()).toContainText(`${fmtShort(today)} · side`);
      await expect(figures.nth(1)).toContainText(`${fmtShort(addDays(today, -30))} · front`);
      const stored1 = await rows(page, "photos");
      expect(stored1.map((p) => [p.taken_on, p.pose, p.caption]).sort()).toEqual([[addDays(today, -30), "front", "Week 5"], [today, "side", "Week 9"]]);
      const newPhoto = stored1.find((p) => p.taken_on === today)!;

      // Attach the newest photo to the milestone; it shows, survives reload, and can be detached.
      ms = dialog(page, "Milestone photo");
      await press(milestone("5 pounds lost"));
      const pick = ms.getByLabel("Choose photo");
      await expect(pick.locator("option")).toHaveText(["No photo", `${fmtDate(today)} · side · Week 9`, `${fmtDate(addDays(today, -30))} · front · Week 5`]);
      await choose(pick, newPhoto.id as string);
      await expect(ms).toBeHidden();
      const ach = async () => (await rows(page, "achievements")).find((a) => a.key === "weight.5")?.photo_id ?? null;
      await expect.poll(ach).toBe(newPhoto.id);
      await expect(page.getByRole("button", { name: "Change photo for 5 pounds lost" }).getByRole("img", { name: "Milestone photo" })).toBeVisible();
      await page.reload();
      await settle(page);
      await expect(page.getByRole("button", { name: "Change photo for 5 pounds lost" }).getByRole("img", { name: "Milestone photo" })).toBeVisible();
      await press(milestone("5 pounds lost"));
      await expect(pick).toHaveValue(newPhoto.id as string);
      await choose(pick, { label: "No photo" });
      await expect.poll(ach).toBe(null);
      await expect(milestone("5 pounds lost")).toHaveAccessibleName("Attach photo for 5 pounds lost");
      await press(milestone("5 pounds lost"));
      await choose(pick, newPhoto.id as string);
      await expect.poll(ach).toBe(newPhoto.id);

      // Delete: the button is visible without hovering; Cancel keeps; Delete removes it and unlinks the milestone.
      const del = photos.getByRole("button", { name: `Delete photo from ${fmtDate(today)}` });
      await expect(del).toHaveCSS("opacity", "1");
      await press(del);
      const confirm = dialog(page, "Delete this photo?");
      await press(confirm.getByRole("button", { name: "Cancel" }));
      await expect(figures).toHaveCount(2);
      await press(del);
      await press(confirm.getByRole("button", { name: "Delete" }));
      await toast(page, "Photo deleted.");
      await expect(figures).toHaveCount(1);
      await expect.poll(async () => (await rows(page, "photos")).length).toBe(1);
      await expect.poll(ach).toBe(null);
      await expect(milestone("5 pounds lost")).toHaveAccessibleName("Attach photo for 5 pounds lost");
      await page.reload();
      await settle(page);
      await expect(figures).toHaveCount(1);
      await finish(page, errors);
    });

    test("a confirm over the workout sheet: Escape closes only the confirm and keeps what was typed", async ({ browser }) => {
      // Regression: every open sheet used to listen for Escape, so Escape on the "Double-check this
      // workout" confirm also closed the workout sheet and lost the entry.
      const { page, errors } = await open(browser, vp, "skip");
      await go(page, "/train");
      const sheet = await openWorkoutSheet(page);
      await choose(field(sheet, "Activity"), "run");
      await type(field(sheet, "Duration"), "10");
      await type(field(sheet, "Distance"), "3");
      await press(sheet.getByRole("button", { name: "Log workout", exact: true }));
      const odd = dialog(page, "Double-check this workout");
      await expect(odd).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(odd).toBeHidden();
      await expect(sheet).toBeVisible({ timeout: 2000 });
      await expect(field(sheet, "Distance")).toHaveValue("3");
      await finish(page, errors);
    });
  });
}

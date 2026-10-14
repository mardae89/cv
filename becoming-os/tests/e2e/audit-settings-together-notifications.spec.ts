// Control-by-control audit of Settings, Together and the notification centre on a
// phone and on a desktop. Every control is checked to be on screen and not hidden
// behind the bottom bar, to accept a value, to save, to survive a reload, and to
// update the other places that show the data right away.
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Download, type Locator, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, openFresh, rows, settle, stored, toast, type ViewportName } from "./helpers";

const SIZES: ViewportName[] = ["mobile", "desktop"];
type Row = Record<string, unknown>;

const TOUCH = new WeakMap<Page, boolean>();
const poll = <T,>(fn: () => Promise<T> | T) => expect.poll(fn, { intervals: [50, 100, 150, 250] });

async function open(browser: Browser, vp: ViewportName, setup: "skip" | "demo") {
  const o = await openFresh(browser, vp, setup);
  TOUCH.set(o.page, vp === "mobile");
  await o.page.emulateMedia({ reducedMotion: "reduce" });
  return o;
}

const celebration = (page: Page) => page.getByRole("dialog", { name: "Milestone unlocked" });

/** On screen, not clipped, and nothing (bottom bar, + button, a sheet) sits on top of it. */
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

async function expectUncovered(loc: Locator) {
  await expect(loc).toBeVisible();
  await expect(async () => {
    if (await celebration(loc.page()).isVisible()) await settle(loc.page());
    await checkUncovered(loc);
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
  await expect(async () => {
    if (await celebration(page).isVisible()) await settle(page);
    await checkUncovered(loc);
    if (TOUCH.get(page)) await loc.tap({ timeout: 2000 });
    else await loc.click({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
}

async function type(loc: Locator, value: string) {
  await expectUncovered(loc);
  await loc.fill(value);
  await expect(loc).toHaveValue(value);
}

async function pick(loc: Locator, value: string | { label: string }) {
  await expectUncovered(loc);
  await loc.selectOption(value);
}

async function alertToast(page: Page, text: string | RegExp) {
  await expect(page.getByRole("alert").filter({ hasText: text }).first()).toBeVisible();
}

const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });
const section = (page: Page, id: string) => page.locator(`section#${id}`);
const field = (scope: Locator, label: string) => scope.getByLabel(label, { exact: true });
const radio = (scope: Locator, group: string, option: string) =>
  scope.getByRole("group", { name: group, exact: true }).getByRole("radio", { name: option, exact: true });

/** In-app navigation (no reload), then wait for the page to render. */
async function nav(page: Page, route: string, ready: Locator) {
  await page.evaluate((r) => { location.hash = `#${r}`; }, route);
  await expect(ready).toBeVisible();
}

async function reload(page: Page, ready: Locator) {
  await page.reload();
  await settle(page);
  await expect(ready).toBeVisible();
}

async function finish(page: Page, errors: string[]) {
  await expectNoHorizontalScroll(page);
  expect(errors, "console or page errors").toEqual([]);
  await page.context().close();
}

const settingsReady = (page: Page) => page.getByRole("heading", { name: "Your system" });

for (const vp of SIZES) {
  test.describe(`Settings, Together, Notifications · ${vp}`, () => {
    test("settings: storage, profile, body goals (incl. baseline confirm), training", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      await nav(page, "/settings", settingsReady(page));
      await expectNoHorizontalScroll(page);

      // Storage status.
      const storage = section(page, "storage");
      await expect(storage).toContainText("Saved in this browser on this device only");
      await expect(storage.getByRole("status")).toContainText("All changes saved");

      // Profile: name + time zone.
      const profile = section(page, "profile");
      await type(field(profile, "Name"), "Dana Q");
      await pick(field(profile, "Time zone"), "America/Chicago");
      await expect(field(profile, "Time zone")).toHaveValue("America/Chicago");
      await press(profile.getByRole("button", { name: "Save profile" }));
      await toast(page, "Profile saved.");
      await poll(async () => {
        const p = (await stored(page)).profile;
        return [p?.display_name, p?.timezone];
      }).toEqual(["Dana Q", "America/Chicago"]);
      if (vp === "desktop") await expect(page.locator("aside")).toContainText("Dana Q");

      // Body goals: an empty save explains itself and keeps what was typed.
      const body = section(page, "body");
      await type(field(body, "Starting waist"), "44.25");
      await press(body.getByRole("button", { name: "Save body goals" }));
      await alertToast(page, "Enter a starting weight between 70 and 700 lb.");
      await expect(field(body, "Starting waist")).toHaveValue("44.25");
      // Target weight accepts a value before the starting weight is known.
      await type(field(body, "Target weight"), "200.5");
      await type(field(body, "Starting weight"), "250.4");
      await expect(field(body, "Target loss")).toHaveValue("49.9");
      await field(body, "Target weight").blur();
      await expect(field(body, "Target weight")).toHaveValue("200.5");
      // Target weight can be cleared (it clears the loss), then typed again.
      await type(field(body, "Target weight"), "");
      await expect(field(body, "Target loss")).toHaveValue("");
      await type(field(body, "Target weight"), "200.5");
      await expect(field(body, "Target loss")).toHaveValue("49.9");
      // Editing the loss moves the target weight.
      await type(field(body, "Target loss"), "50.4");
      await expect(field(body, "Target weight")).toHaveValue("200");
      await type(field(body, "Stretch goal"), "60.5");
      await expect(body).toContainText("189.9 lb");
      await type(field(body, "Start date"), "2026-09-01");
      await press(radio(body, "Pace", "Ambitious"));
      await expect(radio(body, "Pace", "Ambitious")).toHaveAttribute("aria-checked", "true");
      const acts = body.getByRole("group", { name: "Preferred activities" });
      await press(acts.getByRole("button", { name: "Walking", exact: true }));
      await press(acts.getByRole("button", { name: "Cycling", exact: true }));
      await press(acts.getByRole("button", { name: "Hiking", exact: true }));
      await press(acts.getByRole("button", { name: "Hiking", exact: true })); // and off again
      await expect(acts.getByRole("button", { name: "Walking", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(acts.getByRole("button", { name: "Hiking", exact: true })).toHaveAttribute("aria-pressed", "false");
      // Activity level and training time (asked during setup) can be seen and changed here too.
      await pick(field(body, "Activity level today"), "moderate");
      await type(field(body, "Training time available"), "-5");
      await press(body.getByRole("button", { name: "Save body goals" }));
      await alertToast(page, /Training time available should be between 0 and 3,000/);
      await expect(field(body, "Training time available")).toHaveValue("-5");
      await type(field(body, "Training time available"), "180");
      await type(field(body, "Health considerations (private)"), "Left knee — low impact first.");
      // A future start date is refused with a readable message.
      await type(field(body, "Start date"), "2099-01-01");
      await press(body.getByRole("button", { name: "Save body goals" }));
      await alertToast(page, "The start date can't be in the future.");
      await type(field(body, "Start date"), "2026-09-01");
      await press(body.getByRole("button", { name: "Save body goals" }));
      await toast(page, "Body goals saved.");
      await poll(async () => {
        const g = (await stored(page)).singles.goals ?? {};
        return [g.start_weight, g.start_date, g.target_loss, g.stretch_loss, g.start_waist, g.pace, g.preferred_activities, g.health_notes, g.activity_level, g.weekly_training_minutes];
      }).toEqual([250.4, "2026-09-01", 50.4, 60.5, 44.25, "ambitious", ["Walking", "Cycling"], "Left knee — low impact first.", "moderate", 180]);
      // Progress shows the new baseline right away.
      await nav(page, "/progress", page.getByText(/Started at 250\.4 lb/));
      await expect(page.getByText(/Goal 200\.0 lb, stretch 189\.9 lb/)).toBeVisible();

      // Changing the starting weight asks first: Cancel keeps the old one, Escape too, then confirm.
      await nav(page, "/settings", settingsReady(page));
      await type(field(body, "Starting weight"), "252");
      await press(body.getByRole("button", { name: "Save body goals" }));
      const c = dialog(page, "Change starting weight?");
      await expect(c).toContainText("From 250.4 to 252 lb");
      await press(c.getByRole("button", { name: "Cancel" }));
      await expect(c).toBeHidden();
      await press(body.getByRole("button", { name: "Save body goals" }));
      await expect(c).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(c).toBeHidden();
      expect((await stored(page)).singles.goals?.start_weight).toBe(250.4);
      await press(body.getByRole("button", { name: "Save body goals" }));
      await press(c.getByRole("button", { name: "Change it" }));
      await toast(page, "Body goals saved.");
      await poll(async () => (await stored(page)).singles.goals?.start_weight).toBe(252);
      await nav(page, "/progress", page.getByText(/Started at 252\.0 lb/));
      await expect(page.getByText(/Goal 201\.6 lb/)).toBeVisible();

      // Training & readiness.
      await nav(page, "/settings", settingsReady(page));
      const tr = section(page, "training");
      await pick(field(tr, "Readiness"), "under_care");
      await type(field(tr, "Date assessed"), "2026-09-15");
      await type(field(tr, "Injury notes (private)"), "Physio twice a month");
      await pick(field(tr, "Readiness"), "no_injury");
      await expect(field(tr, "Date assessed")).toBeHidden();
      await pick(field(tr, "Current phase"), "return_to_running");
      await type(field(tr, "Sessions per week"), "2.5");
      await press(tr.getByRole("button", { name: "Save plan" }));
      await alertToast(page, "Sessions per week must be a whole number from 1 to 14.");
      await expect(field(tr, "Injury notes (private)")).toHaveValue("Physio twice a month");
      await type(field(tr, "Sessions per week"), "4");
      await type(field(tr, "Goal"), "Run a strong 10K");
      await type(field(tr, "Race name"), "Turkey Trot");
      await type(field(tr, "Race date"), "2026-11-26");
      await press(tr.getByRole("button", { name: "Sunday" }));
      await press(tr.getByRole("button", { name: "Monday" }));
      await press(tr.getByRole("button", { name: "Save plan" }));
      await toast(page, "Training plan saved.");
      await poll(async () => {
        const a = (await stored(page)).singles.athletic ?? {};
        return [a.readiness, a.assessed_on, a.injury_notes, a.phase, a.weekly_session_target, a.training_days, a.goal_text, a.race_name, a.race_date];
      }).toEqual(["no_injury", null, "Physio twice a month", "return_to_running", 4, [0, 3, 5], "Run a strong 10K", "Turkey Trot", "2026-11-26"]);
      await nav(page, "/train", page.getByText(/Turkey Trot/).first());

      // Everything survives a reload.
      await nav(page, "/settings", settingsReady(page));
      await reload(page, settingsReady(page));
      await expect(field(profile, "Name")).toHaveValue("Dana Q");
      await expect(field(profile, "Time zone")).toHaveValue("America/Chicago");
      await expect(field(body, "Starting weight")).toHaveValue("252");
      await expect(field(body, "Target weight")).toHaveValue("201.6");
      await expect(acts.getByRole("button", { name: "Walking", exact: true })).toHaveClass(/border-gold/);
      await expect(field(tr, "Race name")).toHaveValue("Turkey Trot");
      await expect(field(tr, "Current phase")).toHaveValue("return_to_running");
      await finish(page, errors);
    });

    test("settings: business toggle + goal, privacy levels, reminders", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      await nav(page, "/settings", settingsReady(page));

      // Business: turning tracking on shows the goal; the goal saves; off hides it again.
      const biz = section(page, "business");
      const sw = biz.getByRole("switch", { name: /Track business performance/ });
      await expect(sw).toHaveAttribute("aria-checked", "false");
      await expect(field(biz, "Monthly goal")).toHaveCount(0);
      await press(sw);
      await expect(sw).toHaveAttribute("aria-checked", "true");
      await poll(async () => (await stored(page)).profile?.business_enabled).toBe(true);
      await press(biz.getByRole("radio", { name: "Cash collected" }));
      await type(field(biz, "Monthly goal"), "0");
      await press(biz.getByRole("button", { name: "Save goal" }));
      await alertToast(page, "The goal must be more than $0.");
      await type(field(biz, "Monthly goal"), "12500.5");
      await type(field(biz, "Baseline monthly revenue"), "8000.75");
      await type(field(biz, "Baseline monthly expenses"), "2500");
      await press(biz.getByRole("button", { name: "Save goal" }));
      await toast(page, "Goal saved.");
      await poll(async () => {
        const b = (await stored(page)).singles.businessSettings ?? {};
        return [b.goal_metric, b.goal_amount, b.baseline_revenue, b.baseline_expenses];
      }).toEqual(["cash", 12500.5, 8000.75, 2500]);
      // Today's business card follows the new goal at once.
      await nav(page, "/", page.getByText(/^Goal \$12,50[01]\/month$/));
      await expect(page.getByText("cash collected", { exact: true })).toBeVisible();
      await nav(page, "/settings", settingsReady(page));
      await press(sw);
      await expect(sw).toHaveAttribute("aria-checked", "false");
      await expect(field(biz, "Monthly goal")).toHaveCount(0);
      await poll(async () => (await stored(page)).profile?.business_enabled).toBe(false);
      // Privacy has no Business row while business is off.
      const priv = section(page, "privacy");
      await expect(priv.getByRole("group", { name: "Business", exact: true })).toHaveCount(0);
      await press(sw);
      await expect(priv.getByRole("group", { name: "Business", exact: true })).toBeVisible();

      // Privacy & sharing: every level; Save only once something changed.
      const save = priv.getByRole("button", { name: "Save sharing" });
      await expect(save).toBeDisabled();
      await expect(radio(priv, "Weight progress", "% of goal")).toHaveAttribute("aria-checked", "true");
      for (const o of ["Hidden", "Pounds lost", "Full detail"]) {
        await press(radio(priv, "Weight progress", o));
        await expect(radio(priv, "Weight progress", o)).toHaveAttribute("aria-checked", "true");
      }
      for (const o of ["Hidden", "Full"]) await press(radio(priv, "Training", o));
      await press(radio(priv, "Habits", "Hidden"));
      await press(radio(priv, "Milestones", "Hidden"));
      await press(radio(priv, "Business", "Goal only"));
      await expect(save).toBeEnabled();
      await press(save);
      await toast(page, "Sharing saved.");
      await expect(save).toBeDisabled();
      const share = async () => {
        const s = (await stored(page)).singles.shareSettings ?? {};
        return [s.weight, s.training, s.habits, s.milestones, s.business];
      };
      await poll(share).toEqual(["full", "full", "none", "none", "summary"]);

      // Together shows the same choices at once, and saving there shows back here.
      await nav(page, "/together", page.getByRole("heading", { name: "What you share" }));
      const tog = page.locator("section#sharing");
      await expect(radio(tog, "Weight progress", "Full detail")).toHaveAttribute("aria-checked", "true");
      await expect(radio(tog, "Habits", "Hidden")).toHaveAttribute("aria-checked", "true");
      await press(radio(tog, "Habits", "Shared"));
      await press(tog.getByRole("button", { name: "Save sharing" }));
      await toast(page, "Sharing saved.");
      await poll(share).toEqual(["full", "full", "summary", "none", "summary"]);
      await nav(page, "/settings", settingsReady(page));
      await expect(radio(priv, "Habits", "Shared")).toHaveAttribute("aria-checked", "true");

      // Reminders: each switch and the hour.
      const rem = section(page, "reminders");
      const keys: [string, string][] = [
        ["Daily logging", "daily_logging"], ["Planned workouts", "workouts"], ["Weekly review", "weekly_review"],
        ["Monthly review & chapters", "monthly_review"], ["Upcoming milestones", "milestones"],
        ["Business activity targets", "business_targets"], ["Recovery & symptoms", "recovery"], ["Race preparation", "race_checkpoints"],
      ];
      for (const [label, key] of keys) {
        const t = rem.getByRole("switch", { name: new RegExp(`^${label.replace(/[&]/g, "\\$&")}`) });
        await expect(t).toHaveAttribute("aria-checked", "true");
        await press(t);
        await expect(t).toHaveAttribute("aria-checked", "false");
        await poll(async () => (await stored(page)).singles.reminderSettings?.[key]).toBe(false);
      }
      await press(rem.getByRole("switch", { name: /^Weekly review/ }));
      await pick(field(rem, "Daily logging reminder after"), { label: "6 pm" });
      await poll(async () => (await stored(page)).singles.reminderSettings?.daily_logging_hour).toBe(18);

      await reload(page, settingsReady(page));
      await expect(rem.getByRole("switch", { name: /^Daily logging/ })).toHaveAttribute("aria-checked", "false");
      await expect(rem.getByRole("switch", { name: /^Weekly review/ })).toHaveAttribute("aria-checked", "true");
      await expect(field(rem, "Daily logging reminder after")).toHaveValue("18");
      await expect(radio(priv, "Weight progress", "Full detail")).toHaveAttribute("aria-checked", "true");
      await expect(radio(priv, "Business", "Goal only")).toHaveAttribute("aria-checked", "true");
      await expect(biz.getByRole("radio", { name: "Cash collected" })).toHaveAttribute("aria-checked", "true");
      await expect(field(biz, "Monthly goal")).toHaveValue("12500.5");
      await finish(page, errors);
    });

    test("your data: backup download, CSV, bad files, restore round-trip, clear sample data", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "demo");
      // Clear the notification centre first (once every sample milestone has its notification): the backup must keep it that way.
      await poll(async () => {
        const ach = await rows(page, "achievements");
        const keys = new Set((await rows(page, "notifications")).map((n) => n.dedupe_key));
        return ach.length > 0 && ach.every((a) => keys.has(`ach:${a.key}`));
      }).toBe(true);
      await settle(page);
      await nav(page, "/notifications", page.getByRole("heading", { name: "Reminders" }));
      await press(page.getByRole("button", { name: "Mark all read" }));
      await press(page.getByRole("button", { name: "Clear read" }));
      await expect(page.getByText("All clear")).toBeVisible();
      await poll(async () => (await rows(page, "notifications")).every((n) => n.cleared_at)).toBe(true);
      await nav(page, "/settings", settingsReady(page));
      const data = section(page, "data");
      const audience = await rows(page, "audience");
      expect(audience.length, "sample data has audience counts").toBeGreaterThan(0);

      // Save backup: a real JSON download with every table, including audience counts.
      const [dl] = await Promise.all([page.waitForEvent("download"), press(data.getByRole("button", { name: "Save backup (JSON)" }))]);
      await toast(page, "Backup saved.");
      expect(dl.suggestedFilename()).toMatch(/^becoming-os-backup-\d{4}-\d{2}-\d{2}\.json$/);
      const backupPath = test.info().outputPath(`backup-${vp}.json`);
      await dl.saveAs(backupPath);
      const backup = JSON.parse(readFileSync(backupPath, "utf8"));
      expect(backup.app).toBe("becoming-os");
      expect(backup.version).toBe(1);
      expect(backup.profile.demo_mode).toBe(true);
      expect((backup.tables.audience as Row[]).map((r) => [r.platform, r.recorded_on, r.count]).sort())
        .toEqual(audience.map((r) => [r.platform, r.recorded_on, r.count]).sort());
      expect((backup.tables.weights as Row[]).length).toBe((await rows(page, "weights")).length);
      expect(backup.singles.shareSettings).toBeTruthy();
      expect((backup.tables.notifications as Row[]).filter((n) => !n.cleared_at)).toEqual([]);

      // CSV: one file per non-empty main table, audience included.
      const csvs: Download[] = [];
      page.on("download", (d) => csvs.push(d));
      await press(data.getByRole("button", { name: "Main tables (CSV)" }));
      await toast(page, /CSV files? saved\./);
      await poll(() => csvs.map((d) => d.suggestedFilename().replace(/-\d{4}-\d{2}-\d{2}\.csv$/, "")).sort())
        .toEqual(expect.arrayContaining(["becoming-os-audience", "becoming-os-weights", "becoming-os-transactions"]));
      const aud = csvs.find((d) => d.suggestedFilename().startsWith("becoming-os-audience"))!;
      const audPath = test.info().outputPath(`audience-${vp}.csv`);
      await aud.saveAs(audPath);
      const lines = readFileSync(audPath, "utf8").trim().split(/\r?\n/);
      expect(lines[0]).toMatch(/platform/);
      expect(lines[0]).toMatch(/count/);
      expect(lines.length - 1).toBe(audience.length);

      // Restore: the button opens the file picker; bad files show a readable error and change nothing.
      const restoreBtn = data.getByRole("button", { name: "Restore from backup" });
      const chooseFile = async (file: { name: string; mimeType: string; buffer: Buffer } | string) => {
        const [chooser] = await Promise.all([page.waitForEvent("filechooser"), press(restoreBtn)]);
        await chooser.setFiles(file);
      };
      await chooseFile({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from("this is not json") });
      const err = data.getByRole("alert").filter({ hasText: "Backup not restored" });
      await expect(err).toContainText("isn't valid JSON");
      await chooseFile({ name: "other.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ app: "something-else", tables: {} })) });
      await expect(err).toContainText("That file isn't a BECOMING OS backup.");
      const damaged = { ...backup, tables: { ...backup.tables, audience: [{ ...backup.tables.audience[0], count: -5 }] } };
      await chooseFile({ name: "damaged.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(damaged)) });
      await expect(err).toContainText(/Record 1 in audience/);
      expect((await rows(page, "audience")).length).toBe(audience.length);

      // Change something after the backup, so the restore has something to put back.
      const rem = section(page, "reminders");
      await press(rem.getByRole("switch", { name: /^Daily logging/ }));
      await poll(async () => (await stored(page)).singles.reminderSettings?.daily_logging).toBe(false);

      // Cancel keeps what's here; Replace everything puts the backup back.
      await chooseFile(backupPath);
      const c = dialog(page, "Restore this backup?");
      await expect(c).toContainText("Anything you've logged that isn't in the backup is deleted.");
      await press(c.getByRole("button", { name: "Cancel" }));
      await expect(c).toBeHidden();
      expect((await stored(page)).singles.reminderSettings?.daily_logging).toBe(false);
      await expect(err).toBeHidden();
      await chooseFile(backupPath);
      await press(c.getByRole("button", { name: "Replace everything" }));
      await toast(page, "Backup restored.");
      await expect(settingsReady(page)).toBeVisible();
      await expect(page).toHaveURL(/#\/settings/);
      await poll(async () => (await stored(page)).singles.reminderSettings?.daily_logging).toBe(true);
      await expect(section(page, "reminders").getByRole("switch", { name: /^Daily logging/ })).toHaveAttribute("aria-checked", "true");
      await poll(async () => (await rows(page, "audience")).length).toBe(audience.length);
      await poll(async () => (await rows(page, "weights")).length).toBe(backup.tables.weights.length);
      // Notifications cleared before the backup stay cleared, even though reminders were worked out again during the restore.
      await nav(page, "/notifications", page.getByRole("heading", { name: "Reminders" }));
      await expect(page.getByText("All clear")).toBeVisible();
      await nav(page, "/settings", settingsReady(page));

      // Clear sample data: Cancel keeps it; confirming returns to setup with nothing stored.
      const danger = section(page, "demo");
      await press(danger.getByRole("button", { name: "Clear sample data" }));
      const cd = dialog(page, "Clear the sample data?");
      await press(cd.getByRole("button", { name: "Cancel" }));
      await expect(cd).toBeHidden();
      expect((await stored(page)).profile?.demo_mode).toBe(true);
      await press(danger.getByRole("button", { name: "Clear sample data" }));
      await press(cd.getByRole("button", { name: "Clear sample data" }));
      await page.waitForURL("**/#/onboarding");
      await poll(async () => (await rows(page, "audience")).length).toBe(0);
      await finish(page, errors);

      // The same backup restores into a brand-new, empty browser (device → another device).
      const fresh = await open(browser, vp, "skip");
      await nav(fresh.page, "/settings", settingsReady(fresh.page));
      const [chooser] = await Promise.all([fresh.page.waitForEvent("filechooser"), press(section(fresh.page, "data").getByRole("button", { name: "Restore from backup" }))]);
      await chooser.setFiles(backupPath);
      await press(dialog(fresh.page, "Restore this backup?").getByRole("button", { name: "Replace everything" }));
      await toast(fresh.page, "Backup restored.");
      await poll(async () => (await rows(fresh.page, "audience")).map((r) => [r.platform, r.recorded_on, r.count]).sort())
        .toEqual(audience.map((r) => [r.platform, r.recorded_on, r.count]).sort());
      await reload(fresh.page, settingsReady(fresh.page));
      await expect(section(fresh.page, "demo").getByRole("button", { name: "Clear sample data" })).toBeVisible();
      await finish(fresh.page, fresh.errors);
    });

    test("delete all my data needs DELETE typed", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      await nav(page, "/settings", settingsReady(page));
      await type(field(section(page, "profile"), "Name"), "Sam");
      await press(section(page, "profile").getByRole("button", { name: "Save profile" }));
      await toast(page, "Profile saved.");
      const danger = section(page, "demo");
      await expect(danger.getByRole("heading", { name: "Danger zone" })).toBeVisible();
      await press(danger.getByRole("button", { name: "Delete all my data" }));
      const d = dialog(page, "Delete all your data?");
      const go = d.getByRole("button", { name: "Delete everything" });
      await expect(go).toBeDisabled();
      await press(d.getByRole("button", { name: "Cancel" }));
      await expect(d).toBeHidden();
      expect((await stored(page)).profile?.display_name).toBe("Sam");
      await press(danger.getByRole("button", { name: "Delete all my data" }));
      await type(d.getByRole("textbox"), "delete");
      await expect(go).toBeDisabled();
      await type(d.getByRole("textbox"), "DELETE");
      await press(go);
      await page.waitForURL("**/#/onboarding");
      await toast(page, "All data deleted.");
      await poll(async () => (await stored(page)).profile?.onboarding_done).toBe(false);
      await finish(page, errors);
    });

    test("together: device-mode explanation, link to backup, sharing controls save and persist", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      await nav(page, "/together", page.getByRole("heading", { name: "Sharing needs the published page" }));
      await expectNoHorizontalScroll(page);
      const tog = page.locator("section#sharing");
      await expect(tog).toContainText("nothing is shared from this browser");
      // Business only appears when business is tracked.
      await expect(tog.getByRole("group", { name: "Business", exact: true })).toHaveCount(0);
      const save = tog.getByRole("button", { name: "Save sharing" });
      await expect(save).toBeDisabled();
      // Changing and changing back leaves nothing to save.
      await press(radio(tog, "Training", "Full"));
      await expect(save).toBeEnabled();
      await press(radio(tog, "Training", "Summary"));
      await expect(save).toBeDisabled();
      for (const o of ["Hidden", "Pounds lost", "Full detail", "% of goal", "Pounds lost"]) {
        await press(radio(tog, "Weight progress", o));
        await expect(radio(tog, "Weight progress", o)).toHaveAttribute("aria-checked", "true");
      }
      await press(radio(tog, "Training", "Hidden"));
      await press(radio(tog, "Habits", "Hidden"));
      await press(radio(tog, "Milestones", "Hidden"));
      await press(save);
      await toast(page, "Sharing saved.");
      await expect(save).toBeDisabled();
      const share = async () => {
        const s = (await stored(page)).singles.shareSettings ?? {};
        return [s.weight, s.training, s.habits, s.milestones, s.business];
      };
      await poll(share).toEqual(["pounds", "none", "none", "none", "none"]);
      await press(radio(tog, "Milestones", "Shared"));
      await press(radio(tog, "Training", "Summary"));
      await press(save);
      await toast(page, "Sharing saved.");
      await poll(share).toEqual(["pounds", "summary", "none", "full", "none"]);
      await reload(page, tog.getByRole("heading", { name: "What you share" }));
      await expect(radio(tog, "Weight progress", "Pounds lost")).toHaveAttribute("aria-checked", "true");
      await expect(radio(tog, "Training", "Summary")).toHaveAttribute("aria-checked", "true");
      await expect(radio(tog, "Habits", "Hidden")).toHaveAttribute("aria-checked", "true");
      await expect(radio(tog, "Milestones", "Shared")).toHaveAttribute("aria-checked", "true");

      // The link to Settings → Your data lands on that section.
      await press(page.getByRole("link", { name: "Settings → Your data" }));
      await expect(page).toHaveURL(/#\/settings#data$/);
      await expect(async () => checkUncovered(section(page, "data").getByRole("heading", { name: "Your data" }))).toPass();
      await expect(section(page, "data").getByRole("button", { name: "Save backup (JSON)" })).toBeVisible();
      await finish(page, errors);
    });

    test("notifications: list, mark read, open, mark all read, clear read stays cleared", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      // Make the daily logging reminder due now, so the list has a known entry.
      await nav(page, "/settings", settingsReady(page));
      await pick(field(section(page, "reminders"), "Daily logging reminder after"), { label: "12 am" });
      await poll(async () => (await stored(page)).singles.reminderSettings?.daily_logging_hour).toBe(0);
      await nav(page, "/notifications", page.getByRole("heading", { name: "Reminders" }));
      const list = page.getByRole("main").getByRole("listitem");
      const daily = list.filter({ hasText: "Nothing logged today yet" });
      await expect(daily).toBeVisible();
      const notes = () => rows(page, "notifications");
      // How many other reminders are due depends on the date; the daily one is always there.
      await poll(async () => (await notes()).length).toBeGreaterThan(0);
      const total = await list.count();
      expect(total).toBeGreaterThan(0);
      const unreadLabel = (n: number) => vp === "mobile"
        ? page.getByRole("link", { name: n ? `Notifications, ${n} unread` : "Notifications", exact: true })
        : page.locator("aside").getByRole("link", { name: n ? `Notifications ${n}` : "Notifications", exact: true });
      await expect(unreadLabel(total)).toBeVisible();

      const markAll = page.getByRole("button", { name: "Mark all read" });
      const clear = page.getByRole("button", { name: "Clear read" });
      await expectUncovered(markAll);
      await expect(clear).toBeDisabled();

      // Mark one read. How many reminders are due depends on the date, so this needs a third
      // one to leave something unread for "Mark all read" after the daily reminder is opened.
      if (total >= 3) {
        const other = list.filter({ hasNotText: "Nothing logged today yet" }).first();
        const otherTitle = (await other.locator("div.text-bone").first().textContent())!;
        await press(other.getByRole("button", { name: /^Mark read/ }));
        await expect(other.getByRole("button", { name: /^Mark read/ })).toHaveCount(0);
        await expect(unreadLabel(total - 1)).toBeVisible();
        await poll(async () => (await notes()).find((n) => n.title === otherTitle)?.read_at).toBeTruthy();
        await expect(clear).toBeEnabled();
      }

      // Open goes where the reminder points and marks it read.
      await press(daily.getByRole("link", { name: "Open: Nothing logged today yet" }));
      await expect(page).toHaveURL(/#\/log$/);
      await poll(async () => (await notes()).find((n) => n.dedupe_key?.toString().startsWith("daily:"))?.read_at).toBeTruthy();
      await nav(page, "/notifications", page.getByRole("heading", { name: "Reminders" }));

      // Mark all read (when anything is still unread after opening the daily one).
      if (await markAll.isEnabled()) await press(markAll);
      await expect(markAll).toBeDisabled();
      await expect(page.getByRole("main").getByRole("button", { name: /^Mark read/ })).toHaveCount(0);
      await expect(unreadLabel(0)).toBeVisible();
      await poll(async () => (await notes()).every((n) => n.read_at)).toBe(true);

      // Clear read: the list empties and stays empty after a reload — today's reminder doesn't come back.
      await press(clear);
      await expect(page.getByText("All clear")).toBeVisible();
      await poll(async () => (await notes()).every((n) => n.cleared_at)).toBe(true);
      const count = (await notes()).length;
      await reload(page, page.getByRole("heading", { name: "Reminders" }));
      await expect(page.getByText("All clear")).toBeVisible();
      await expect(list).toHaveCount(0);
      expect((await notes()).length).toBe(count);
      await expect(markAll).toBeDisabled();
      await expect(clear).toBeDisabled();

      // The Settings link goes to the reminder choices.
      await press(page.getByRole("main").getByRole("link", { name: "Settings", exact: true }));
      await expect(page).toHaveURL(/#\/settings#reminders$/);
      await expect(async () => checkUncovered(section(page, "reminders").getByRole("heading", { name: "Reminders" }))).toPass();
      await finish(page, errors);
    });
  });
}

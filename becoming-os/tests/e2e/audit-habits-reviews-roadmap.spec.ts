// Control-by-control audit of the Habits page (habit sheet with day picker,
// weekday/weekend shortcuts, pause on rest days, XP and start date; edit,
// archive, restore and delete; tasks; rest days; streaks and scores), the
// Reviews page (week/month switch, period navigation, the five reflection
// questions, sharing, draft/complete/edit, history links, figures built from
// records) and the Roadmap page (all eight chapters, notes and status, targets
// and actuals that follow new records) on a phone and on a desktop.
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, go, openFresh, rows, settle, stored, toast, type ViewportName } from "./helpers";

const SIZES: ViewportName[] = ["mobile", "desktop"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${MONTHS[m - 1]} ${day}, ${y}`;
};
const fmtShort = (d: string) => fmtDate(d).replace(/, \d+$/, "");
const fmtMonth = (d: string) => `${MONTHS_LONG[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const dow = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const weekStart = (d: string) => addDays(d, -((dow(d) + 6) % 7));
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const addMonths = (d: string, n: number) => {
  const t = new Date(`${d.slice(0, 7)}-01T12:00:00Z`);
  t.setUTCMonth(t.getUTCMonth() + n);
  return t.toISOString().slice(0, 10);
};
const fmtWeekRange = (start: string) => {
  const end = addDays(start, 6);
  return start.slice(5, 7) === end.slice(5, 7)
    ? `${fmtShort(start)}–${Number(end.slice(8, 10))}, ${end.slice(0, 4)}`
    : `${fmtShort(start)} – ${fmtShort(end)}, ${end.slice(0, 4)}`;
};

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

/** On screen, not clipped, and some part of it isn't under the bottom bar, the + button, a sheet or a toast. */
async function checkUncovered(loc: Locator): Promise<{ x: number; y: number }> {
  const r = await loc.evaluate((el) => {
    el.scrollIntoView({ block: "center", inline: "center" });
    const b = el.getBoundingClientRect();
    const mine = (hit: Element | null) => !!hit && (hit === el || el.contains(hit) || (el instanceof HTMLInputElement && !!el.labels?.[0]?.contains(hit)));
    const centre = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    let point: { x: number; y: number } | null = mine(centre) ? { x: b.width / 2, y: b.height / 2 } : null;
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

const card = (page: Page, title: string | RegExp) =>
  page.locator(".card").filter({ has: page.getByRole("heading", { name: title, exact: typeof title === "string" }) });
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const main = (page: Page) => page.getByRole("main");

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

async function finish(page: Page, errors: string[]) {
  await expectNoHorizontalScroll(page);
  expect(errors, "console or page errors").toEqual([]);
  await page.context().close();
}

async function reload(page: Page) {
  await page.reload();
  await settle(page);
}

// ───────────────────────────────────────────────────────────── habits helpers ──
const habitRow = (page: Page, name: string) => card(page, "Active habits").locator("li").filter({ hasText: name });
const archivedRow = (page: Page, name: string) => card(page, "Archived").locator("li").filter({ hasText: name });
const habitByName = async (page: Page, name: string) => (await rows(page, "habits")).find((h) => h.name === name) as Row | undefined;
const dayBtn = (scope: Locator, day: string) => scope.getByRole("group", { name: "Days of the week" }).getByRole("button", { name: day, exact: true });
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function expectDays(sheet: Locator, on: number[]) {
  for (let d = 0; d < 7; d++) await expect(dayBtn(sheet, DAYS[d])).toHaveAttribute("aria-pressed", String(on.includes(d)));
}

/** Adds an every-day habit through the sheet. */
async function addHabit(page: Page, name: string, opts: { start?: string; pause?: boolean } = {}) {
  await go(page, "/habits");
  await press(main(page).getByRole("button", { name: "New habit" }));
  const sheet = dialog(page, "New habit");
  await type(sheet.getByLabel("Habit", { exact: true }), name);
  if (opts.start) await type(sheet.getByLabel("Starts"), opts.start);
  if (opts.pause) await press(sheet.getByRole("switch", { name: "Pause on rest days" }));
  await press(sheet.getByRole("button", { name: "Add habit" }));
  await toast(page, "Habit added.");
  await expect(sheet).toBeHidden();
  await expect(habitRow(page, name)).toBeVisible();
}

/** Checks a habit off (or back on) on Today. */
async function tickOnToday(page: Page, name: string, pressed: boolean) {
  await go(page, "/");
  const btn = main(page).locator("button[aria-pressed]").filter({ hasText: name });
  await press(btn);
  await expect(btn).toHaveAttribute("aria-pressed", String(pressed));
}

const stat = (page: Page, label: string) => main(page).locator(".card").filter({ hasText: label }).first();

for (const vp of SIZES) {
  test.describe(`habits on ${vp}`, () => {
    test("new habit sheet: every input, day shortcuts, validation, save, edit, archive, restore, delete", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      const today = await appToday(page);
      await go(page, "/habits");
      await expect(card(page, "Active habits")).toContainText("No habits yet.");
      await expect(main(page)).toContainText("Completion history builds as you check habits off.");

      const sheet = await openSheet(page, main(page).getByRole("button", { name: "New habit" }), "New habit");
      const name = sheet.getByLabel("Habit", { exact: true });
      await expect(name).toHaveValue("");
      // Defaults: every day, other, 10 XP, starts today, doesn't pause.
      await expectDays(sheet, [0, 1, 2, 3, 4, 5, 6]);
      await expect(sheet.getByLabel("Category")).toHaveValue("other");
      await expect(sheet.getByLabel("XP per completion")).toHaveValue("10");
      await expect(sheet.getByLabel("Starts")).toHaveValue(today);
      const pause = sheet.getByRole("switch", { name: "Pause on rest days" });
      await expect(pause).toHaveAttribute("aria-checked", "false");

      // A name is needed.
      await press(sheet.getByRole("button", { name: "Add habit" }));
      await alertToast(page, "Name the habit.");
      await expect(sheet).toBeVisible();

      await type(name, "Morning mobility");
      await choose(sheet.getByLabel("Category"), "training");
      await expect(sheet.getByLabel("Category")).toHaveValue("training");

      // Shortcuts and single days.
      await press(sheet.getByRole("button", { name: "Weekdays", exact: true }));
      await expectDays(sheet, [1, 2, 3, 4, 5]);
      await press(sheet.getByRole("button", { name: "Weekends", exact: true }));
      await expectDays(sheet, [0, 6]);
      await press(sheet.getByRole("button", { name: "Every day", exact: true }));
      await expectDays(sheet, [0, 1, 2, 3, 4, 5, 6]);
      for (const d of DAYS) await press(dayBtn(sheet, d));
      await expectDays(sheet, []);
      await press(sheet.getByRole("button", { name: "Add habit" }));
      await alertToast(page, "Choose at least one day.");
      await expect(name).toHaveValue("Morning mobility"); // what was typed is kept
      for (const d of ["Monday", "Wednesday", "Friday"]) await press(dayBtn(sheet, d));
      await expectDays(sheet, [1, 3, 5]);

      await press(pause);
      await expect(pause).toHaveAttribute("aria-checked", "true");
      await press(sheet.getByText("Pause on rest days")); // the label toggles it too
      await expect(pause).toHaveAttribute("aria-checked", "false");
      await press(pause);
      await expect(pause).toHaveAttribute("aria-checked", "true");

      for (const xp of ["5", "15", "25", "20"]) {
        await choose(sheet.getByLabel("XP per completion"), xp);
        await expect(sheet.getByLabel("XP per completion")).toHaveValue(xp);
      }
      await type(sheet.getByLabel("Starts"), "");
      await press(sheet.getByRole("button", { name: "Add habit" }));
      await alertToast(page, "Choose a start date.");
      await type(sheet.getByLabel("Starts"), addDays(today, -2));

      await press(sheet.getByRole("button", { name: "Add habit" }));
      await toast(page, "Habit added.");
      await expect(sheet).toBeHidden();
      await expect.poll(() => habitByName(page, "Morning mobility")).toMatchObject({
        category: "training", schedule_days: [1, 3, 5], skip_on_rest_days: true, xp: 20, start_date: addDays(today, -2), archived_on: null,
      });
      const row = habitRow(page, "Morning mobility");
      await expect(row).toContainText("training");
      await expect(row).toContainText("pauses on rest days");
      await expect(row).toContainText("+20 XP");
      await expect(card(page, "Active habits")).not.toContainText("No habits yet.");
      // Readable on a phone: the name stays on one line and the day dots keep their size.
      const nameBox = await row.getByText("Morning mobility", { exact: true }).boundingBox();
      expect(nameBox!.height, "habit name wraps word by word").toBeLessThan(30);
      for (const dot of await row.locator("span.rounded-full.h-5").all()) {
        const b = await dot.boundingBox();
        expect(Math.round(b!.width), "day dot squeezed").toBe(20);
      }

      // Edit: the sheet opens filled in, every change is stored.
      const edit = await openSheet(page, row.getByRole("button", { name: "Edit Morning mobility" }), "Edit habit");
      await expect(edit.getByLabel("Habit", { exact: true })).toHaveValue("Morning mobility");
      await expect(edit.getByLabel("Category")).toHaveValue("training");
      await expectDays(edit, [1, 3, 5]);
      await expect(edit.getByRole("switch", { name: "Pause on rest days" })).toHaveAttribute("aria-checked", "true");
      await expect(edit.getByLabel("XP per completion")).toHaveValue("20");
      await expect(edit.getByLabel("Starts")).toHaveValue(addDays(today, -2));
      await expect(edit).toContainText("Days before this don't count.");
      await type(edit.getByLabel("Habit", { exact: true }), "Evening mobility");
      await choose(edit.getByLabel("Category"), "recovery");
      await press(edit.getByRole("button", { name: "Weekends", exact: true }));
      await press(edit.getByRole("switch", { name: "Pause on rest days" }));
      await choose(edit.getByLabel("XP per completion"), "5");
      await type(edit.getByLabel("Starts"), addDays(today, -5));
      await press(edit.getByRole("button", { name: "Save", exact: true }));
      await toast(page, "Habit updated.");
      await expect(edit).toBeHidden();
      await expect.poll(() => habitByName(page, "Evening mobility")).toMatchObject({
        category: "recovery", schedule_days: [0, 6], skip_on_rest_days: false, xp: 5, start_date: addDays(today, -5),
      });
      expect(await rows(page, "habits")).toHaveLength(1);
      const edited = habitRow(page, "Evening mobility");
      await expect(edited).toContainText("recovery");
      await expect(edited).not.toContainText("pauses on rest days");
      await expect(edited).toContainText("+5 XP");

      // Survives a reload.
      await reload(page);
      await expect(habitRow(page, "Evening mobility")).toContainText("+5 XP");

      // Archive: Cancel keeps it, Archive moves it to the archived list.
      await press(habitRow(page, "Evening mobility").getByRole("button", { name: "Archive Evening mobility" }));
      const confirmArchive = dialog(page, "Archive “Evening mobility”?");
      await press(confirmArchive.getByRole("button", { name: "Cancel" }));
      await expect(confirmArchive).toBeHidden();
      await expect(habitRow(page, "Evening mobility")).toBeVisible();
      await press(habitRow(page, "Evening mobility").getByRole("button", { name: "Archive Evening mobility" }));
      await press(confirmArchive.getByRole("button", { name: "Archive" }));
      await toast(page, "Archived.");
      await expect(habitRow(page, "Evening mobility")).toHaveCount(0);
      await expect(archivedRow(page, "Evening mobility")).toContainText(`archived ${fmtDate(today)}`);
      await expect.poll(async () => (await habitByName(page, "Evening mobility"))?.archived_on).toBe(today);

      // Restore brings it back.
      await press(archivedRow(page, "Evening mobility").getByRole("button", { name: "Restore" }));
      await toast(page, "Restored.");
      await expect(habitRow(page, "Evening mobility")).toBeVisible();
      await expect(card(page, "Archived")).toHaveCount(0);
      await expect.poll(async () => (await habitByName(page, "Evening mobility"))?.archived_on).toBeNull();

      // Archive again, then delete permanently (Cancel first).
      await press(habitRow(page, "Evening mobility").getByRole("button", { name: "Archive Evening mobility" }));
      await press(confirmArchive.getByRole("button", { name: "Archive" }));
      await expect(archivedRow(page, "Evening mobility")).toBeVisible();
      await press(archivedRow(page, "Evening mobility").getByRole("button", { name: "Delete" }));
      const confirmDelete = dialog(page, "Delete “Evening mobility” permanently?");
      await expect(confirmDelete).toContainText("Archiving keeps them.");
      await press(confirmDelete.getByRole("button", { name: "Cancel" }));
      await expect(archivedRow(page, "Evening mobility")).toBeVisible();
      await press(archivedRow(page, "Evening mobility").getByRole("button", { name: "Delete" }));
      await press(confirmDelete.getByRole("button", { name: "Delete" }));
      await toast(page, "Deleted.");
      await expect(card(page, "Archived")).toHaveCount(0);
      await expect(card(page, "Active habits")).toContainText("No habits yet.");
      await expect.poll(() => rows(page, "habits")).toHaveLength(0);
      await reload(page);
      await expect(card(page, "Active habits")).toContainText("No habits yet.");
      await finish(page, errors);
    });

    test("streaks, scores and the chart follow completions, rest days and tasks", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      const today = await appToday(page);
      const yesterday = addDays(today, -1);
      await addHabit(page, "Daily stretch", { start: addDays(today, -3), pause: true });
      const row = habitRow(page, "Daily stretch");
      await expect(row).toContainText("0 streak");
      await expect(row).toContainText("0 best");
      await expect(stat(page, "Today")).toContainText("0/1 incl. tasks");
      await expect(main(page)).not.toContainText("Completion history builds as you check habits off.");

      // Done today on Today, done yesterday on the Log page's habit list.
      await tickOnToday(page, "Daily stretch", true);
      await go(page, "/log?tab=mind");
      await type(main(page).getByLabel("Habit date"), yesterday);
      const logBtn = main(page).locator("button[aria-pressed]").filter({ hasText: "Daily stretch" });
      await press(logBtn);
      await expect(logBtn).toHaveAttribute("aria-pressed", "true");
      await expect.poll(async () => (await rows(page, "completions")).map((c) => c.completed_on).sort()).toEqual([yesterday, today]);

      await go(page, "/habits");
      await expect(row).toContainText("2 streak");
      await expect(row).toContainText("2 best");
      await expect(row).toContainText("50% 28d"); // 2 of the 4 days since it started
      await expect(stat(page, "Today")).toContainText("100%");
      await expect(stat(page, "Today")).toContainText("1/1 incl. tasks");

      // A rest day today pauses it: today no longer counts, the streak holds at yesterday's.
      const rest = card(page, "Rest days");
      await expect(rest).toContainText("No rest days in the last two weeks or planned.");
      await expect(rest.getByLabel("Rest date")).toHaveValue(today);
      await press(rest.getByRole("button", { name: "Add", exact: true }));
      await toast(page, "Rest day scheduled.");
      const restRow = rest.locator("li").filter({ hasText: fmtDate(today) });
      await expect(restRow).toContainText("today");
      await expect(stat(page, "Today")).toContainText("0/0 incl. tasks");
      await expect(row).toContainText("1 streak");
      await deleteRestDay(page, restRow);
      await expect(row).toContainText("2 streak");
      await expect(stat(page, "Today")).toContainText("1/1 incl. tasks");

      // Unticking today drops the score but the day isn't over, so the streak holds.
      await tickOnToday(page, "Daily stretch", false);
      await go(page, "/habits");
      await expect(stat(page, "Today")).toContainText("0/1 incl. tasks");
      await expect(row).toContainText("1 streak");
      await reload(page);
      await expect(habitRow(page, "Daily stretch")).toContainText("1 streak");
      await finish(page, errors);
    });

    test("rest days: add with a note, update the same date, empty date, delete", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      const today = await appToday(page);
      const later = addDays(today, 3);
      await go(page, "/habits");
      const rest = card(page, "Rest days");
      await type(rest.getByLabel("Rest date"), later);
      await type(rest.getByLabel("Rest day note"), "Family day");
      await press(rest.getByRole("button", { name: "Add", exact: true }));
      await toast(page, "Rest day scheduled.");
      await expect(rest.getByLabel("Rest day note")).toHaveValue("");
      const restRow = rest.locator("li").filter({ hasText: fmtDate(later) });
      await expect(restRow).toContainText("Family day");
      await expect.poll(() => rows(page, "restDays")).toEqual([expect.objectContaining({ rest_date: later, note: "Family day" })]);

      // Same date again updates the note instead of adding a second rest day.
      await type(rest.getByLabel("Rest day note"), "Travel");
      await press(rest.getByRole("button", { name: "Add", exact: true }));
      await expect(restRow).toContainText("Travel");
      await expect.poll(() => rows(page, "restDays")).toEqual([expect.objectContaining({ rest_date: later, note: "Travel" })]);

      // Without a note it reads "scheduled"; a cleared date is refused with a message.
      await type(rest.getByLabel("Rest date"), addDays(today, 5));
      await press(rest.getByRole("button", { name: "Add", exact: true }));
      await expect(rest.locator("li").filter({ hasText: fmtDate(addDays(today, 5)) })).toContainText("scheduled");
      await type(rest.getByLabel("Rest date"), "");
      await press(rest.getByRole("button", { name: "Add", exact: true }));
      await alertToast(page, "Choose a date for the rest day.");
      await expect.poll(async () => (await rows(page, "restDays")).length).toBe(2);
      // Listed in date order.
      const listed = await rest.locator("li").allInnerTexts();
      expect(listed[0]).toContain(fmtDate(later));

      await reload(page);
      await expect(card(page, "Rest days").locator("li").filter({ hasText: fmtDate(later) })).toContainText("Travel");
      await deleteRestDay(page, card(page, "Rest days").locator("li").filter({ hasText: fmtDate(later) }));
      await expect.poll(() => rows(page, "restDays")).toEqual([expect.objectContaining({ rest_date: addDays(today, 5) })]);
      await finish(page, errors);
    });

    test("tasks: add (button and Enter), validation, complete, reopen, delete, Today updates", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      const today = await appToday(page);
      await go(page, "/habits");
      const tasks = page.locator("#tasks");
      await expect(tasks).toContainText("Tasks due today count toward the daily execution score.");
      const title = tasks.getByLabel("Task", { exact: true });
      const due = tasks.getByLabel("Due date");
      await expect(due).toHaveValue(today);

      await press(tasks.getByRole("button", { name: "Add task" }));
      await alertToast(page, "Write the task first.");
      await type(title, "Call the accountant");
      await type(due, "");
      await press(tasks.getByRole("button", { name: "Add task" }));
      await alertToast(page, "Choose a due date.");
      await expect(title).toHaveValue("Call the accountant");
      await type(due, today);
      await press(tasks.getByRole("button", { name: "Add task" }));
      await expect(title).toHaveValue("");
      const open1 = tasks.locator("li").filter({ hasText: "Call the accountant" });
      await expect(open1).toContainText("today");
      await expect(stat(page, "Today")).toContainText("0/1 incl. tasks");

      // Enter adds too; a later due date shows the date.
      await type(title, "Plan the week");
      await type(due, addDays(today, 2));
      await title.press("Enter");
      await expect(tasks.locator("li").filter({ hasText: "Plan the week" })).toContainText(fmtShort(addDays(today, 2)));
      await expect.poll(async () => (await rows(page, "tasks")).map((t) => [t.title, t.due_date, t.completed_on])).toEqual([
        ["Call the accountant", today, null], ["Plan the week", addDays(today, 2), null],
      ]);
      // Open tasks are listed by due date.
      await type(title, "Overdue thing");
      await type(due, addDays(today, -2));
      await press(tasks.getByRole("button", { name: "Add task" }));
      await expect(tasks.locator("li").first()).toContainText("Overdue thing");

      // Today shows the one due today.
      await go(page, "/");
      await expect(main(page).getByRole("button", { name: "Toggle Call the accountant" })).toBeVisible();
      await go(page, "/habits");

      await press(tasks.getByRole("button", { name: "Complete Call the accountant" }));
      await expect(tasks.getByRole("button", { name: "Reopen Call the accountant" })).toBeVisible();
      await expect(stat(page, "Today")).toContainText("1/1 incl. tasks");
      await expect.poll(async () => (await rows(page, "tasks")).find((t) => t.title === "Call the accountant")?.completed_on).toBe(today);
      await reload(page);
      await press(tasks.getByRole("button", { name: "Reopen Call the accountant" }));
      await expect(tasks.getByRole("button", { name: "Complete Call the accountant" })).toBeVisible();
      await expect(stat(page, "Today")).toContainText("0/1 incl. tasks");
      await expect.poll(async () => (await rows(page, "tasks")).find((t) => t.title === "Call the accountant")?.completed_on).toBeNull();

      // Delete an open task and a completed one.
      await press(tasks.getByRole("button", { name: "Delete Plan the week" }));
      await expect(tasks.locator("li").filter({ hasText: "Plan the week" })).toHaveCount(0);
      await press(tasks.getByRole("button", { name: "Complete Overdue thing" }));
      await press(tasks.getByRole("button", { name: "Delete Overdue thing" }));
      await expect(tasks.locator("li").filter({ hasText: "Overdue thing" })).toHaveCount(0);
      await expect.poll(async () => (await rows(page, "tasks")).map((t) => t.title)).toEqual(["Call the accountant"]);
      await reload(page);
      await expect(page.locator("#tasks").locator("li")).toHaveCount(1);
      await finish(page, errors);
    });
  });
}

async function deleteRestDay(page: Page, row: Locator) {
  await press(row.getByRole("button", { name: "Delete" }));
  const confirm = dialog(page, "Delete this rest day?");
  await press(confirm.getByRole("button", { name: "Cancel" }));
  await expect(row).toHaveCount(1);
  await press(row.getByRole("button", { name: "Delete" }));
  await press(confirm.getByRole("button", { name: "Delete" }));
  await toast(page, "Deleted.");
  await expect(row).toHaveCount(0);
}

// ──────────────────────────────────────────────────────────────────── reviews ──
const QUESTIONS = ["What went well?", "What was difficult?", "What did I learn?", "What will I change next time?", "What am I proud of?"];
const KEYS = ["went_well", "difficult", "learned", "change_next", "proud"];
const periodLabel = (page: Page) => main(page).locator("span.num").filter({ hasText: /\d{4}/ }).first();
const reflection = (page: Page) => card(page, "Reflection");

async function toLatest(page: Page) {
  const next = main(page).getByRole("button", { name: "Next period" });
  for (let i = 0; i < 3 && (await next.isEnabled()); i++) await press(next);
  await expect(next).toBeDisabled();
}

for (const vp of SIZES) {
  test.describe(`reviews on ${vp}`, () => {
    test("weekly review: navigation, figures from records, all five questions, share, draft, complete, edit, history", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      const today = await appToday(page);
      const thisWeek = weekStart(today);
      // Started last Monday and never done last week, so this week can be compared with it.
      await addHabit(page, "Lights out", { start: addDays(thisWeek, -7) });
      const days = Math.round((Date.parse(today) - Date.parse(thisWeek)) / 86_400_000) + 1;

      await go(page, "/reviews");
      await expect(main(page).getByRole("heading", { name: "Weekly review" })).toBeVisible();
      const prev = main(page).getByRole("button", { name: "Previous period" });
      const next = main(page).getByRole("button", { name: "Next period" });
      await toLatest(page);
      await expect(periodLabel(page)).toHaveText(fmtWeekRange(thisWeek));
      if (addDays(thisWeek, 6) > today) await expect(main(page)).toContainText(`In progress — through ${fmtDate(today)}`);
      await press(prev);
      await expect(periodLabel(page)).toHaveText(fmtWeekRange(addDays(thisWeek, -7)));
      expect(page.url()).toContain(`week=${addDays(thisWeek, -7)}`);
      await expect(next).toBeEnabled();
      await press(prev);
      await expect(periodLabel(page)).toHaveText(fmtWeekRange(addDays(thisWeek, -14)));
      await press(next);
      await press(next);
      await expect(periodLabel(page)).toHaveText(fmtWeekRange(thisWeek));
      await expect(next).toBeDisabled();

      // Figures and observations come from the records and follow them.
      const habitsCard = main(page).locator(".card").filter({ has: page.getByText("Habits", { exact: true }) }).first();
      const habitRowInTable = card(page, "Habit by habit").getByRole("row").filter({ hasText: "Lights out" });
      const obs = card(page, "Observations");
      await expect(habitsCard).toContainText(`0 of ${days} scheduled`);
      await expect(habitRowInTable).toContainText("0%");
      await expect(obs).toContainText("No notable patterns yet.");
      await expect(card(page, /Priorities for next week/).locator("ol li").first()).toBeVisible();
      await tickOnToday(page, "Lights out", true);
      await go(page, `/reviews?week=${thisWeek}`);
      await expect(habitsCard).toContainText(`1 of ${days} scheduled`);
      await expect(habitsCard).toContainText(`${Math.round(Math.round(1000 / days) / 10)}%`);
      await expect(habitRowInTable.getByRole("cell").nth(1)).toHaveText("1");
      await expect(obs).toContainText("Execution improved");
      await expect(obs).toContainText(`Habit completion rose from 0% to`);
      await tickOnToday(page, "Lights out", false);
      await go(page, `/reviews?week=${thisWeek}`);
      await expect(habitsCard).toContainText(`0 of ${days} scheduled`);
      await expect(obs).not.toContainText("Execution improved");
      await tickOnToday(page, "Lights out", true);
      await go(page, `/reviews?week=${thisWeek}`);
      await expect(habitsCard).toContainText(`1 of ${days} scheduled`);

      // Reflection: completing needs an answer; every box takes text and is kept.
      const ref = reflection(page);
      await press(ref.getByRole("button", { name: "Complete review" }));
      await alertToast(page, "Answer at least one question to complete the review.");
      for (const [i, q] of QUESTIONS.entries()) await type(ref.getByLabel(q), `Answer ${i + 1}\nsecond line`);
      const share = ref.getByRole("switch", { name: "Share this reflection with my partner" });
      await expect(share).toHaveAttribute("aria-checked", "false");
      await press(share);
      await expect(share).toHaveAttribute("aria-checked", "true");
      await press(ref.getByRole("button", { name: "Save draft" }));
      await toast(page, "Draft saved.");
      const review = async () => (await rows(page, "reviews")).find((r) => r.period === "week" && r.period_start === thisWeek);
      await expect.poll(review).toMatchObject({
        shared: true, completed_at: null,
        ...Object.fromEntries(KEYS.map((k, i) => [k, `Answer ${i + 1}\nsecond line`])),
      });
      await expect(card(page, "Past reviews")).toHaveCount(0);

      await press(ref.getByRole("button", { name: "Complete review" }));
      await toast(page, "Review completed. Well done.");
      await expect(main(page).getByText("Completed", { exact: true })).toBeVisible();
      await expect(ref).toContainText(`Completed ${fmtDate(today)}. You can still edit it.`);
      await expect.poll(async () => typeof (await review())?.completed_at).toBe("string");
      const completedAt = (await review())!.completed_at;
      const history = card(page, "Past reviews");
      await expect(history.getByRole("link", { name: new RegExp(`Week of ${fmtWeekRange(thisWeek)}`) })).toContainText("Answer 5");

      // Edit after completing: the button reads Save, the completion date is kept.
      await type(ref.getByLabel("What am I proud of?"), "Kept going");
      await press(share);
      await press(ref.getByRole("button", { name: "Save", exact: true }));
      await toast(page, "Review saved.");
      await expect.poll(review).toMatchObject({ proud: "Kept going", shared: false, completed_at: completedAt });
      await expect(history).toContainText("Kept going");
      // Clearing an answer stores nothing for it.
      await type(ref.getByLabel("What did I learn?"), "   ");
      await press(ref.getByRole("button", { name: "Save draft" }));
      await expect.poll(async () => (await review())?.learned).toBeNull();
      await expect.poll(async () => (await review())?.completed_at).toBe(completedAt);

      // Another week starts blank; the history link brings this one back.
      await press(prev);
      await expect(reflection(page).getByLabel("What went well?")).toHaveValue("");
      await expect(main(page).getByText("Completed", { exact: true })).toHaveCount(0);
      await press(card(page, "Past reviews").getByRole("link").first());
      await expect(periodLabel(page)).toHaveText(fmtWeekRange(thisWeek));
      await expect(reflection(page).getByLabel("What went well?")).toHaveValue("Answer 1\nsecond line");
      await reload(page);
      await expect(reflection(page).getByLabel("What am I proud of?")).toHaveValue("Kept going");
      await expect(reflection(page).getByRole("switch", { name: "Share this reflection with my partner" })).toHaveAttribute("aria-checked", "false");
      await finish(page, errors);
    });

    test("monthly review: switch, navigation, complete, roadmap link", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      const today = await appToday(page);
      await go(page, "/reviews");
      await press(main(page).getByRole("radio", { name: "Month" }));
      await expect(main(page).getByRole("radio", { name: "Month" })).toHaveAttribute("aria-checked", "true");
      await expect(main(page).getByRole("heading", { name: "Monthly review" })).toBeVisible();
      await expect(card(page, "Priorities for next month")).toBeVisible();
      await toLatest(page);
      const thisMonth = monthStart(today);
      await expect(periodLabel(page)).toHaveText(fmtMonth(thisMonth));
      await press(main(page).getByRole("button", { name: "Previous period" }));
      await expect(periodLabel(page)).toHaveText(fmtMonth(addMonths(thisMonth, -1)));
      expect(page.url()).toContain(`month=${addMonths(thisMonth, -1)}`);
      await press(main(page).getByRole("button", { name: "Next period" }));
      await expect(periodLabel(page)).toHaveText(fmtMonth(thisMonth));

      const ref = reflection(page);
      await type(ref.getByLabel("What went well?"), "Logged every day");
      await press(ref.getByRole("button", { name: "Complete review" }));
      await toast(page, "Review completed. Well done.");
      await expect.poll(async () => (await rows(page, "reviews")).map((r) => [r.period, r.period_start, r.went_well, r.difficult])).toEqual([
        ["month", thisMonth, "Logged every day", null],
      ]);
      await expect(card(page, "Past reviews").getByRole("link", { name: new RegExp(fmtMonth(thisMonth)) })).toBeVisible();

      // Back to weeks and again to months: the saved answer is still there.
      await press(main(page).getByRole("radio", { name: "Week" }));
      await expect(main(page).getByRole("heading", { name: "Weekly review" })).toBeVisible();
      await expect(reflection(page).getByLabel("What went well?")).toHaveValue("");
      await press(main(page).getByRole("radio", { name: "Month" }));
      await expect(reflection(page).getByLabel("What went well?")).toHaveValue("Logged every day");

      await press(main(page).getByRole("link", { name: "roadmap chapter" }));
      await expect(page).toHaveURL(/#\/roadmap/);
      if (today >= "2026-10-10" && today <= "2027-05-24") {
        await expect(main(page)).toContainText("Your monthly review for this month is complete.");
      }
      await finish(page, errors);
    });

    test("sample data: business figures and past reviews open from history", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "demo");
      await go(page, "/reviews");
      await expect(card(page, "Observations")).toBeVisible();
      await expect(main(page).getByText("Revenue earned", { exact: true })).toBeVisible();
      const links = card(page, "Past reviews").getByRole("link");
      const n = await links.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < Math.min(n, 3); i++) {
        const text = (await links.nth(i).locator("span").first().innerText()).replace(/^Week of /, "");
        await press(links.nth(i));
        await expect(periodLabel(page)).toHaveText(text);
        await expect(main(page).getByText("Completed", { exact: true })).toBeVisible();
        const answers = await Promise.all(QUESTIONS.map((q) => reflection(page).getByLabel(q).inputValue()));
        expect(answers.some((a) => a.length > 0)).toBe(true);
      }
      await press(main(page).getByRole("radio", { name: "Month" }));
      await expect(main(page).getByRole("heading", { name: "Monthly review" })).toBeVisible();
      await expect(card(page, "Observations")).toBeVisible();
      await finish(page, errors);
    });
  });
}

// ──────────────────────────────────────────────────────────────────── roadmap ──
const CHAPTER_TITLES = ["Establish the baseline", "Build consistency", "Strengthen the system", "Build momentum", "Increase capacity",
  "Prepare for execution", "Performance and optimization", "Complete the mission"];
const CHAPTER_KEYS = ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05"];
const chapterBtn = (page: Page, title: string) => main(page).locator("button[aria-expanded]").filter({ hasText: title });
const chapter = (page: Page, title: string) => main(page).locator("ol > li").filter({ has: page.getByRole("heading", { name: title }) });
const target = (scope: Locator, label: string) => scope.locator(".rounded-xl").filter({ has: scope.page().getByText(label, { exact: true }) });

for (const vp of SIZES) {
  test.describe(`roadmap on ${vp}`, () => {
    test("eight chapters open and close, notes and status save, edit and persist", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "skip");
      const today = await appToday(page);
      await go(page, "/roadmap");
      await expect(main(page).locator("button[aria-expanded]")).toHaveCount(8);
      const currentIdx = CHAPTER_KEYS.findIndex((k) => today.slice(0, 7) === k);
      const current = CHAPTER_TITLES[Math.max(0, currentIdx)];
      await expect(chapterBtn(page, current)).toHaveAttribute("aria-expanded", "true");
      // Status pills stay on one line.
      for (const title of CHAPTER_TITLES) {
        const b = await chapterBtn(page, title).locator("span.rounded-full").boundingBox();
        expect(b!.height, `${title} status pill wraps`).toBeLessThan(28);
      }

      // Every chapter opens (and only one at a time); tapping again closes it.
      for (const [i, title] of CHAPTER_TITLES.entries()) {
        const btn = chapterBtn(page, title);
        if ((await btn.getAttribute("aria-expanded")) !== "true") await press(btn);
        await expect(btn).toHaveAttribute("aria-expanded", "true");
        await expect(btn).toContainText(`Chapter ${i + 1}`);
        const ch = chapter(page, title);
        await expect(ch.getByLabel("Planned actions")).toBeVisible();
        await expect(ch.getByRole("button", { name: "Save chapter" })).toBeVisible();
        await expect(main(page).locator("button[aria-expanded=true]")).toHaveCount(1);
      }
      const last = chapterBtn(page, CHAPTER_TITLES[7]);
      await press(last);
      await expect(last).toHaveAttribute("aria-expanded", "false");
      await expect(main(page).locator("button[aria-expanded=true]")).toHaveCount(0);

      // Notes on the current chapter: every field, then the status pill and objective follow.
      await press(chapterBtn(page, current));
      const ch = chapter(page, current);
      await type(ch.getByLabel("Planned actions"), "Walk daily\nLog meals");
      await type(ch.getByLabel("Reflection"), "Good start");
      await type(ch.getByLabel("Your own objective (optional)"), "Show up every day");
      const status = ch.getByLabel("Status");
      await expect(status).toHaveValue("");
      for (const v of ["not_started", "in_progress", "complete", "adjusted"]) {
        await choose(status, v);
        await expect(status).toHaveValue(v);
      }
      await press(ch.getByRole("button", { name: "Save chapter" }));
      await toast(page, "Chapter saved.");
      await expect(chapterBtn(page, current)).toContainText("Adjusted");
      await expect(ch).toContainText("Show up every day");
      const note = async (key: string) => (await rows(page, "roadmapNotes")).find((n) => n.chapter_key === key);
      const key = CHAPTER_KEYS[Math.max(0, currentIdx)];
      await expect.poll(() => note(key)).toMatchObject({
        planned_actions: "Walk daily\nLog meals", reflection: "Good start", objective: "Show up every day", status_override: "adjusted",
      });

      // Survives a reload; then edit back to automatic with no own objective.
      await reload(page);
      const ch2 = chapter(page, current);
      await expect(ch2.getByLabel("Planned actions")).toHaveValue("Walk daily\nLog meals");
      await expect(ch2.getByLabel("Status")).toHaveValue("adjusted");
      await type(ch2.getByLabel("Your own objective (optional)"), "");
      await type(ch2.getByLabel("Reflection"), "Better than expected");
      await choose(ch2.getByLabel("Status"), "");
      await press(ch2.getByRole("button", { name: "Save chapter" }));
      await toast(page, "Chapter saved.");
      await expect.poll(() => note(key)).toMatchObject({ objective: null, reflection: "Better than expected", status_override: null });
      await expect(chapterBtn(page, current)).not.toContainText("Adjusted");
      expect((await rows(page, "roadmapNotes")).length).toBe(1);

      // The last chapter, at the bottom of the page, saves too.
      await press(chapterBtn(page, CHAPTER_TITLES[7]));
      const ch8 = chapter(page, CHAPTER_TITLES[7]);
      await type(ch8.getByLabel("Planned actions"), "Race if ready");
      await choose(ch8.getByLabel("Status"), "not_started");
      await press(ch8.getByRole("button", { name: "Save chapter" }));
      await toast(page, "Chapter saved.");
      await expect(chapterBtn(page, CHAPTER_TITLES[7])).toContainText("Not started");
      await expect.poll(() => note("2027-05")).toMatchObject({ planned_actions: "Race if ready", status_override: "not_started" });

      // Monthly review link goes to that month's review.
      await press(ch8.getByRole("link", { name: "Monthly review →" }));
      await expect(page).toHaveURL(/#\/reviews\?period=month&month=2027-05-01/);
      await expect(main(page).getByRole("heading", { name: "Monthly review" })).toBeVisible();

      // The starting-weight notice links to Settings.
      await go(page, "/roadmap");
      await press(main(page).getByRole("link", { name: "Set it" }));
      await expect(page).toHaveURL(/#\/settings/);
      await finish(page, errors);
    });

    test("targets and actuals follow new records", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "demo");
      const today = await appToday(page);
      const idx = CHAPTER_KEYS.findIndex((k) => today.slice(0, 7) === k);
      const title = CHAPTER_TITLES[idx];
      await go(page, "/roadmap");
      const ch = chapter(page, title);
      await expect(chapterBtn(page, title)).toHaveAttribute("aria-expanded", "true");
      const sessionsText = await target(ch, "Athletic").innerText();
      const sessions = Number(/Actual: (\d+) session/.exec(sessionsText)?.[1]);
      expect(Number.isFinite(sessions)).toBe(true);
      const weightBefore = await target(ch, "Weight milestone").innerText();
      const habitBefore = await target(ch, "Habit focus").innerText();
      expect(weightBefore).toContain("Actual:");

      // A workout adds a session.
      await go(page, "/log?tab=training");
      const form = page.getByRole("form", { name: "Workout form" });
      await choose(form.getByLabel("Activity"), "walk");
      await type(form.getByLabel("Duration"), "45");
      await press(form.getByRole("button", { name: "Log workout" }));
      const dupe = dialog(page, "Possible duplicate");
      if (await dupe.isVisible({ timeout: 1000 }).catch(() => false)) await press(dupe.getByRole("button", { name: "Log it again" }));
      await toast(page, "Workout logged.");
      await go(page, "/roadmap");
      await expect(target(ch, "Athletic")).toContainText(`Actual: ${sessions + 1} session${sessions + 1 === 1 ? "" : "s"}`);

      // A weigh-in moves the weight actual.
      await go(page, "/log?tab=body");
      const weigh = page.getByRole("form", { name: "Weigh-in form" });
      await type(weigh.getByLabel("Weight in pounds"), "229.4");
      await press(weigh.getByRole("button", { name: "Save weigh-in" }));
      const check = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: /save|correct|keep/i }) });
      if (await check.isVisible({ timeout: 1000 }).catch(() => false)) await press(check.getByRole("button", { name: /save|correct|keep/i }).last());
      await expect.poll(async () => (await rows(page, "weights")).some((w) => w.entry_date === today && Number(w.weight) === 229.4)).toBe(true);
      await go(page, "/roadmap");
      await expect.poll(() => target(ch, "Weight milestone").innerText()).not.toBe(weightBefore);

      // Unticking a habit done today moves the chapter's completion.
      await go(page, "/");
      const habitsCard = main(page).locator(".card").filter({ has: page.getByRole("heading", { name: "Today", exact: true }) }).first();
      const doneBtn = habitsCard.locator("li > button[aria-pressed=true]").first();
      if (await doneBtn.count()) {
        await press(doneBtn);
        await go(page, "/roadmap");
        await expect.poll(() => target(ch, "Habit focus").innerText()).not.toBe(habitBefore);
      }
      await finish(page, errors);
    });
  });
}

// Control-by-control audit of the Business area (the Business page, a business
// workspace, the transaction / payment / deal / offer / customer / metric forms and
// the Log → Business tab) on a phone and on a desktop. Every control is checked to be
// on screen and not hidden behind the bottom bar, to accept a value, to save, to
// survive a reload, and to update every place that shows the data right away.
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
  // Sheets slide in; with reduced motion they appear at once, so each press doesn't wait out the animation.
  await o.page.emulateMedia({ reducedMotion: "reduce" });
  return o;
}

/** The app's "today" (the demo clock in demo mode). */
async function appToday(page: Page): Promise<string> {
  const p = (await stored(page)).profile as { demo_mode?: boolean; demo_today?: string } | null;
  if (p?.demo_mode && p.demo_today) return p.demo_today;
  return page.evaluate(() => new Date().toLocaleDateString("en-CA"));
}
const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fmtMonth = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const parseUsd = (s: string) => Number(s.replace(/[^0-9.-]/g, ""));

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
  const check = !seen(loc);
  await expect(async () => {
    if (await celebration(page).isVisible()) await settle(page);
    if (check) await checkUncovered(loc);
    // Long enough to outlast a toast (3.2 s) that can sit over a sheet's bottom button; see the report.
    if (TOUCH.get(page)) await loc.tap({ timeout: 5000 });
    else await loc.click({ timeout: 5000 });
  }).toPass({ timeout: 20_000 });
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
const card = (page: Page, title: string | RegExp) =>
  page.locator(".card").filter({ has: page.getByRole("heading", { name: title, exact: typeof title === "string" }) });
const item = (scope: Locator, text: string | RegExp) => scope.getByRole("listitem").filter({ hasText: text });
/** The value under a Stat label. */
const stat = (scope: Locator, label: string) =>
  scope.locator(".eyebrow").filter({ hasText: new RegExp(`^${label.replace(/[()]/g, "\\$&")}$`) }).locator("xpath=following-sibling::div[1]");

/** In-app navigation, then wait for the page to render (pages load lazily). */
async function nav(page: Page, route: string, ready: Locator) {
  await page.goto(`/#${route}`);
  await expect(ready).toBeVisible();
}

/** Opens a sheet and checks each way of closing it (X, Escape, the dimmed backdrop), then opens it for use. */
async function openSheet(page: Page, opener: Locator, name: string, closing: "all" | "x" | "none" = "x") {
  const sheet = dialog(page, name);
  if (closing !== "none") {
    await press(opener);
    await expect(sheet).toBeVisible();
    await press(sheet.getByRole("button", { name: "Close" }));
    await expect(sheet).toBeHidden();
  }
  if (closing === "all") {
    await press(opener);
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await press(opener);
    await sheet.click({ position: { x: 8, y: 8 } });
    await expect(sheet).toBeHidden();
  }
  await press(opener);
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Delete with the confirm: Cancel keeps it, the confirm button removes it. */
async function confirmDelete(page: Page, trigger: Locator, title: string, gone: Locator, confirmLabel = "Delete") {
  await press(trigger);
  const c = dialog(page, title);
  await press(c.getByRole("button", { name: "Cancel" }));
  await expect(c).toBeHidden();
  await expect(gone.first()).toBeVisible();
  await press(trigger);
  await press(c.getByRole("button", { name: confirmLabel, exact: true }));
  await expect(c).toBeHidden();
  await expect(gone).toHaveCount(0);
}

async function finish(page: Page, errors: string[]) {
  await expectNoHorizontalScroll(page);
  expect(errors, "console or page errors").toEqual([]);
  await page.context().close();
}

const field = (scope: Locator, label: string) => scope.getByLabel(label, { exact: true });

/** A fresh, empty person with business tracking turned on and one business added. */
async function freshBusiness(browser: Browser, vp: ViewportName) {
  const o = await open(browser, vp, "skip");
  const { page } = o;
  await nav(page, "/settings", page.getByRole("switch", { name: /Track business performance/ }));
  const sw = page.getByRole("switch", { name: /Track business performance/ });
  await press(sw);
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await poll(async () => (await stored(page)).profile?.business_enabled).toBe(true);
  return o;
}

for (const vp of SIZES) {
  test.describe(`Business audit · ${vp}`, () => {
    test("empty start: add business, every transaction kind, totals on Business and Today, edit, delete, reload", async ({ browser }) => {
      const { page, errors } = await freshBusiness(browser, vp);
      const today = await appToday(page);
      await nav(page, "/business", page.getByText("Add your first business", { exact: true }));
      await expect(card(page, "Audience")).toBeVisible();

      // Add business: closing, validation keeps typing, then save.
      let sheet = await openSheet(page, page.getByRole("button", { name: "Add business" }), "Add business", "all");
      await type(field(sheet, "Description"), "Consulting for trades");
      await press(sheet.getByRole("button", { name: "Add business" }));
      await alertToast(page, "Give the business a name.");
      await expect(field(sheet, "Description")).toHaveValue("Consulting for trades");
      await type(field(sheet, "Name"), "Alpha Co");
      await pick(field(sheet, "Type"), "service");
      await type(sheet.getByLabel(/Monthly target/), "5000.25");
      await press(sheet.getByRole("button", { name: "Add business" }));
      await toast(page, "Business added.");
      await expect(sheet).toBeHidden();
      await poll(async () => (await rows(page, "businesses")).map((b) => [b.name, b.kind, b.description, b.monthly_target]))
        .toEqual([["Alpha Co", "service", "Consulting for trades", 5000.25]]);
      await expect(page.getByRole("heading", { name: "Command centre" })).toBeVisible();
      const byBiz = card(page, "By business");
      await expect(byBiz.getByRole("link", { name: /Alpha Co/ })).toBeVisible();
      await expect(byBiz).toContainText("target $5,000");

      const summary = page.locator(".card").filter({ has: page.locator(".eyebrow", { hasText: /^Paying customers$/ }) });
      await expect(stat(summary, "Revenue earned")).toHaveText("$0");
      const bars = page.locator("section.card").filter({ hasText: "Revenue, cash collected and profit" }).locator("path.recharts-rectangle");
      await expect(bars).toHaveCount(0);

      // Record transaction sheet from the header; closing works.
      const recordBtn = page.getByRole("button", { name: "Record", exact: true });
      sheet = await openSheet(page, recordBtn, "Record transaction", "all");
      const kind = field(sheet, "Type");
      await expect(kind).toHaveValue("sale");
      await expect(field(sheet, "Business")).toHaveValue(/.+/);
      // Validation: no amount → readable message, typed description kept.
      await type(field(sheet, "Description"), "First sale");
      await press(sheet.getByRole("button", { name: "Record", exact: true }));
      await alertToast(page, "Enter an amount greater than zero.");
      await expect(field(sheet, "Description")).toHaveValue("First sale");
      // Future date is refused.
      await type(field(sheet, "Revenue earned"), "1000.40");
      await expect(field(sheet, "Cash collected now")).toHaveValue("1000.40");
      await type(field(sheet, "Date earned"), addDays(today, 3));
      await press(sheet.getByRole("button", { name: "Record", exact: true }));
      const native = await field(sheet, "Date earned").evaluate((el: HTMLInputElement) => el.validationMessage);
      if (!native) await alertToast(page, /on or before today/);
      await expect(sheet).toBeVisible();
      await type(field(sheet, "Date earned"), today);
      // Cash can't exceed revenue: message, values kept.
      await type(field(sheet, "Cash collected now"), "2000");
      await press(sheet.getByRole("button", { name: "Record", exact: true }));
      await alertToast(page, "Cash collected can't exceed the sale amount ($1,000.40).");
      await expect(field(sheet, "Revenue earned")).toHaveValue("1000.40");
      await type(field(sheet, "Cash collected now"), "400.25");
      await type(field(sheet, "Received on"), today);
      await expect(field(sheet, "Customer")).toHaveValue("");
      await type(field(sheet, "New customer"), "Cust One");
      const rec = sheet.getByRole("switch", { name: /Recurring revenue/ });
      await press(rec);
      await expect(rec).toHaveAttribute("aria-checked", "true");
      await type(field(sheet, "Lead source"), "Referral");
      await type(field(sheet, "Notes"), "Paid deposit");
      await press(sheet.getByRole("button", { name: "Record", exact: true }));
      await toast(page, "Sale recorded, $400.25 collected.");
      await expect(sheet).toBeHidden();
      await poll(async () => (await rows(page, "transactions")).length).toBe(1);
      const [sale] = await rows(page, "transactions");
      expect(sale).toMatchObject({ kind: "sale", amount: 1000.4, txn_date: today, recurring: true, lead_source: "Referral", description: "First sale", notes: "Paid deposit" });
      const custs = await rows(page, "customers");
      expect(custs.map((c) => c.name)).toEqual(["Cust One"]);
      expect(sale.customer_id).toBe(custs[0].id);
      await poll(async () => (await rows(page, "payments")).map((p) => [p.amount, p.paid_on, p.transaction_id])).toEqual([[400.25, today, sale.id]]);
      await expect(stat(summary, "Revenue earned")).toHaveText("$1,000");
      await expect(stat(summary, "Recurring (MRR)")).toHaveText("$1,000");
      await expect(stat(summary, "Paying customers")).toHaveText("1");
      await expect(bars.first()).toBeAttached();

      // Second sale: pick the existing customer, nothing collected.
      sheet = await openSheet(page, recordBtn, "Record transaction", "none");
      await type(field(sheet, "Revenue earned"), "100");
      await type(field(sheet, "Cash collected now"), "0");
      await pick(field(sheet, "Customer"), { label: "Cust One" });
      await expect(field(sheet, "New customer")).toHaveCount(0);
      await type(field(sheet, "Description"), "Invoice two");
      await press(sheet.getByRole("button", { name: "Record", exact: true }));
      await toast(page, "Sale recorded (no cash collected yet).");
      await poll(async () => (await rows(page, "transactions")).find((t) => t.description === "Invoice two")?.customer_id).toBe(custs[0].id);
      expect((await rows(page, "payments")).length).toBe(1);

      // A duplicate is caught: cancel keeps it unsaved.
      sheet = await openSheet(page, recordBtn, "Record transaction", "none");
      await type(field(sheet, "Revenue earned"), "100");
      await press(sheet.getByRole("button", { name: "Record", exact: true }));
      const dup = dialog(page, "Possible duplicate");
      await expect(dup).toContainText("Sale of $100.00 on this date is already recorded.");
      await press(dup.getByRole("button", { name: "Cancel" }));
      await expect(dup).toBeHidden();
      await expect(sheet).toBeVisible();
      expect((await rows(page, "transactions")).length).toBe(2);

      // Expense with a category.
      await pick(kind, "expense");
      await expect(field(sheet, "Amount")).toBeVisible();
      await type(field(sheet, "Amount"), "250.75");
      await pick(field(sheet, "Category"), "advertising");
      await type(field(sheet, "Description"), "Ads");
      await press(sheet.getByRole("button", { name: "Record", exact: true }));
      await toast(page, "Recorded.");
      await poll(async () => (await rows(page, "transactions")).find((t) => t.kind === "expense")).toMatchObject({ amount: 250.75, expense_category: "advertising" });
      await expect(stat(summary, "Expenses")).toHaveText("$251");
      await expect(card(page, "Expenses by category")).toContainText("Advertising");

      // Refund linked to a customer.
      sheet = await openSheet(page, recordBtn, "Record transaction", "none");
      await pick(kind, "refund");
      await type(field(sheet, "Amount"), "50");
      await pick(field(sheet, "Customer"), { label: "Cust One" });
      await press(sheet.getByRole("button", { name: "Record", exact: true }));
      await toast(page, "Recorded.");
      await poll(async () => (await rows(page, "transactions")).find((t) => t.kind === "refund")).toMatchObject({ amount: 50, customer_id: custs[0].id });

      // Gig income, personal income and a transfer are kept apart from the business.
      for (const [k, amt, note] of [["gig_income", "300", "Gig income"], ["personal_income", "200", "Personal income"], ["transfer", "999", "Transfers"]] as const) {
        sheet = await openSheet(page, recordBtn, "Record transaction", "none");
        await pick(kind, k);
        await expect(sheet.getByText(k === "transfer" ? /Transfers between your own accounts/ : /Recorded separately from business revenue/)).toBeVisible();
        await expect(field(sheet, "Business")).toHaveCount(0);
        await type(field(sheet, "Amount"), amt);
        await press(sheet.getByRole("button", { name: "Record", exact: true }));
        await toast(page, "Recorded.");
        await poll(async () => (await rows(page, "transactions")).find((t) => t.kind === k)).toMatchObject({ amount: Number(amt), business_id: null });
        void note;
      }
      const separate = page.getByText(/Gig income \$300 · personal income \$200 · transfers between your accounts \$999/);
      await expect(separate).toBeVisible();

      // Totals: revenue 1000.40 + 100 − 50; profit − 250.75; cash 400.25 (A/R 700.15).
      await expect(stat(summary, "Revenue earned")).toHaveText("$1,050");
      await expect(stat(summary, "Net profit")).toHaveText("$800");
      const view = page.getByRole("radio", { name: "Received this month" });
      await press(view);
      await expect(view).toHaveAttribute("aria-checked", "true");
      await expect(stat(summary, "Cash collected")).toHaveText("$400");
      await expect(stat(summary, "Outstanding (A/R)")).toHaveText("$700");
      await press(page.getByRole("radio", { name: "Earned this month" }));
      await expect(stat(summary, "Revenue earned")).toBeVisible();
      await expect(byBiz.getByRole("link", { name: /Alpha Co/ })).toContainText("$1,050");
      const ar = card(page, "Accounts receivable");
      await expect(ar).toContainText("Revenue earned but not yet collected: $700");
      const txList = card(page, `Transactions · ${fmtMonth(today)}`);
      await expect(txList.getByRole("listitem")).toHaveCount(7);

      // Edit the first sale: new amount and a new payment.
      const firstRow = item(txList, "Sale · First sale");
      sheet = await openSheet(page, firstRow.getByRole("button", { name: "Edit" }), "Edit transaction", "x");
      await expect(field(sheet, "Revenue earned")).toHaveValue("1000.4");
      await expect(sheet.getByText(/Already collected:/)).toContainText("$400.25");
      await type(field(sheet, "Revenue earned"), "1200.40");
      await type(field(sheet, "Record a new payment"), "100");
      await press(sheet.getByRole("button", { name: "Save changes" }));
      await toast(page, "Transaction updated.");
      await expect(sheet).toBeHidden();
      await poll(async () => (await rows(page, "transactions")).find((t) => t.id === sale.id)?.amount).toBe(1200.4);
      await poll(async () => (await rows(page, "payments")).filter((p) => p.transaction_id === sale.id).length).toBe(2);
      await expect(stat(summary, "Revenue earned")).toHaveText("$1,250");
      await expect(ar).toContainText("Revenue earned but not yet collected: $800");

      // Record a payment from receivables: too much is refused, then a part payment.
      const recv = item(ar, "Cust One · $700 due");
      await press(recv.getByRole("button", { name: "Record payment" }));
      sheet = dialog(page, "Record payment");
      await expect(field(sheet, "Amount received")).toHaveValue("700.15");
      await type(field(sheet, "Amount received"), "900");
      await press(sheet.getByRole("button", { name: "Record payment" }));
      await alertToast(page, "Only $700.15 is outstanding on this sale.");
      await expect(field(sheet, "Amount received")).toHaveValue("900");
      await type(field(sheet, "Amount received"), "200.15");
      await type(field(sheet, "Date received"), today);
      await press(sheet.getByRole("button", { name: "Record payment" }));
      await toast(page, "$200.15 collected.");
      await expect(sheet).toBeHidden();
      await expect(item(ar, "Cust One · $500 due")).toBeVisible();
      await expect(ar).toContainText("Revenue earned but not yet collected: $600");
      await poll(async () => (await rows(page, "payments")).length).toBe(3);

      // Delete the expense; profit recalculates.
      await confirmDelete(page, item(txList, "Business expense · Ads").getByRole("button", { name: "Delete" }), "Delete this transaction?", item(txList, "Business expense · Ads"));
      await toast(page, "Deleted.");
      await poll(async () => (await rows(page, "transactions")).some((t) => t.kind === "expense")).toBe(false);
      await expect(stat(summary, "Expenses")).toHaveText("$0");
      await expect(stat(summary, "Net profit")).toHaveText("$1,250");

      // The Today card shows the same numbers straight away (cash net of the refund).
      await nav(page, "/", page.getByRole("heading", { name: "Business", exact: true }));
      const todayCard = card(page, "Business");
      await expect(todayCard.locator(".display-num")).toHaveText("$1,250");
      await expect(stat(todayCard, "Revenue")).toHaveText("$1,250");
      await expect(stat(todayCard, "Cash in")).toHaveText("$650");
      await expect(stat(todayCard, "Net profit")).toHaveText("$1,250");
      await press(todayCard.getByRole("link", { name: "Open Business" }));
      await expect(page.getByRole("heading", { name: "Command centre" })).toBeVisible();

      // Everything survives a reload.
      await page.reload();
      await expect(stat(summary, "Revenue earned")).toHaveText("$1,250");
      await expect(separate).toBeVisible();

      // Switching the goal to cash collected moves the headline, the per-business bar and the Today card together.
      const alpha = byBiz.getByRole("link", { name: /Alpha Co/ });
      await expect(alpha.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
      sheet = await openSheet(page, page.getByRole("button", { name: "Goal settings" }), "Business goal", "none");
      await press(sheet.getByRole("radio", { name: "Cash collected" }));
      await press(sheet.getByRole("button", { name: "Save goal" }));
      await toast(page, "Goal saved.");
      await expect(page.locator(".display-num").first()).toHaveText("$650");
      await expect(alpha).toContainText("$650");
      await expect(alpha.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "13");
      await nav(page, "/", page.getByRole("heading", { name: "Business", exact: true }));
      await expect(todayCard.locator(".display-num")).toHaveText("$650");
      await expect(todayCard).toContainText("cash collected");
      await finish(page, errors);
    });

    test("Business page: CSV exports, month, goal settings, chart granularity, forecast, receivables, add business", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "demo");
      const today = await appToday(page);
      await nav(page, "/business", page.getByRole("heading", { name: "Command centre" }));
      const header = page.locator("header, .flex").filter({ has: page.getByRole("heading", { name: "Command centre" }) }).first();
      void header;

      // CSV exports are real downloads in device mode.
      const downloads: Download[] = [];
      page.on("download", (d) => downloads.push(d));
      await press(page.getByRole("button", { name: "Transactions CSV" }));
      await poll(() => downloads.length).toBe(2);
      expect(downloads.map((d) => d.suggestedFilename())).toEqual([`becoming-os-transactions-${today}.csv`, `becoming-os-payments-${today}.csv`]);
      const txCsv = readFileSync(await downloads[0].path()).toString();
      expect(txCsv.split(/\r?\n/)[0]).toContain("date,type,business,amount,cash_collected,outstanding");
      expect(txCsv.split(/\r?\n/).filter(Boolean).length).toBe((await rows(page, "transactions")).length + 1);
      await press(page.getByRole("button", { name: "Summary CSV" }));
      await poll(() => downloads.length).toBe(3);
      expect(downloads[2].suggestedFilename()).toBe(`becoming-os-monthly-summary-${today}.csv`);
      expect(readFileSync(await downloads[2].path()).toString()).toContain("month,gross_sales,refunds,revenue_earned,cash_collected");

      // Month selector changes every month-scoped view.
      const month = page.getByRole("combobox", { name: "Month" });
      await expect(month).toHaveValue(`${today.slice(0, 7)}-01`);
      await expect(page.getByRole("heading", { name: `Transactions · ${fmtMonth(today)}` })).toBeVisible();
      const prev = `${today.slice(0, 4)}-${String(Number(today.slice(5, 7)) - 1).padStart(2, "0")}-01`;
      await pick(month, prev);
      await expect(page.getByRole("heading", { name: `Transactions · ${fmtMonth(prev)}` })).toBeVisible();
      await expect(page.getByText(`${fmtMonth(prev)} · Revenue`)).toBeVisible();
      const prevTx = (await rows(page, "transactions")).filter((t) => String(t.txn_date).startsWith(prev.slice(0, 7))).length;
      const txCard = card(page, `Transactions · ${fmtMonth(prev)}`);
      if (prevTx > 25) {
        await expect(txCard.getByRole("listitem")).toHaveCount(26);
        await press(txCard.getByRole("button", { name: `Show all ${prevTx}` }));
      }
      await expect(txCard.getByRole("listitem")).toHaveCount(prevTx);
      await pick(month, `${today.slice(0, 7)}-01`);

      // Earned / received view.
      const summary = page.locator(".card").filter({ has: page.locator(".eyebrow", { hasText: /^Paying customers$/ }) });
      await press(page.getByRole("radio", { name: "Received this month" }));
      await expect(stat(summary, "Cash profit")).toBeVisible();
      await press(page.getByRole("radio", { name: "Earned this month" }));
      await expect(stat(summary, "Recurring (MRR)")).toBeVisible();

      // Chart granularity.
      const chart = page.locator("section.card").filter({ hasText: "Revenue, cash collected and profit" });
      const ticks = chart.locator(".recharts-xAxis .recharts-cartesian-axis-tick-value");
      for (const g of ["Day", "Week", "Month"] as const) {
        const r = chart.getByRole("radio", { name: g });
        await press(r);
        await expect(r).toHaveAttribute("aria-checked", "true");
        if (g === "Month") await expect(ticks.first()).toHaveText(/’\d\d$/);
        else await expect(ticks.first()).toHaveText(/^[A-Z][a-z]{2} \d{1,2}$/);
      }

      // Goal settings: validation keeps the value, then a new goal saves everywhere.
      let sheet = await openSheet(page, page.getByRole("button", { name: "Goal settings" }), "Business goal", "all");
      await press(sheet.getByRole("radio", { name: "Cash collected" }));
      await type(field(sheet, "Monthly goal"), "0");
      await press(sheet.getByRole("button", { name: "Save goal" }));
      await alertToast(page, "The goal must be more than $0.");
      await expect(field(sheet, "Monthly goal")).toHaveValue("0");
      await type(field(sheet, "Monthly goal"), "12000.25");
      await type(field(sheet, "Baseline monthly revenue"), "1500.5");
      await type(field(sheet, "Baseline monthly expenses"), "300.75");
      await expect(field(sheet, "Deadline")).toBeDisabled();
      await press(sheet.getByRole("button", { name: "Save goal" }));
      await toast(page, "Goal saved.");
      await expect(sheet).toBeHidden();
      await poll(async () => (await stored(page)).singles.businessSettings).toMatchObject({ goal_metric: "cash", goal_amount: 12000.25, baseline_revenue: 1500.5, baseline_expenses: 300.75 });
      await expect(page.getByText(/Goal: \$12,000\/month in cash collected by/)).toBeVisible();
      await expect(page.getByText(`${fmtMonth(today)} · Cash collected`)).toBeVisible();

      // Forecast assumptions accept decimals, save, reset and refuse bad values.
      const fc = page.locator("section.card").filter({ hasText: "Forecast (estimate)" });
      const sentence = fc.getByText(/On these assumptions/);
      const before = await sentence.textContent();
      await press(fc.getByRole("button", { name: "Edit assumptions" }));
      const inputs: [string, string][] = [["New recurring customers / month", "2.5"], ["Avg recurring price", "199.99"], ["Monthly churn", "3.5"],
        ["One-time sales / month", "1.5"], ["Avg one-time sale", "450.5"], ["Monthly expenses", "800.25"]];
      for (const [l, v] of inputs) await type(field(fc, l), v);
      await expect(fc.getByText("Not saved yet")).toBeVisible();
      await expect(sentence).not.toHaveText(before ?? "");
      await press(fc.getByRole("button", { name: "Save assumptions" }));
      await toast(page, "Assumptions saved.");
      await expect(fc.getByText("Not saved yet")).toBeHidden();
      await poll(async () => (await stored(page)).singles.businessSettings?.forecast).toEqual({
        newRecurringPerMonth: 2.5, recurringPrice: 199.99, churnPct: 3.5, oneTimeSalesPerMonth: 1.5, oneTimeAvg: 450.5, monthlyExpenses: 800.25,
      });
      await type(field(fc, "Monthly churn"), "150");
      await press(fc.getByRole("button", { name: "Save assumptions" }));
      await alertToast(page, "Monthly churn can't be more than 100%.");
      await expect(field(fc, "Monthly churn")).toHaveValue("150");
      await type(field(fc, "Monthly churn"), "-2");
      await press(fc.getByRole("button", { name: "Save assumptions" }));
      await alertToast(page, "Forecast numbers can't be negative.");
      await press(fc.getByRole("button", { name: "Reset to data" }));
      await expect(field(fc, "Monthly churn")).not.toHaveValue("-2");
      await expect(fc.getByText("Not saved yet")).toBeVisible();
      await press(fc.getByRole("button", { name: "Save assumptions" }));
      await toast(page, "Assumptions saved.");
      await poll(async () => (await stored(page)).singles.businessSettings?.forecast).toEqual({});
      await press(fc.getByRole("button", { name: "Hide assumptions" }));
      await expect(field(fc, "Monthly churn")).toHaveCount(0);

      // Receivables: record a full payment; the item leaves the list and A/R drops.
      const ar = card(page, "Accounts receivable");
      const arTotal = async () => parseUsd((await ar.getByText(/not yet collected/).textContent()) ?? "");
      const total0 = await arTotal();
      const first = ar.getByRole("listitem").first();
      const label = (await first.locator(".truncate").first().textContent()) ?? "";
      const due = parseUsd(label.split("·").pop() ?? "");
      await press(first.getByRole("button", { name: "Record payment" }));
      sheet = dialog(page, "Record payment");
      await type(field(sheet, "Date received"), "2020-01-01");
      await press(sheet.getByRole("button", { name: "Record payment" }));
      await alertToast(page, "Payment can't be before the sale date.");
      await type(field(sheet, "Date received"), today);
      const payments0 = (await rows(page, "payments")).length;
      await press(sheet.getByRole("button", { name: "Record payment" }));
      await expect(sheet).toBeHidden();
      await poll(async () => (await rows(page, "payments")).length).toBe(payments0 + 1);
      await expect.poll(arTotal).toBeLessThanOrEqual(total0 - due + 1);
      await expect(ar.getByRole("listitem").filter({ hasText: label })).toHaveCount(0);

      // Add another business from "By business", then open it.
      const byBiz = card(page, "By business");
      sheet = await openSheet(page, byBiz.getByRole("button", { name: "Add business" }), "Add business", "x");
      await type(field(sheet, "Name"), "Third Biz");
      await type(field(sheet, "Description"), "A new line of work");
      await press(sheet.getByRole("button", { name: "Add business" }));
      await toast(page, "Business added.");
      await expect(byBiz.getByRole("link", { name: /Third Biz/ })).toBeVisible();
      await poll(async () => (await rows(page, "businesses")).map((b) => b.name)).toContain("Third Biz");
      await press(byBiz.getByRole("link", { name: /Third Biz/ }));
      await expect(page.getByRole("heading", { name: "Third Biz" })).toBeVisible();
      await expect(page.getByText("A new line of work")).toBeVisible();
      await press(page.getByRole("main").getByRole("link", { name: "Business", exact: true }));
      await expect(page.getByRole("heading", { name: "Command centre" })).toBeVisible();

      // Reload keeps the goal.
      await page.reload();
      await expect(page.getByText(/Goal: \$12,000\/month in cash collected by/)).toBeVisible();
      await finish(page, errors);
    });

    test("workspace: edit, archive, record, activity steppers and metrics", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "demo");
      const today = await appToday(page);
      const biz = (await rows(page, "businesses")).find((b) => b.name === "Lost Revenue Group")!;
      await nav(page, `/business/${biz.id}`, page.getByRole("heading", { name: "Lost Revenue Group" }));

      // Edit the business.
      let sheet = await openSheet(page, page.getByRole("button", { name: "Edit business", exact: true }), "Edit business", "all");
      await expect(field(sheet, "Name")).toHaveValue("Lost Revenue Group");
      await type(field(sheet, "Name"), "");
      await press(sheet.getByRole("button", { name: "Save" }));
      await alertToast(page, "Give the business a name.");
      await type(field(sheet, "Name"), "LRG Renamed");
      await pick(field(sheet, "Type"), "education");
      await type(sheet.getByLabel(/Monthly target/), "7500.5");
      await press(sheet.getByRole("button", { name: "Save" }));
      await toast(page, "Business updated.");
      await expect(page.getByRole("heading", { name: "LRG Renamed" })).toBeVisible();
      await expect(page.getByText(/target \$7,501|target \$7,500/).first()).toBeVisible();
      await poll(async () => (await rows(page, "businesses")).find((b) => b.id === biz.id)).toMatchObject({ name: "LRG Renamed", kind: "education", monthly_target: 7500.5 });

      // Archive and restore.
      await press(page.getByRole("button", { name: "Archive", exact: true }));
      await toast(page, "Archived. Its records still count in your totals.");
      await expect(page.getByText("Workspace · archived")).toBeVisible();
      await poll(async () => (await rows(page, "businesses")).find((b) => b.id === biz.id)?.active).toBe(false);
      await press(page.getByRole("button", { name: "Restore", exact: true }));
      await toast(page, "Restored.");
      await poll(async () => (await rows(page, "businesses")).find((b) => b.id === biz.id)?.active).toBe(true);

      // Record from the workspace: the sale belongs to it and the stats update.
      const revStat = stat(page.locator(".card").first(), `Revenue · ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(today.slice(5, 7)) - 1]} ${today.slice(2, 4)}`);
      const rev0 = parseUsd((await revStat.textContent()) ?? "");
      sheet = await openSheet(page, page.getByRole("button", { name: "Record", exact: true }), "Record transaction", "x");
      await expect(field(sheet, "Business")).toHaveValue(biz.id as string);
      await type(field(sheet, "Revenue earned"), "321");
      await type(field(sheet, "Description"), "Workspace sale");
      await press(sheet.getByRole("button", { name: "Record", exact: true }));
      await toast(page, /Sale recorded/);
      await expect(sheet).toBeHidden();
      await poll(async () => (await rows(page, "transactions")).find((t) => t.description === "Workspace sale")?.business_id).toBe(biz.id);
      await expect.poll(async () => parseUsd((await revStat.textContent()) ?? "")).toBe(rev0 + 321);
      const wsTx = card(page, "Transactions");
      await expect(item(wsTx, "Sale · Workspace sale")).toBeVisible();

      // Activity stepper: +, −, typed count; the weekly meter follows.
      const act = card(page, "Today's activity");
      const row = act.getByRole("listitem").filter({ hasText: "LinkedIn connections" });
      const count = row.getByRole("textbox", { name: "Count" });
      const metric = (await rows(page, "metrics")).find((m) => m.label === "LinkedIn connections")!;
      const logged = async () => (await rows(page, "activityLogs")).find((a) => a.metric_id === metric.id && a.log_date === today)?.count ?? 0;
      const start = Number(await count.inputValue());
      const meters = card(page, "This week vs targets");
      const meterBtn = meters.getByRole("button", { name: /LinkedIn connections/ });
      const weekText = async () => Number(((await meterBtn.textContent()) ?? "").match(/(\d+) \//)?.[1]);
      const week0 = await weekText();
      await press(row.getByRole("button", { name: "Increase" }));
      await expect(count).toHaveValue(String(start + 1));
      await poll(logged).toBe(start + 1);
      await expect.poll(weekText).toBe(week0 + 1);
      await press(row.getByRole("button", { name: "Decrease" }));
      await expect(count).toHaveValue(String(start));
      await poll(logged).toBe(start);
      await type(count, "12");
      await poll(logged).toBe(12);
      await expect.poll(weekText).toBe(week0 - start + 12);
      await type(count, "0");
      await poll(logged).toBe(0);
      await expect.poll(weekText).toBe(week0 - start);

      // Metrics: add (validation), edit, archive, show archived, restore, delete.
      sheet = await openSheet(page, meters.getByRole("button", { name: "Metric", exact: true }), "New activity metric", "all");
      await type(field(sheet, "Daily target"), "3");
      await press(sheet.getByRole("button", { name: "Save" }));
      await alertToast(page, "Name the metric.");
      await expect(field(sheet, "Daily target")).toHaveValue("3");
      await type(field(sheet, "Name"), "Podcast pitches");
      for (const t of ["Outreach", "Sales", "Audience", "Content"]) {
        await press(sheet.getByRole("radio", { name: t }));
        await expect(sheet.getByRole("radio", { name: t })).toHaveAttribute("aria-checked", "true");
      }
      await type(field(sheet, "Weekly target"), "15");
      await press(sheet.getByRole("button", { name: "Save" }));
      await toast(page, "Saved.");
      await poll(async () => (await rows(page, "metrics")).find((m) => m.label === "Podcast pitches")).toMatchObject({ kind: "content", daily_target: 3, weekly_target: 15, business_id: biz.id, active: true });
      const pp = meters.getByRole("button", { name: /Podcast pitches/ });
      await expect(pp).toContainText("0 / 15");
      const ppRow = act.getByRole("listitem").filter({ hasText: "Podcast pitches" });
      await expect(ppRow).toContainText("Target 3/day");
      await press(ppRow.getByRole("button", { name: "Increase" }));
      await expect(pp).toContainText("1 / 15");

      sheet = await openSheet(page, pp, "Edit metric", "x");
      await expect(field(sheet, "Name")).toHaveValue("Podcast pitches");
      await type(field(sheet, "Weekly target"), "20");
      await press(sheet.getByRole("button", { name: "Save" }));
      await expect(pp).toContainText("1 / 20");
      await poll(async () => (await rows(page, "metrics")).find((m) => m.label === "Podcast pitches")?.weekly_target).toBe(20);

      sheet = await openSheet(page, pp, "Edit metric", "none");
      await press(sheet.getByRole("button", { name: "Archive" }));
      await toast(page, "Archived.");
      await expect(pp).toHaveCount(0);
      await expect(ppRow).toHaveCount(0);
      const showArch = meters.getByRole("button", { name: "Show 1 archived metric" });
      await press(showArch);
      const archived = meters.getByRole("button", { name: "Podcast pitches (archived)" });
      await press(archived);
      sheet = dialog(page, "Edit metric");
      await press(sheet.getByRole("button", { name: "Restore" }));
      await toast(page, "Restored.");
      await expect(pp).toBeVisible();
      await expect(meters.getByRole("button", { name: /archived metric/ })).toHaveCount(0);

      sheet = await openSheet(page, pp, "Edit metric", "none");
      await press(sheet.getByRole("button", { name: "Delete" }));
      const c = dialog(page, "Delete metric?");
      await press(c.getByRole("button", { name: "Cancel" }));
      await expect(sheet).toBeVisible();
      await press(sheet.getByRole("button", { name: "Delete" }));
      await press(c.getByRole("button", { name: "Delete", exact: true }));
      await toast(page, "Deleted.");
      await expect(pp).toHaveCount(0);
      await poll(async () => (await rows(page, "metrics")).some((m) => m.label === "Podcast pitches")).toBe(false);

      await page.reload();
      await expect(page.getByRole("heading", { name: "LRG Renamed" })).toBeVisible();
      await expect(item(card(page, "Transactions"), "Sale · Workspace sale")).toBeVisible();
      await finish(page, errors);
    });

    test("workspace: pipeline deals, offers, customers, transactions and deleting the workspace", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "demo");
      const today = await appToday(page);
      const biz = (await rows(page, "businesses")).find((b) => b.name === "Exchange Mastery")!;
      await nav(page, `/business/${biz.id}`, page.getByRole("heading", { name: "Exchange Mastery" }));

      // Offers.
      const offers = card(page, "Offers");
      let sheet = await openSheet(page, offers.getByRole("button", { name: "Offer", exact: true }), "New offer", "all");
      await type(field(sheet, "Price"), "49.99");
      await press(sheet.getByRole("button", { name: "Save offer" }));
      await alertToast(page, "Name the offer.");
      await expect(field(sheet, "Price")).toHaveValue("49.99");
      await type(field(sheet, "Name"), "Audit Club");
      await pick(field(sheet, "Billing"), "monthly");
      await type(field(sheet, "Term (months)"), "12");
      await pick(field(sheet, "Status"), "1");
      await press(sheet.getByRole("button", { name: "Save offer" }));
      await toast(page, "Offer saved.");
      const offerRow = item(offers, "Audit Club");
      await expect(offerRow).toContainText("$50/mo");
      await expect(offerRow).toContainText("monthly · 12 months");
      await poll(async () => (await rows(page, "offers")).find((o) => o.name === "Audit Club")).toMatchObject({ price: 49.99, billing: "monthly", term_months: 12, active: true, business_id: biz.id });
      sheet = await openSheet(page, offerRow.getByRole("button", { name: "Edit" }), "Edit offer", "x");
      await expect(field(sheet, "Price")).toHaveValue("49.99");
      await type(field(sheet, "Price"), "59");
      await pick(field(sheet, "Billing"), "installment");
      await press(sheet.getByRole("button", { name: "Save offer" }));
      await expect(offerRow).toContainText("$59");
      await expect(offerRow).toContainText("installments");
      await poll(async () => (await rows(page, "offers")).find((o) => o.name === "Audit Club")?.price).toBe(59);
      // The Business page's "sales needed" chips use offers; the record form lists active offers.
      sheet = await openSheet(page, page.getByRole("button", { name: "Record", exact: true }), "Record transaction", "none");
      await pick(field(sheet, "Offer"), { label: "Audit Club · $59" });
      await expect(field(sheet, "Revenue earned")).toHaveValue("59");
      await expect(sheet.getByRole("switch", { name: /Recurring revenue/ })).toHaveAttribute("aria-checked", "false");
      await press(sheet.getByRole("button", { name: "Close" }));
      // Archiving an offer keeps it listed but takes it out of the record form.
      sheet = await openSheet(page, offerRow.getByRole("button", { name: "Edit" }), "Edit offer", "none");
      await pick(field(sheet, "Status"), "0");
      await press(sheet.getByRole("button", { name: "Save offer" }));
      await expect(offerRow).toContainText("Audit Club (archived)");
      await poll(async () => (await rows(page, "offers")).find((o) => o.name === "Audit Club")?.active).toBe(false);
      sheet = await openSheet(page, page.getByRole("button", { name: "Record", exact: true }), "Record transaction", "none");
      await expect(field(sheet, "Offer").locator("option", { hasText: "Audit Club" })).toHaveCount(0);
      await press(sheet.getByRole("button", { name: "Close" }));

      // Customers: add (validation, churn dates), edit, delete.
      const customers = card(page, "Customers");
      sheet = await openSheet(page, customers.getByRole("button", { name: "Customer", exact: true }), "New customer", "all");
      await type(field(sheet, "Source"), "Webinar");
      await press(sheet.getByRole("button", { name: "Save customer" }));
      await alertToast(page, "Enter a name.");
      await expect(field(sheet, "Source")).toHaveValue("Webinar");
      await type(field(sheet, "Name"), "Zed Trader");
      await type(field(sheet, "Customer since"), addDays(today, -20));
      await expect(field(sheet, "Churned on")).toHaveCount(0);
      await pick(field(sheet, "Status"), "churned");
      await expect(field(sheet, "Churned on")).toHaveValue(today);
      await type(field(sheet, "Churned on"), addDays(today, -30));
      await type(field(sheet, "Notes"), "Left after a month");
      await press(sheet.getByRole("button", { name: "Save customer" }));
      await alertToast(page, "Churn date can't be before the start date.");
      await type(field(sheet, "Churned on"), addDays(today, -2));
      await press(sheet.getByRole("button", { name: "Save customer" }));
      await toast(page, "Customer saved.");
      await poll(async () => (await rows(page, "customers")).find((c) => c.name === "Zed Trader")).toMatchObject({
        status: "churned", started_on: addDays(today, -20), churned_on: addDays(today, -2), source: "Webinar", notes: "Left after a month", business_id: biz.id,
      });
      const showAll = customers.getByRole("button", { name: /^Show all \d+$/ });
      if (await showAll.isVisible()) await press(showAll);
      const custRow = item(customers, "Zed Trader");
      await expect(custRow).toContainText("churned");
      sheet = await openSheet(page, custRow.getByRole("button", { name: "Edit" }), "Edit customer", "x");
      await pick(field(sheet, "Status"), "paused");
      await expect(field(sheet, "Churned on")).toHaveCount(0);
      await press(sheet.getByRole("button", { name: "Save customer" }));
      await expect(custRow).toContainText("paused");
      await poll(async () => (await rows(page, "customers")).find((c) => c.name === "Zed Trader")).toMatchObject({ status: "paused", churned_on: null });
      await confirmDelete(page, custRow.getByRole("button", { name: "Delete" }), "Delete this customer?", custRow);
      await poll(async () => (await rows(page, "customers")).some((c) => c.name === "Zed Trader")).toBe(false);

      // Pipeline: show/hide closed, add (validation), move stages, edit, delete.
      const pipe = card(page, "Sales pipeline");
      const toggle = pipe.getByRole("button", { name: "Show won/lost" });
      await press(toggle);
      await expect(pipe.locator(".eyebrow", { hasText: /^Won$/ })).toBeVisible();
      await press(pipe.getByRole("button", { name: "Hide closed" }));
      await expect(pipe.locator(".eyebrow", { hasText: /^Won$/ })).toHaveCount(0);
      sheet = await openSheet(page, pipe.getByRole("button", { name: "Deal", exact: true }), "New deal", "all");
      await expect(field(sheet, "Business")).toHaveValue(biz.id as string);
      await type(field(sheet, "Contact"), "jo@example.com");
      await press(sheet.getByRole("button", { name: "Add to pipeline" }));
      await alertToast(page, "Give the deal a name (company or person).");
      await expect(field(sheet, "Contact")).toHaveValue("jo@example.com");
      await type(field(sheet, "Company / person"), "Jo Fund");
      await pick(field(sheet, "Stage"), "contacted");
      await type(field(sheet, "Potential value"), "1500.5");
      await type(field(sheet, "Lead source"), "YouTube");
      await pick(field(sheet, "Offer"), { label: "Audit Club" });
      await type(field(sheet, "Notes"), "Warm lead");
      await press(sheet.getByRole("button", { name: "Add to pipeline" }));
      await toast(page, "Pipeline updated.");
      const deal = () => rows(page, "deals").then((d) => d.find((x) => x.name === "Jo Fund"));
      await poll(deal).toMatchObject({ stage: "contacted", value: 1500.5, contact: "jo@example.com", source: "YouTube", notes: "Warm lead", created_on: today, closed_on: null, business_id: biz.id });
      const column = (label: string) => pipe.locator("div.w-\\[220px\\]").filter({ has: page.locator(".eyebrow", { hasText: new RegExp(`^${label}$`) }) });
      await expect(column("Contacted").getByRole("button", { name: /Jo Fund/ })).toBeVisible();
      await expect(column("Contacted")).toContainText("$1,501");
      const mover = pipe.getByRole("combobox", { name: "Move Jo Fund" });
      await pick(mover, "proposal");
      await expect(column("Proposal").getByRole("button", { name: /Jo Fund/ })).toBeVisible();
      await poll(deal).toMatchObject({ stage: "proposal", closed_on: null });
      await pick(mover, "won");
      await toast(page, "Won — record the sale when it's invoiced or paid.");
      await poll(deal).toMatchObject({ stage: "won", closed_on: today });
      await expect(pipe.getByRole("button", { name: /Jo Fund/ })).toHaveCount(0);
      await press(pipe.getByRole("button", { name: "Show won/lost" }));
      const wonCard = column("Won").getByRole("button", { name: /Jo Fund/ });
      await expect(wonCard).toBeVisible();
      sheet = await openSheet(page, wonCard, "Edit deal", "x");
      await expect(field(sheet, "Company / person")).toHaveValue("Jo Fund");
      await pick(field(sheet, "Stage"), "conversation");
      await type(field(sheet, "Potential value"), "2000");
      await press(sheet.getByRole("button", { name: "Save deal" }));
      await toast(page, "Pipeline updated.");
      await poll(deal).toMatchObject({ stage: "conversation", value: 2000, closed_on: null });
      const convCard = column("Sales conversation").getByRole("button", { name: /Jo Fund/ });
      await expect(convCard).toContainText("$2,000");
      sheet = await openSheet(page, convCard, "Edit deal", "none");
      await press(sheet.getByRole("button", { name: "Delete deal" }));
      const dc = dialog(page, "Delete this deal?");
      await press(dc.getByRole("button", { name: "Cancel" }));
      await expect(dc).toBeHidden();
      await press(sheet.getByRole("button", { name: "Delete deal" }));
      await press(dc.getByRole("button", { name: "Delete", exact: true }));
      await toast(page, "Deal deleted.");
      await expect(pipe.getByRole("button", { name: /Jo Fund/ })).toHaveCount(0);
      await poll(deal).toBeUndefined();

      // Offer delete keeps sales (unlinked).
      await confirmDelete(page, offerRow.getByRole("button", { name: "Delete" }), "Delete this offer?", offerRow);
      await poll(async () => (await rows(page, "offers")).some((o) => o.name === "Audit Club")).toBe(false);

      // Workspace transaction list: edit opens with the record, delete removes it.
      const wsTx = card(page, "Transactions");
      const firstTx = wsTx.getByRole("listitem").first();
      sheet = await openSheet(page, firstTx.getByRole("button", { name: "Edit" }), "Edit transaction", "x");
      await press(sheet.getByRole("button", { name: "Close" }));
      const txCount = (await rows(page, "transactions")).length;
      await press(firstTx.getByRole("button", { name: "Delete" }));
      await press(dialog(page, "Delete this transaction?").getByRole("button", { name: "Delete", exact: true }));
      await toast(page, "Deleted.");
      await poll(async () => (await rows(page, "transactions")).length).toBe(txCount - 1);

      // Delete the workspace: needs DELETE typed; everything it owns goes.
      const del = page.getByRole("button", { name: "Delete workspace" });
      await press(del);
      let wc = dialog(page, "Delete Exchange Mastery?");
      await press(wc.getByRole("button", { name: "Cancel" }));
      await expect(wc).toBeHidden();
      await press(del);
      wc = dialog(page, "Delete Exchange Mastery?");
      const confirmBtn = wc.getByRole("button", { name: "Delete permanently" });
      await expect(confirmBtn).toBeDisabled();
      await type(wc.getByRole("textbox"), "DELETE");
      await press(confirmBtn);
      await toast(page, "Business deleted.");
      await expect(page.getByRole("heading", { name: "Command centre" })).toBeVisible();
      await expect(card(page, "By business").getByRole("link", { name: /Exchange Mastery/ })).toHaveCount(0);
      const s = await stored(page);
      expect((s.lists.businesses ?? []).some((b: Row) => b.id === biz.id)).toBe(false);
      expect((s.lists.transactions ?? []).some((t: Row) => t.business_id === biz.id)).toBe(false);
      expect((s.lists.metrics ?? []).some((m: Row) => m.business_id === biz.id)).toBe(false);
      await page.goto(`/#/business/${biz.id}`);
      await expect(page.getByText("That business doesn't exist.")).toBeVisible();
      await finish(page, errors);
    });

    test("Log → Business tab: record, activity across businesses, add lead, recent list", async ({ browser }) => {
      const { page, errors } = await open(browser, vp, "demo");
      const today = await appToday(page);
      const em = (await rows(page, "businesses")).find((b) => b.name === "Exchange Mastery")!;
      await nav(page, "/log?tab=business", page.getByRole("heading", { name: "Record a transaction" }));
      const form = page.getByRole("form", { name: "Transaction form" });
      await pick(field(form, "Type"), "expense");
      await pick(field(form, "Business"), em.id as string);
      await type(field(form, "Amount"), "75.5");
      await type(field(form, "Date"), addDays(today, -1));
      await pick(field(form, "Category"), "software");
      await type(field(form, "Description"), "Log tab tool");
      await press(form.getByRole("button", { name: "Record", exact: true }));
      await toast(page, "Recorded.");
      await poll(async () => (await rows(page, "transactions")).find((t) => t.description === "Log tab tool")).toMatchObject({
        kind: "expense", amount: 75.5, business_id: em.id, txn_date: addDays(today, -1), expense_category: "software",
      });
      // The form clears for the next one, keeping the type.
      await expect(field(form, "Amount")).toHaveValue("");
      await expect(field(form, "Description")).toHaveValue("");
      const recent = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Recent transactions" }) });
      const row = item(recent, "Business expense · Log tab tool");
      await expect(row).toBeVisible();

      // A sale picked from an offer fills the amount; the next entry starts without the offer.
      await pick(field(form, "Type"), "sale");
      const offerSel = field(form, "Offer");
      const offerOpt = offerSel.locator("option").nth(1);
      const offerId = await offerOpt.getAttribute("value");
      const offer = (await rows(page, "offers")).find((o) => o.id === offerId)!;
      await pick(offerSel, offerId!);
      await expect(field(form, "Revenue earned")).toHaveValue(String(offer.price));
      await expect(form.getByRole("switch", { name: /Recurring revenue/ })).toHaveAttribute("aria-checked", offer.billing === "monthly" ? "true" : "false");
      await type(field(form, "Date earned"), addDays(today, -2));
      await type(field(form, "Received on"), addDays(today, -2));
      await type(field(form, "Description"), "Offer sale");
      const bizId = await field(form, "Business").inputValue();
      const isDup = (await rows(page, "transactions")).some((t) => t.kind === "sale" && t.txn_date === addDays(today, -2) && t.amount === offer.price && t.business_id === bizId);
      await press(form.getByRole("button", { name: "Record", exact: true }));
      if (isDup) {
        // Same amount on the same day: the app asks first, and "Record it again" saves it.
        const dup = dialog(page, "Possible duplicate");
        await expect(dup).toContainText(`Sale of ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(offer.price))} on this date is already recorded.`);
        await press(dup.getByRole("button", { name: "Record it again" }));
      }
      await toast(page, /Sale recorded/);
      await poll(async () => (await rows(page, "transactions")).find((t) => t.description === "Offer sale")).toMatchObject({ offer_id: offerId, amount: offer.price, txn_date: addDays(today, -2) });
      await expect(offerSel).toHaveValue("");
      await expect(form.getByRole("switch", { name: /Recurring revenue/ })).toHaveAttribute("aria-checked", "false");
      await expect(item(recent, "Sale · Offer sale")).toBeVisible();

      // Activity lists every business's metrics.
      const act = page.locator(".card").filter({ has: page.getByRole("heading", { name: /^Activity ·/ }) });
      await expect(act.locator(".eyebrow", { hasText: "Lost Revenue Group" })).toBeVisible();
      await expect(act.locator(".eyebrow", { hasText: "Exchange Mastery" })).toBeVisible();
      const vid = act.getByRole("listitem").filter({ hasText: "Short-form videos" });
      const metric = (await rows(page, "metrics")).find((m) => m.label === "Short-form videos")!;
      const n0 = Number(await vid.getByRole("textbox", { name: "Count" }).inputValue());
      await press(vid.getByRole("button", { name: "Increase" }));
      await poll(async () => (await rows(page, "activityLogs")).find((a) => a.metric_id === metric.id && a.log_date === today)?.count).toBe(n0 + 1);

      // Add lead.
      let sheet = await openSheet(page, page.getByRole("button", { name: "Add lead" }), "Add to pipeline", "all");
      await pick(field(sheet, "Business"), em.id as string);
      await type(field(sheet, "Company / person"), "Log Lead");
      await press(sheet.getByRole("button", { name: "Add to pipeline" }));
      await toast(page, "Pipeline updated.");
      await expect(sheet).toBeHidden();
      await poll(async () => (await rows(page, "deals")).find((d) => d.name === "Log Lead")).toMatchObject({ business_id: em.id, stage: "lead" });

      // Edit and delete from the recent list.
      sheet = await openSheet(page, row.getByRole("button", { name: "Edit" }), "Edit transaction", "x");
      await expect(field(sheet, "Amount")).toHaveValue("75.5");
      await type(field(sheet, "Amount"), "80");
      await press(sheet.getByRole("button", { name: "Save changes" }));
      await toast(page, "Transaction updated.");
      await expect(row).toContainText("$80.00");
      await poll(async () => (await rows(page, "transactions")).find((t) => t.description === "Log tab tool")?.amount).toBe(80);

      // The Business page pipeline counts include the new lead.
      const leads = (await rows(page, "deals")).filter((d) => d.stage === "lead").length;
      await nav(page, "/business", page.getByRole("heading", { name: "Command centre" }));
      const pipeCard = card(page, "Pipeline");
      await expect(pipeCard.locator(".eyebrow", { hasText: /^Lead$/ }).locator("xpath=following-sibling::div[1]")).toHaveText(String(leads));
      await expect(pipeCard.locator(".eyebrow", { hasText: /^Sales conversation$/ })).toBeVisible();

      // The workspace shows the lead and the activity count right away.
      await nav(page, `/business/${em.id}`, page.getByRole("heading", { name: "Exchange Mastery" }));
      await expect(card(page, "Sales pipeline").getByRole("button", { name: /Log Lead/ })).toBeVisible();
      await expect(card(page, "Today's activity").getByRole("listitem").filter({ hasText: "Short-form videos" }).getByRole("textbox", { name: "Count" })).toHaveValue(String(n0 + 1));
      await expect(item(card(page, "Transactions"), "Business expense · Log tab tool")).toBeVisible();

      await nav(page, "/log?tab=business", page.getByRole("heading", { name: "Record a transaction" }));
      await confirmDelete(page, row.getByRole("button", { name: "Delete" }), "Delete this transaction?", row);
      await poll(async () => (await rows(page, "transactions")).some((t) => t.description === "Log tab tool")).toBe(false);
      await finish(page, errors);
    });
  });
}

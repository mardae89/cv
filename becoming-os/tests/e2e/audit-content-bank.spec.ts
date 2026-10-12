// The Content Bank (release today, ten ideas at a time, strategy), the release
// days in Settings, and the Day/Night theme, at phone and desktop sizes.
import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, go, openFresh, rows, settle, stored } from "./helpers";

const PRIORITY = ["Learning alongside me", "Receipts"];

for (const vp of ["mobile", "desktop"] as const) {
  test.describe(`${vp}`, () => {
    test(`content bank: pick a format, ten at a time, check off, add to today (${vp})`, async ({ browser }) => {
      const { page, errors } = await openFresh(browser, vp, "skip");
      await go(page, "/content");
      await expect(page.getByRole("heading", { name: "Content Bank" })).toBeVisible();
      await page.getByRole("button", { name: /Load my content ideas/ }).first().click();
      await expect.poll(async () => (await rows(page, "contentIdeas")).length).toBe(129);
      const ideas = await rows(page, "contentIdeas");

      // Short form is picked by default (released every day out of the box), priority sections first.
      const formats = page.getByRole("group", { name: "Choose a format" });
      await expect(formats.getByRole("button", { name: /^Short form/ })).toHaveAttribute("aria-pressed", "true");
      const shorts = page.getByRole("list", { name: "Short form ideas" }).getByRole("checkbox");
      await expect(shorts).toHaveCount(10);
      const firstShort = await shorts.first().getAttribute("aria-label");
      expect(PRIORITY).toContain(ideas.find((i) => i.title === firstShort)?.section);
      await expect(page.getByText("1–10 of 79 · priority first")).toBeVisible();
      await page.getByRole("navigation", { name: "Short form pages" }).getByRole("button", { name: /Next/ }).click();
      await expect(page.getByText("11–20 of 79 · priority first")).toBeVisible();
      await expect(shorts).toHaveCount(10);

      // Long form: ten long-form ideas only.
      await formats.getByRole("button", { name: /^Long form/ }).click();
      await expect(formats.getByRole("button", { name: /^Long form/ })).toHaveAttribute("aria-pressed", "true");
      const longs = page.getByRole("list", { name: "Long form ideas" }).getByRole("checkbox");
      await expect(longs).toHaveCount(10);
      for (const t of await longs.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))) {
        expect(ideas.find((i) => i.title === t)?.format).toBe("long");
      }
      await expect(page.getByText("1–10 of 50 · priority first")).toBeVisible();

      // Check one off: it stays in view, crossed out, and is stored as done.
      const title = (await longs.first().getAttribute("aria-label"))!;
      await longs.first().click();
      await expect(longs.first()).toHaveAttribute("aria-checked", "true");
      await expect(longs).toHaveCount(10);
      await expect.poll(async () => (await rows(page, "contentIdeas")).find((i) => i.title === title)?.status).toBe("done");

      // Add another to today: it shows on today's slate.
      const plan = page.getByRole("list", { name: "Long form ideas" }).getByRole("button", { name: /^Add to today: #/ }).first();
      await plan.click();
      await expect.poll(async () => (await rows(page, "contentIdeas")).filter((i) => i.planned_for).length).toBe(1);
      const planned = (await rows(page, "contentIdeas")).find((i) => i.planned_for)!;
      await expect(page.getByRole("list", { name: "Today's slate" }).getByRole("checkbox", { name: String(planned.title) })).toBeVisible();

      // The filter link opens the bank on long form.
      await page.getByRole("button", { name: /Filter long-form by funnel/ }).click();
      await expect(page.getByRole("radio", { name: /^Long form/ })).toHaveAttribute("aria-checked", "true");
      await expect(page.getByRole("checkbox")).toHaveCount(10);
      await expectNoHorizontalScroll(page);
      expect(errors).toEqual([]);
    });

    test(`content bank: edit the strategy, open a section, restore the notes (${vp})`, async ({ browser }) => {
      const { page, errors } = await openFresh(browser, vp, "skip");
      await go(page, "/content?tab=library");
      await page.getByRole("button", { name: /Load my content ideas/ }).first().click();
      await expect.poll(async () => (await rows(page, "contentIdeas")).length).toBe(129);
      await page.getByRole("radio", { name: "Strategy" }).click();
      await expect(page.getByText("Swing trading for people who have jobs and lives.", { exact: false })).toBeVisible();
      await expect(page.locator("ol > li")).toHaveCount(8);

      await page.getByRole("button", { name: "Edit strategy" }).click();
      const form = page.getByRole("form", { name: "Content strategy" });
      await form.getByLabel("Positioning").fill("Trading for people with full lives.");
      await form.getByRole("button", { name: "Remove rule 8" }).click();
      await form.getByRole("button", { name: "Add a rule" }).click();
      await form.getByLabel("Rule 8", { exact: true }).fill("Film the lesson, then cut the shorts.");
      await form.getByRole("button", { name: "Save strategy" }).click();
      await expect(form).toHaveCount(0);
      await expect.poll(async () => ((await stored(page)).singles.powerSettings?.strategy as { positioning: string } | undefined)?.positioning)
        .toBe("Trading for people with full lives.");
      await page.reload();
      await settle(page);
      await expect(page.getByText("Trading for people with full lives.")).toBeVisible();
      await expect(page.getByText("Film the lesson, then cut the shorts.")).toBeVisible();

      // Each section opens its ideas in the bank.
      await page.getByRole("button", { name: "See ideas in Receipts" }).click();
      await expect(page.getByLabel("Section")).toHaveValue("Receipts");
      const ideas = await rows(page, "contentIdeas");
      for (const t of await page.getByRole("checkbox").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))) {
        expect(ideas.find((i) => i.title === t)?.section).toBe("Receipts");
      }

      // Restore the original notes.
      await go(page, "/content?tab=strategy");
      await page.getByRole("button", { name: "Edit strategy" }).click();
      await form.getByRole("button", { name: "Restore my original notes" }).click();
      await expect(form.getByLabel("Positioning")).toHaveValue(/^Swing trading for people who have jobs and lives/);
      await form.getByRole("button", { name: "Save strategy" }).click();
      await expect.poll(async () => ((await stored(page)).singles.powerSettings?.strategy as { rules: string[] } | undefined)?.rules.length).toBe(8);
      await expectNoHorizontalScroll(page);
      expect(errors).toEqual([]);
    });

    test(`release days: set in Settings, shown in the Content Bank (${vp})`, async ({ browser }) => {
      const { page, errors } = await openFresh(browser, vp, "skip");
      await go(page, "/settings#power");
      const form = page.getByRole("form", { name: "Power List and motivation" });
      const short = form.getByRole("group", { name: "Short-form release days" });
      const long = form.getByRole("group", { name: "Long-form release days" });
      for (const d of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) {
        await expect(short.getByRole("button", { name: d })).toHaveAttribute("aria-pressed", "true");
      }
      await short.getByRole("button", { name: "Saturday" }).click();
      await short.getByRole("button", { name: "Sunday" }).click();
      await long.getByRole("button", { name: "Thursday" }).click();
      await expect(long.getByRole("button", { name: "Thursday" })).toHaveAttribute("aria-pressed", "false");
      await form.getByRole("button", { name: "Save" }).click();
      await expect.poll(async () => {
        const s = (await stored(page)).singles.powerSettings ?? {};
        return `${(s.short_release_days as number[] | undefined)?.join()}|${(s.long_release_days as number[] | undefined)?.join()}`;
      }).toBe("1,2,3,4,5|1,2,3");

      await go(page, "/content");
      await expect(page.getByText(/2 short-form a day, weekdays · 4 long-form a week \(Mon–Wed\)/)).toBeVisible();
      const week = page.getByRole("list", { name: "This week's production schedule" });
      await expect(week.getByText("Release long-form")).toHaveCount(3);
      await expect(week.getByText("Release 2 short")).toHaveCount(5);
      await page.getByRole("radio", { name: "Strategy" }).click();
      await expect(page.getByText("2 a day · weekdays")).toBeVisible();
      await expect(page.getByText("4 a week · Mon–Wed")).toBeVisible();
      expect(errors).toEqual([]);
    });

    test(`theme: Day and Night switch, persist and follow the device (${vp})`, async ({ browser }) => {
      const { page, errors } = await openFresh(browser, vp, "skip");
      const html = page.locator("html");
      const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      await expect(html).not.toHaveAttribute("data-app-theme", "light");
      const night = await bg();
      await page.getByRole("button", { name: "Switch to Day theme" }).first().click();
      await expect(html).toHaveAttribute("data-app-theme", "light");
      expect(await bg()).toBe("rgb(248, 247, 244)");
      await page.reload();
      await settle(page);
      await expect(html).toHaveAttribute("data-app-theme", "light");
      await page.getByRole("button", { name: "Switch to Night theme" }).first().click();
      await expect(html).not.toHaveAttribute("data-app-theme", "light");
      expect(await bg()).toBe(night);

      // Settings → Appearance: Match device follows the colour scheme.
      await go(page, "/settings#appearance");
      const theme = page.getByRole("radiogroup", { name: "Theme" });
      await expect(theme.getByRole("radio", { name: "Night" })).toHaveAttribute("aria-checked", "true");
      await page.emulateMedia({ colorScheme: "light" });
      await theme.getByRole("radio", { name: "Match device" }).click();
      await expect(html).toHaveAttribute("data-app-theme", "light");
      await page.emulateMedia({ colorScheme: "dark" });
      await expect(html).not.toHaveAttribute("data-app-theme", "light");
      await theme.getByRole("radio", { name: "Day" }).click();
      await expect(html).toHaveAttribute("data-app-theme", "light");
      await expectNoHorizontalScroll(page);
      expect(errors).toEqual([]);
    });
  });
}

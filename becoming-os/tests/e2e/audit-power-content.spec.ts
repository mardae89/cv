// Power List, Content, Traffic Engine and the motivation settings, at phone
// and desktop sizes: every control saves, survives a reload and updates the
// other places that show it.
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, go, openFresh, rows, settle, stored } from "./helpers";

for (const vp of ["mobile", "desktop"] as const) {
  test.describe(`${vp}`, () => {
    test(`power list: set up, tick every kind of item, reach a perfect day (${vp})`, async ({ browser }) => {
      const { page, errors } = await openFresh(browser, vp, "skip");
      await go(page, "/power");
      await page.getByRole("button", { name: "Use my standard list" }).first().click();
      const day = page.getByRole("region", { name: "Day checklist" }).or(page.locator('[aria-label="Day checklist"]')).first();
      await expect(day.getByRole("button", { name: "Wake up by 5:45am" })).toBeVisible();
      expect((await rows(page, "powerItems")).length).toBe(9);
      // Filming and editing go to Daily execution, on their days.
      await expect.poll(async () => (await rows(page, "habits")).map((h) => h.name).sort().join("|")).toBe("Edit for 90 minutes|Film long-form|Film short-form");

      // A check item.
      await day.getByRole("button", { name: "Wake up by 5:45am" }).click();
      await expect(day.getByRole("button", { name: "Wake up by 5:45am" })).toHaveAttribute("aria-pressed", "true");
      // A count item by stepper.
      for (let i = 0; i < 6; i++) await day.getByRole("button", { name: "Increase Instagram stories" }).click();
      await expect(day.getByRole("button", { name: /^Instagram stories: 6 of 6/ })).toHaveAttribute("aria-pressed", "true");
      // A count item by typing.
      const pages = day.getByRole("textbox", { name: /Read 5 pages amount/ });
      await pages.fill("5");
      await pages.press("Enter");
      await expect(day.getByRole("button", { name: /^Read 5 pages: 5 of 5/ })).toHaveAttribute("aria-pressed", "true");

      // Finish everything else that's due today: counts with Done, checks by tapping.
      // Re-query after every tap: the list re-renders as items complete.
      for (let i = 0; i < 20; i++) {
        const done = day.getByRole("button", { name: /^Mark .* done/ }).and(page.locator(":enabled")).first();
        if (!(await done.count())) break;
        await done.click();
      }
      for (let i = 0; i < 20; i++) {
        const open = day.locator('button[aria-pressed="false"]').first();
        if (!(await open.count())) break;
        await open.click();
      }
      await expect(day.locator('button[aria-pressed="false"]')).toHaveCount(0);
      await expect(page.getByText("Perfect day.", { exact: false }).first()).toBeVisible();
      await expect.poll(async () => (await rows(page, "powerLogs")).length).toBeGreaterThanOrEqual(8);

      // Week and month PCR both read 100% for a single perfect day. (The perfect-day
      // celebration opens a moment after the last tick; wait until it's been dismissed.)
      await settle(page, 1500);
      await page.getByRole("radio", { name: "Month" }).or(page.getByRole("button", { name: "Month" })).first().click();
      await expect(page.getByLabel("PCR 100%").first()).toBeVisible();

      await page.reload();
      await settle(page);
      await expect(page.getByRole("button", { name: "Wake up by 5:45am" }).first()).toHaveAttribute("aria-pressed", "true");
      await go(page, "/");
      await expect(page.getByText("100%").first()).toBeVisible();
      await expectNoHorizontalScroll(page);
      expect(errors).toEqual([]);
    });

    test(`power list: edit the list — add, change target, archive, delete (${vp})`, async ({ browser }) => {
      const { page, errors } = await openFresh(browser, vp, "skip");
      await go(page, "/power");
      await page.getByRole("button", { name: "Use my standard list" }).first().click();
      await page.getByRole("button", { name: /Edit list/ }).first().click();
      const sheet = page.getByRole("dialog");
      await sheet.getByRole("button", { name: "Edit Instagram stories" }).click();
      await sheet.getByLabel("Target").fill("8");
      await sheet.getByRole("button", { name: /Save/ }).click();
      await expect.poll(async () => (await rows(page, "powerItems")).find((r) => r.name === "Instagram stories")?.target).toBe(8);
      await page.getByRole("dialog").getByRole("button", { name: /Add item/ }).click();
      await page.getByRole("dialog").getByLabel("Item").fill("Reach 10 new people");
      await page.getByRole("dialog").getByRole("button", { name: /Save|Add/ }).last().click();
      await expect.poll(async () => (await rows(page, "powerItems")).some((r) => r.name === "Reach 10 new people")).toBe(true);
      await page.getByRole("dialog").getByRole("button", { name: "Archive No impulsive purchases" }).click();
      await page.getByRole("dialog").last().getByRole("button", { name: /Archive/ }).last().click();
      await expect.poll(async () => (await rows(page, "powerItems")).find((r) => r.name === "No impulsive purchases")?.archived_on).toBeTruthy();
      await page.getByRole("dialog").first().getByRole("button", { name: "Delete Morning cardio" }).click();
      await page.getByRole("dialog").last().getByRole("button", { name: /^Delete/ }).last().click();
      await expect.poll(async () => (await rows(page, "powerItems")).some((r) => r.name === "Morning cardio")).toBe(false);
      expect(errors).toEqual([]);
    });

    test(`content: load ideas, 10 per page, filters, check off, plan today (${vp})`, async ({ browser }) => {
      const { page, errors } = await openFresh(browser, vp, "skip");
      await go(page, "/content?tab=library");
      await page.getByRole("button", { name: /Load my content ideas/ }).first().click();
      await expect.poll(async () => (await rows(page, "contentIdeas")).length).toBe(129);
      const boxes = () => page.getByRole("checkbox");
      await expect(boxes()).toHaveCount(10);
      await page.getByRole("navigation", { name: "Pages" }).getByRole("button", { name: /Next/ }).click();
      await expect(boxes()).toHaveCount(10);

      // Format filter: long form only.
      await page.getByRole("radio", { name: /Long/ }).or(page.getByRole("button", { name: /^Long form$/ })).first().click();
      const titles = await boxes().evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
      const ideas = await rows(page, "contentIdeas");
      for (const t of titles) expect(ideas.find((i) => i.title === t)?.format).toBe("long");

      // Check one off: crossed out and stored.
      const first = boxes().first();
      const title = await first.getAttribute("aria-label");
      await first.click();
      await expect.poll(async () => (await rows(page, "contentIdeas")).find((i) => i.title === title)?.status).toBe("done");
      await page.reload();
      await settle(page);
      await go(page, "/content?tab=library");
      // Plan one for today and see it on the Today tab and the Today page.
      const add = page.getByRole("button", { name: /^Add to today: #/ }).first();
      await add.click();
      await expect.poll(async () => (await rows(page, "contentIdeas")).filter((i) => i.planned_for).length).toBe(1);
      await go(page, "/content");
      await expect(page.getByLabel("Today's slate")).toBeVisible();
      await expectNoHorizontalScroll(page);
      expect(errors).toEqual([]);
    });

    test(`traffic: log the four numbers, totals and today's ten update (${vp})`, async ({ browser }) => {
      const { page, errors } = await openFresh(browser, vp, "skip");
      await go(page, "/traffic");
      const form = page.getByRole("form", { name: "Traffic numbers form" });
      await form.getByLabel("People reached").fill("12");
      await form.getByLabel("Conversations").fill("4");
      await form.getByLabel("Invitations").fill("2");
      await form.getByLabel("Members").fill("1");
      await form.getByRole("button", { name: "Save numbers" }).click();
      await expect.poll(async () => (await rows(page, "traffic")).length).toBe(1);
      await expect(page.getByText("12 / 10 new people")).toBeVisible();
      await expect(page.getByText("Daily ten reached.")).toBeVisible();
      // Editing the same day and channel updates rather than duplicates.
      await form.getByLabel("Members").fill("2");
      await form.getByRole("button", { name: "Update numbers" }).click();
      await expect.poll(async () => (await rows(page, "traffic"))[0]?.members).toBe(2);
      expect((await rows(page, "traffic")).length).toBe(1);
      await go(page, "/");
      await expect(page.getByText("12 / 10").first()).toBeVisible();
      await expectNoHorizontalScroll(page);
      expect(errors).toEqual([]);
    });

    test(`motivation: edit reasons and see them across the app (${vp})`, async ({ browser }) => {
      const { page, errors } = await openFresh(browser, vp, "skip");
      await go(page, "/settings#power");
      const form = page.getByRole("form", { name: "Power List and motivation" });
      const removes = form.getByRole("button", { name: /^Remove reason \d+$/ });
      await expect(removes).toHaveCount(6);
      for (let left = 6; left > 1; left--) {
        await form.getByRole("button", { name: "Remove reason 2", exact: true }).click();
        await expect(removes).toHaveCount(left - 1);
      }
      await form.getByLabel("Reason 1", { exact: true }).fill("Take my mother to Japan");
      await form.getByLabel("Who I'm becoming").fill("A disciplined operator who shows up every day");
      await form.getByRole("button", { name: "Save" }).click();
      await expect.poll(async () => ((await stored(page)).singles.powerSettings?.reasons as string[] | undefined)?.join("|")).toBe("Take my mother to Japan");
      await go(page, "/content");
      await expect(page.getByText("Take my mother to Japan").first()).toBeVisible();
      await go(page, "/");
      await expect(page.getByText(/Take my mother to Japan|A disciplined operator/).first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}

// Keep the helper import used even if a test above is trimmed.
export type _P = Page;

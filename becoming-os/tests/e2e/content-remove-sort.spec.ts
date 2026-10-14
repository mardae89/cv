// Today's content can be trimmed from the Today page, and the Content Bank
// filters by funnel stage in one tap and sorts by funnel or format.
import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, go, openFresh, rows } from "./helpers";

for (const vp of ["mobile", "desktop"] as const) {
  test(`today's content: remove an idea from today (${vp})`, async ({ browser }) => {
    const { page, errors } = await openFresh(browser, vp, "skip");
    await go(page, "/content?tab=library");
    await page.getByRole("button", { name: /Load my content ideas/ }).first().click();
    await expect.poll(async () => (await rows(page, "contentIdeas")).length).toBe(129);
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: /^Add to today: #/ }).first().click();
    await expect.poll(async () => (await rows(page, "contentIdeas")).filter((c) => c.planned_for).length).toBe(2);

    await go(page, "/");
    const card = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Today's content" }) });
    const remove = card.getByRole("button", { name: /^Remove #\d+ from today$/ });
    await expect(remove).toHaveCount(2);
    const label = (await remove.first().getAttribute("aria-label"))!;
    const num = Number(/#(\d+)/.exec(label)![1]);
    await remove.first().click();
    await expect(remove).toHaveCount(1);
    await expect.poll(async () => (await rows(page, "contentIdeas")).find((c) => c.num === num)?.planned_for ?? null).toBeNull();
    // It's back in the bank, still open.
    expect((await rows(page, "contentIdeas")).find((c) => c.num === num)?.status).toBe("open");
    expect(errors).toEqual([]);
  });

  test(`content bank: funnel stage buttons and sort by funnel or format (${vp})`, async ({ browser }) => {
    const { page, errors } = await openFresh(browser, vp, "skip");
    await go(page, "/content?tab=library");
    await page.getByRole("button", { name: /Load my content ideas/ }).first().click();
    await expect.poll(async () => (await rows(page, "contentIdeas")).length).toBe(129);
    const ideas = await rows(page, "contentIdeas");
    const shown = async () => {
      const titles = await page.getByRole("checkbox").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
      return titles.map((t) => ideas.find((i) => i.title === t)!);
    };
    const funnel = page.getByRole("radiogroup", { name: "Funnel stage" });
    for (const stage of ["Top", "Middle", "Bottom"]) {
      await funnel.getByRole("radio", { name: stage, exact: true }).click();
      const list = await shown();
      expect(list.length).toBeGreaterThan(0);
      expect(list.every((i) => i.funnel === stage.toLowerCase())).toBe(true);
    }
    await funnel.getByRole("radio", { name: "All", exact: true }).click();
    await page.getByLabel("Sort").selectOption("funnel-desc");
    expect((await shown()).every((i) => i.funnel === "bottom")).toBe(true);
    await page.getByLabel("Sort").selectOption("long-first");
    expect((await shown()).every((i) => i.format === "long")).toBe(true);
    await page.getByLabel("Sort").selectOption("short-first");
    expect((await shown()).every((i) => i.format === "short")).toBe(true);
    await expectNoHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
}

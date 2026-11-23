import { expect, test } from "./fixtures";

test.describe("public pages", () => {
  test("the landing page explains Tollvakt and lets a guest try it", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Find the right commodity code before the goods reach the border",
    );
    await expect(page.getByRole("heading", { name: "Try it now" })).toBeVisible();
    await expect(page.getByLabel("Product description")).toBeVisible();
  });

  test("a Norwegian browser gets the Norwegian page, and the language can be switched", async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: "nb-NO" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Finn riktig varenummer før varene kommer til grensen",
    );

    await page.getByRole("button", { name: "Switch to English" }).click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Find the right commodity code before the goods reach the border",
    );
    await context.close();
  });

  test("the about page says what is stored and that it is not binding", async ({ page }) => {
    await page.goto("/about");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("About Tollvakt");
    await expect(page.getByRole("heading", { name: "Your data" })).toBeVisible();
    await expect(page.getByText(/binding classification ruling \(BKU\)/)).toBeVisible();
  });

  test("switches between light and dark mode", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    const before = await html.getAttribute("data-color-scheme");

    await page.getByRole("button", { name: "Switch between light and dark mode" }).click();

    await expect(html).not.toHaveAttribute("data-color-scheme", before ?? "");
  });
});

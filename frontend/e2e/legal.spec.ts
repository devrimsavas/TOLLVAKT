import { expect, test } from "./fixtures";

test.describe("privacy statement and terms of use", () => {
  test("the footer links to the privacy statement, which names the controller", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();

    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy statement");
    await expect(page.getByText(/Devrim Savas Yilmaz, a private person in Norway/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "The language model (Google Gemini)" })).toBeVisible();
    await expect(page.getByRole("link", { name: "datatilsynet.no" })).toBeVisible();
  });

  test("the footer links to the terms of use", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("contentinfo").getByRole("link", { name: "Terms of use" }).click();

    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Terms of use");
    await expect(page.getByRole("heading", { name: "Suggestions, not decisions" })).toBeVisible();
  });

  test("both pages can be read in Norwegian without logging in", async ({ browser }) => {
    const context = await browser.newContext({ locale: "nb-NO" });
    const page = await context.newPage();

    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Personvernerklæring");
    await page.goto("/terms");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Vilkår for bruk");
    await context.close();
  });

  test("the register page links to both", async ({ page }) => {
    await page.goto("/register");
    const main = page.getByRole("main");

    await main.getByRole("link", { name: "terms of use" }).click();
    await expect(page).toHaveURL(/\/terms$/);

    await page.goBack();
    await main.getByRole("link", { name: "privacy statement" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
  });
});

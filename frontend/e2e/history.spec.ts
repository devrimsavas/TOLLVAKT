import { clearUsage, expect, logIn, newUser, register, test } from "./fixtures";

test.beforeEach(async ({ request }) => {
  await clearUsage(request);
});

async function classify(page: import("@playwright/test").Page, description: string) {
  await page.goto("/classify");
  await page.getByLabel("Product description").fill(description);
  await page.getByRole("button", { name: "Find commodity codes" }).click();
  await expect(page.getByRole("heading", { name: /Suggested commodity codes|No code fits/ })).toBeVisible();
}

test.describe("my classifications", () => {
  test("starts empty, with a way to classify", async ({ page, user }) => {
    void user;
    await page.goto("/history");

    await expect(page.getByText("You have not classified any products yet.")).toBeVisible();
    await page.getByRole("link", { name: "Classify a product" }).click();
    await expect(page).toHaveURL(/\/classify$/);
  });

  test("lists the classifications newest first and opens one as it was answered", async ({ page, user }) => {
    void user;
    await classify(page, "T-skjorte i bomull");
    await classify(page, "Strikket genser i ull");

    await page.getByRole("link", { name: "My classifications" }).click();
    await expect(page.getByText("2 classifications")).toBeVisible();
    const entries = page.getByRole("main").getByRole("listitem");
    await expect(entries.first()).toContainText("Strikket genser i ull");
    await expect(entries.first()).toContainText("6110.11.00");
    await expect(entries.nth(1)).toContainText("T-skjorte i bomull");

    await entries.first().getByRole("link").click();
    await expect(page).toHaveURL(/\/history\/[0-9a-f-]{36}$/);
    await expect(page.getByText("«Strikket genser i ull»")).toBeVisible();
    await expect(page.getByText("Hva slags ull er genseren laget av?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
  });

  test("deletes a classification after asking", async ({ page, user }) => {
    void user;
    await classify(page, "T-skjorte i bomull");
    await page.getByRole("link", { name: "Open", exact: true }).click();
    await expect(page).toHaveURL(/\/history\/[0-9a-f-]{36}$/);

    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: "Delete this classification?" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();

    await expect(page).toHaveURL(/\/history\?deleted=1$/);
    await expect(page.getByText("The classification has been deleted.")).toBeVisible();
    await expect(page.getByText("You have not classified any products yet.")).toBeVisible();
  });

  test("another member cannot open it", async ({ page, request, browser, user }) => {
    void user;
    await classify(page, "T-skjorte i bomull");
    await page.getByRole("link", { name: "Open", exact: true }).click();
    await expect(page).toHaveURL(/\/history\/[0-9a-f-]{36}$/);
    const url = page.url();

    const other = newUser();
    await register(request, other);
    const context = await browser.newContext({ locale: "en-GB" });
    const otherPage = await context.newPage();
    await logIn(otherPage, other.email, other.password);
    const response = await otherPage.goto(url);
    expect(response?.status()).toBe(404);
    await context.close();
  });
});

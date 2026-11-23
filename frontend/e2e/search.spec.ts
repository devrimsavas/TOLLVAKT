import { clearUsage, expect, test } from "./fixtures";

test.describe("search and browse the tariff", () => {
  test("a code search lists the codes it starts, and opens a code's page", async ({ page, user }) => {
    void user;
    await page.goto("/search");
    await page.getByRole("searchbox", { name: "Commodity code or words" }).fill("6109");
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(page).toHaveURL(/\/search\?q=6109$/);
    await expect(page.getByRole("heading", { name: "2 codes" })).toBeVisible();
    await page.getByRole("link", { name: /6109\.10\.00/ }).click();

    await expect(page).toHaveURL(/\/search\/61091000$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("6109.10.00");
    await expect(page.getByRole("main").locator("header").getByText("Of cotton", { exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "Place in the tariff" })).toContainText(
      "T-shirts, singlets and other vests",
    );
  });

  test("a word search finds codes by the tariff's texts", async ({ page, user }) => {
    void user;
    await page.goto("/search?q=wool");

    await expect(page.getByRole("heading", { name: "1 code" })).toBeVisible();
    await expect(page.getByRole("link", { name: /6110\.11\.00/ })).toBeVisible();
  });

  test("says when nothing is found", async ({ page, user }) => {
    void user;
    await page.goto("/search?q=zzzzqqq");

    await expect(page.getByRole("heading", { name: "No codes found" })).toBeVisible();
  });

  test("the tree opens level by level down to a code", async ({ page, user }) => {
    void user;
    await page.goto("/search");
    const tree = page.getByRole("navigation", { name: "The customs tariff" });

    await tree.getByRole("button", { name: /Section XI/ }).click();
    await tree.getByRole("button", { name: /61\.09/ }).click();
    await tree.getByRole("link", { name: /6109\.10\.00/ }).click();

    await expect(page).toHaveURL(/\/search\/61091000$/);
  });

  test("a code's page shows the tree open at the code", async ({ page, user }) => {
    void user;
    await page.goto("/search/6110.11.00");

    const tree = page.getByRole("navigation", { name: "The customs tariff" });
    await expect(tree.getByRole("button", { name: /Section XI/ })).toHaveAttribute("aria-expanded", "true");
    await expect(tree.getByRole("link", { name: /6110\.11\.00/ })).toHaveAttribute("aria-current", "page");
    await expect(tree.getByRole("link", { name: /6110\.20\.00/ })).toBeVisible();
  });

  test("an unknown code is not found", async ({ page, user }) => {
    void user;
    const response = await page.goto("/search/99999999");

    expect(response?.status()).toBe(404);
  });

  test("a suggested code links to its page", async ({ page, request, user }) => {
    void user;
    await clearUsage(request);
    await page.getByLabel("Product description").fill("Strikket genser i ull");
    await page.getByRole("button", { name: "Find commodity codes" }).click();

    await page.getByRole("link", { name: "Open the code 6110.11.00 in the tariff" }).click();

    await expect(page).toHaveURL(/\/search\/61101100$/);
  });
});

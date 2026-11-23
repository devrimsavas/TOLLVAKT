import { USER_DAILY_LIMIT } from "./settings";
import { clearUsage, expect, test } from "./fixtures";

test.beforeEach(async ({ request }) => {
  await clearUsage(request);
});

async function classify(page: import("@playwright/test").Page, description: string) {
  await page.getByLabel("Product description").fill(description);
  await page.getByRole("button", { name: "Find commodity codes" }).click();
}

test.describe("classification", () => {
  test("a member gets codes with reasons, confidence, questions and the place in the tariff", async ({
    page,
    user,
  }) => {
    void user;
    await expect(page.getByText(`${USER_DAILY_LIMIT} of ${USER_DAILY_LIMIT} classifications left today`)).toBeVisible();

    await classify(page, "Strikket genser i ull til herre");

    await expect(page.getByRole("heading", { name: "Suggested commodity codes" })).toBeVisible();
    const suggestions = page.getByRole("listitem").filter({ hasText: /^6110/ });
    await expect(suggestions).toHaveCount(2);
    await expect(suggestions.first()).toContainText("6110.11.00");
    await expect(suggestions.first()).toContainText("High confidence");
    await expect(suggestions.first()).toContainText("Strikket genser av ull.");
    await expect(suggestions.nth(1)).toContainText("Low confidence");
    await expect(page.getByText("Hva slags ull er genseren laget av?")).toBeVisible();
    await expect(page.getByText(`${USER_DAILY_LIMIT - 1} of ${USER_DAILY_LIMIT} classifications left today`)).toBeVisible();

    await suggestions.first().getByText("Place in the tariff").click();
    await expect(suggestions.first()).toContainText("Jerseys, pullovers, cardigans");

    await expect(page.getByText("Saved in your classifications.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open", exact: true })).toHaveAttribute(
      "href",
      /^\/history\/[0-9a-f-]{36}$/,
    );
  });

  test("says when no code fits", async ({ page, user }) => {
    void user;
    await classify(page, "nothing like this");

    await expect(page.getByRole("heading", { name: "No code fits" })).toBeVisible();
    await expect(page.getByText("Kapittel 95: leketøy")).toBeVisible();
  });

  test("an empty description is refused before anything is sent", async ({ page, user }) => {
    void user;
    await page.getByRole("button", { name: "Find commodity codes" }).click();

    await expect(page.getByText("Describe the product", { exact: true })).toBeVisible();
    await expect(page.getByText(`${USER_DAILY_LIMIT} of ${USER_DAILY_LIMIT} classifications left today`)).toBeVisible();
  });

  test("a failing model shows a message and does not use up a classification", async ({
    page,
    user,
  }) => {
    void user;
    await classify(page, "fail please");

    await expect(page.getByText("Classification is not available right now")).toBeVisible();
    await page.reload();
    await expect(page.getByText(`${USER_DAILY_LIMIT} of ${USER_DAILY_LIMIT} classifications left today`)).toBeVisible();
  });

  test("a member is stopped at the daily limit", async ({ page, user }) => {
    void user;
    for (let i = 0; i < USER_DAILY_LIMIT; i++) {
      await classify(page, `T-skjorte i bomull ${i}`);
      await expect(page.getByText(`${USER_DAILY_LIMIT - 1 - i} of ${USER_DAILY_LIMIT} classifications left today`)).toBeVisible();
    }

    await classify(page, "T-skjorte i bomull");

    await expect(page.getByText("You have used today's classifications")).toBeVisible();
  });

  test("a guest can classify once on the landing page, then is asked to register", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText("1 of 1 classifications left today")).toBeVisible();

    await classify(page, "T-skjorte i bomull");
    await expect(page.getByRole("heading", { name: "Suggested commodity codes" })).toBeVisible();
    await expect(page.getByText("6109.10.00")).toBeVisible();
    // A guest's classification is not saved
    await expect(page.getByText("Saved in your classifications.")).toHaveCount(0);
    await expect(page.getByText("Create a free account to classify up to 10 products a day")).toBeVisible();

    await classify(page, "Strikket genser i ull");
    await expect(page.getByText("Visitors without an account can classify one product a day")).toBeVisible();
    await page.getByRole("alert").getByRole("link", { name: "Create a free account" }).click();
    await expect(page).toHaveURL(/\/register$/);
  });
});

import { ADMIN, USER_DAILY_LIMIT } from "./settings";
import { clearUsage, expect, logIn, newUser, register, test } from "./fixtures";

test.beforeEach(async ({ request }) => {
  await clearUsage(request);
});

test.describe("admin", () => {
  test("shows today's use, the days and the accounts", async ({ page, request }) => {
    const member = newUser();
    await register(request, member);

    await logIn(page, ADMIN.email, ADMIN.password);
    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "The last 30 days" })).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: member.email });
    await expect(row).toContainText("Open");
    await expect(row).toContainText(`0 / ${USER_DAILY_LIMIT}`);
    // The admin's own account cannot be closed
    const own = page.getByRole("row").filter({ hasText: ADMIN.email });
    await expect(own.getByRole("button", { name: /Close the account/ })).toBeDisabled();
  });

  test("changes a member's daily limit", async ({ page, request, browser }) => {
    const member = newUser();
    await register(request, member);
    await logIn(page, ADMIN.email, ADMIN.password);
    await page.goto("/admin");

    const row = page.getByRole("row").filter({ hasText: member.email });
    await row.getByRole("spinbutton").fill("7");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row).toContainText("0 / 7");

    const context = await browser.newContext({ locale: "en-GB" });
    const memberPage = await context.newPage();
    await logIn(memberPage, member.email, member.password);
    await expect(memberPage.getByText("7 of 7 classifications left today")).toBeVisible();
    await context.close();

    await row.getByRole("button", { name: "Use default" }).click();
    await expect(row).toContainText(`0 / ${USER_DAILY_LIMIT}`);
  });

  test("closes an account, which ends the member's session, and reopens it", async ({
    page,
    request,
    browser,
  }) => {
    const member = newUser();
    await register(request, member);
    const context = await browser.newContext({ locale: "en-GB" });
    const memberPage = await context.newPage();
    await logIn(memberPage, member.email, member.password);

    await logIn(page, ADMIN.email, ADMIN.password);
    await page.goto("/admin");
    const row = page.getByRole("row").filter({ hasText: member.email });
    await row.getByRole("button", { name: /Close the account/ }).click();
    await expect(row).toContainText("Closed");

    await memberPage.goto("/history");
    await expect(memberPage).toHaveURL(/\/login\?expired=1$/);

    await row.getByRole("button", { name: /Reopen the account/ }).click();
    await expect(row).toContainText("Open");
    await logIn(memberPage, member.email, member.password);
    await context.close();
  });
});

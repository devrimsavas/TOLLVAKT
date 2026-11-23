import { ADMIN } from "./settings";
import { expect, logIn, newUser, register, test } from "./fixtures";

test.describe("accounts", () => {
  test("creating an account logs in and opens the classify page", async ({ page }) => {
    const user = newUser();
    await page.goto("/register");
    await page.getByLabel("First name").fill(user.firstName);
    await page.getByLabel("Last name").fill(user.lastName);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByLabel("Repeat password").fill(user.password);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/classify$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Classify a product");
  });

  test("shows a message for each wrong field", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("First name").fill("Ingrid");
    await page.getByLabel("Last name").fill("Solberg");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("IngridSecure2026");
    await page.getByLabel("Repeat password").fill("SomethingElse2026");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(page.getByText("The passwords are not the same")).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("a wrong password is refused, the right one goes back to the page asked for", async ({
    page,
    request,
  }) => {
    const user = newUser();
    await register(request, user);

    await page.goto("/history");
    await expect(page).toHaveURL(/\/login\?next=%2Fhistory$/);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill("WrongPassword2026");
    await page.getByRole("main").getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("The email address or password is wrong")).toBeVisible();

    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("main").getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/history$/);
  });

  test("logging out ends the session", async ({ page, user }) => {
    void user;
    await page.getByRole("button", { name: /^Account:/ }).click();
    await page.getByRole("button", { name: "Log out" }).click();

    await expect(page).toHaveURL(/\/$/);
    await page.goto("/classify");
    await expect(page).toHaveURL(/\/login\?next=%2Fclassify$/);
  });

  test("the admin page is only for admins", async ({ page, user }) => {
    void user;
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(404);
  });

  test("an admin sees the admin menu", async ({ page }) => {
    await logIn(page, ADMIN.email, ADMIN.password);

    await page.getByRole("link", { name: "Admin" }).click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Admin");
  });
});

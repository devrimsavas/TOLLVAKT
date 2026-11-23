import { emailsTo, expect, newUser, register, test } from "./fixtures";

test.describe("password reset", () => {
  test("a link by email lets the user choose a new password", async ({ page, request }) => {
    const user = newUser();
    await register(request, user);

    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    // The login page has an Email field too: wait for the new page
    await expect(page).toHaveURL(/\/forgot-password$/);
    await page.getByLabel("Email").fill(user.email);
    await page.getByRole("button", { name: "Send link" }).click();
    await expect(page.getByText(/a link to choose a new password is on its way/)).toBeVisible();

    await expect.poll(async () => (await emailsTo(request, user.email)).length).toBe(1);
    const [email] = await emailsTo(request, user.email);
    expect(email!.subject).toBe("Reset your Tollvakt password");
    const link = email!.text.match(/https?:\/\/\S+/)![0];

    await page.goto(link);
    await page.getByLabel("New password").fill("BrandNewSecure2026");
    await page.getByLabel("Repeat password").fill("BrandNewSecure2026");
    await page.getByRole("button", { name: "Save the new password" }).click();
    await expect(page.getByText("Your password has been changed")).toBeVisible();

    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill("BrandNewSecure2026");
    await page.getByRole("main").getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/classify$/);
  });

  test("a used or made-up link is refused", async ({ page }) => {
    await page.goto("/reset-password?token=made-up");

    await expect(page.getByText("This link no longer works")).toBeVisible();
  });
});

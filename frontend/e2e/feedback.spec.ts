import type { APIRequestContext } from "@playwright/test";
import { emailsTo, expect, test } from "./fixtures";

// FEEDBACK_EMAIL of the API in the tests (backend/tests/e2e/e2e.env)
const OWNER = "owner@e2e.example.com";

// The feedback the API has emailed to the owner, oldest first
async function feedbackEmails(request: APIRequestContext) {
  return (await emailsTo(request, OWNER)) as { subject: string; text: string; replyTo?: string }[];
}

test.describe("feedback", () => {
  test("a visitor sends anonymous feedback from the footer", async ({ page, request }) => {
    const before = (await feedbackEmails(request)).length;
    await page.goto("/");
    await page.getByRole("contentinfo").getByRole("link", { name: "Feedback" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Feedback");

    await page.getByLabel("Your message").fill("Please add the chapter notes, anonymous test.");
    await page.getByRole("button", { name: "Send feedback" }).click();

    await expect(page.getByText("Thank you! Your feedback has been sent anonymously.")).toBeVisible();
    await expect.poll(async () => (await feedbackEmails(request)).length).toBe(before + 1);
    const email = (await feedbackEmails(request)).at(-1)!;
    expect(email.subject).toBe("Tollvakt feedback: Idea (anonymous)");
    expect(email.text).toContain("Please add the chapter notes, anonymous test.");
    expect(email.replyTo).toBeUndefined();
  });

  test("with an email the owner can answer, and the form can be used again", async ({ page, request }) => {
    await page.goto("/feedback");

    await page.getByLabel("Something is wrong").check();
    await page.getByLabel("Your message").fill("The yoga mat got the wrong code.");
    await page.getByLabel("Your email (optional)").fill("kari@example.com");
    await page.getByRole("button", { name: "Send feedback" }).click();

    await expect(page.getByText("Thank you! Your feedback has been sent.")).toBeVisible();
    await expect
      .poll(async () => (await feedbackEmails(request)).at(-1)?.text ?? "")
      .toContain("The yoga mat got the wrong code.");
    const email = (await feedbackEmails(request)).at(-1)!;
    expect(email.subject).toBe("Tollvakt feedback: Problem (kari@example.com)");
    expect(email.replyTo).toBe("kari@example.com");

    await page.getByRole("button", { name: "Send more feedback" }).click();
    await expect(page.getByLabel("Your message")).toHaveValue("");
  });

  test("checks the message and the email before sending", async ({ page }) => {
    await page.goto("/feedback");

    await page.getByLabel("Your message").fill("Hi");
    await page.getByRole("button", { name: "Send feedback" }).click();
    await expect(page.getByText("Write at least 5 characters.")).toBeVisible();

    await page.getByLabel("Your message").fill("A longer message");
    await page.getByLabel("Your email (optional)").fill("not-an-email");
    await page.getByRole("button", { name: "Send feedback" }).click();
    await expect(page.getByText("Write a valid email address, or leave the field empty.")).toBeVisible();
    await expect(page.getByLabel("Your message")).toHaveValue("A longer message");
  });

  test("a logged-in user gets their email filled in", async ({ page, user }) => {
    await page.goto("/feedback");

    await expect(page.getByLabel("Your email (optional)")).toHaveValue(user.email);
  });
});

test.describe("feedback link in the menu", () => {
  test("is in the top menu for visitors", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("banner").getByRole("link", { name: "Feedback" }).click();

    await expect(page).toHaveURL(/\/feedback$/);
  });

  test("is in the app's menu for members", async ({ page, user }) => {
    void user;
    await page.goto("/classify");

    await page.getByRole("banner").getByRole("link", { name: "Feedback" }).click();

    await expect(page).toHaveURL(/\/feedback$/);
  });
});

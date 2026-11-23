import { randomUUID } from "node:crypto";
import {
  test as base,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { API_URL, CONTROL_URL } from "./settings";

export interface TestUser {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

// A new user for each test, so tests never depend on each other's data
export function newUser(): TestUser {
  return {
    firstName: "Ingrid",
    lastName: "Solberg",
    email: `e2e-${randomUUID()}@example.com`,
    password: "IngridSecure2026",
  };
}

export async function register(request: APIRequestContext, user: TestUser) {
  const res = await request.post(`${API_URL}/api/auth/register`, { data: user });
  expect(res.status()).toBe(201);
}

export async function logIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("main").getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/classify$/);
}

// Every guest of the test browser has the same address, so the day's usage
// is cleared before the tests that classify
export async function clearUsage(request: APIRequestContext) {
  const res = await request.delete(`${CONTROL_URL}/usage`);
  expect(res.status()).toBe(204);
}

// The emails the API has sent to an address
export async function emailsTo(
  request: APIRequestContext,
  to: string,
): Promise<{ to: string; subject: string; text: string }[]> {
  const res = await request.get(`${CONTROL_URL}/emails`, { params: { to } });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

interface Fixtures {
  // A newly registered user, logged in on the page. A test that only needs
  // to be logged in asks for it and marks it used with `void user`.
  user: TestUser;
}

export const test = base.extend<Fixtures>({
  // Every page fails its test if the browser blocks anything under the
  // content security policy, so a policy that is too strict is found here
  page: async ({ page }, use) => {
    const blocked: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy/i.test(message.text())) {
        blocked.push(message.text());
      }
    });
    await use(page);
    expect(blocked, "blocked by the content security policy").toEqual([]);
  },
  user: async ({ page, request }, use) => {
    const user = newUser();
    await register(request, user);
    await logIn(page, user.email, user.password);
    await use(user);
  },
});

export { expect };

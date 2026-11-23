import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function calculate(
  page: Page,
  input: { country: string; value: string; currency?: string; weight?: string; proof?: boolean },
) {
  await page.getByLabel("Origin country").selectOption({ label: input.country });
  await page.getByLabel("Currency").selectOption(input.currency ?? "EUR");
  await page.getByLabel("Value of the goods").fill(input.value);
  if (input.weight) await page.getByLabel("Net weight (kg)").fill(input.weight);
  if (input.proof) await page.getByLabel("I have a proof of origin").check();
  else await page.getByLabel("I have a proof of origin").uncheck();
  await page.getByRole("button", { name: "Calculate duty and VAT" }).click();
}

const row = (page: Page, name: string | RegExp) =>
  page.getByRole("row").filter({ has: page.getByRole("rowheader", { name }) });

test.describe("duty and VAT", () => {
  test("calculates the ordinary duty and VAT for an import", async ({ page, user }) => {
    void user;
    await page.goto("/search/61091000");

    await calculate(page, { country: "China", value: "1000" });

    await expect(page.getByRole("heading", { name: "Import from Kina" })).toBeVisible();
    await expect(row(page, /^Customs value/)).toContainText("11,500.00");
    await expect(row(page, /^Ordinary duty/)).toContainText("10.7 %");
    await expect(row(page, /^Ordinary duty/)).toContainText("1,230.50");
    await expect(row(page, /^Import VAT/)).toContainText("25 %");
    await expect(row(page, /^Duty and VAT in total/)).toContainText("4,413.13");
    await expect(page.getByText("1 EUR = 11.5 NOK")).toBeVisible();
    // The form keeps what was chosen, for the next calculation
    await expect(page.getByLabel("Origin country")).toHaveValue("CN");
    await expect(page.getByLabel("Currency")).toHaveValue("EUR");
    await expect(page.getByLabel("Value of the goods")).toHaveValue("1000");
  });

  test("shows what a proof of origin saves, and uses the preference with one", async ({ page, user }) => {
    void user;
    await page.goto("/search/61091000");

    await calculate(page, { country: "Türkiye", value: "1000" });
    await expect(page.getByText(/With a proof of origin, the duty would be NOK\s?1,230.50 lower/)).toBeVisible();
    await expect(row(page, /^Ordinary duty/)).toContainText("Used");

    await calculate(page, { country: "Türkiye", value: "1000", proof: true });
    await expect(row(page, /^Preferential duty/)).toContainText("Used");
    await expect(row(page, /^Duty and VAT in total/)).toContainText("2,875.00");
  });

  test("asks for the weight when the duty is per kg", async ({ page, user }) => {
    void user;
    await page.goto("/search/61101100");

    await calculate(page, { country: "China", value: "1000" });
    await expect(page.getByText("The duty is per kg: give the net weight to calculate it.")).toBeVisible();
    await expect(row(page, /^Duty and VAT in total/)).toContainText("Not calculated");

    await calculate(page, { country: "China", value: "1000", weight: "10" });
    await expect(row(page, /^Ordinary duty/)).toContainText("30 kr/kg");
    await expect(row(page, /^Ordinary duty/)).toContainText("300.00");
  });

  test("checks the form", async ({ page, user }) => {
    void user;
    await page.goto("/search/61091000");

    await page.getByRole("button", { name: "Calculate duty and VAT" }).click();
    await expect(page.getByText("Choose the origin country.")).toBeVisible();

    await page.getByLabel("Origin country").selectOption({ label: "China" });
    await page.getByLabel("Value of the goods").fill("a lot");
    await page.getByRole("button", { name: "Calculate duty and VAT" }).click();
    await expect(page.getByText("Give the value as a number")).toBeVisible();
  });

  test("says when there is no exchange rate for the currency", async ({ page, user }) => {
    void user;
    await page.goto("/search/61091000");

    await calculate(page, { country: "China", value: "1000", currency: "JPY" });

    await expect(page.getByText("Tolletaten has no exchange rate for this currency today.")).toBeVisible();
  });
});

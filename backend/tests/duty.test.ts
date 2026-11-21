import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { seedTariffData } from "./helpers/tariffData.js";

beforeEach(async () => {
  await seedTariffData();
});

const tshirt = {
  commodityCode: "6109.1000",
  originCountry: "tr",
  date: "2026-11-21",
  value: { amount: 10000, currency: "eur" },
  freight: { amount: 300, currency: "EUR" },
};

function calculate(body: object) {
  return request(app).post("/api/duty/calculate").send(body);
}

describe("POST /api/duty/calculate", () => {
  it("calculates duty and VAT with the tree path and a possible saving", async () => {
    const res = await calculate(tshirt);

    expect(res.status).toBe(200);
    expect(res.body.customsValueNok).toBe(107676.2);
    expect(res.body.duty.applied).toBe("ordinary");
    expect(res.body.duty.amountNok).toBe(11521.35);
    expect(res.body.duty.possibleSavingNok).toBe(11521.35);
    expect(res.body.vat).toMatchObject({ rate: 25, amountNok: 29799.39 });
    expect(res.body.totalNok).toBe(41320.74);
    expect(res.body.commodity.path.map((p: { code: string }) => p.code)).toEqual(["11", "6109"]);
    expect(res.body.origin).toEqual({ code: "TR", name: "Tyrkia" });
  });

  it("uses the preferential rate with a proof of origin", async () => {
    const res = await calculate({ ...tshirt, hasProofOfOrigin: true });

    expect(res.body.duty.applied).toBe("preferential");
    expect(res.body.duty.preferential.group).toBe("TTYR");
    expect(res.body.duty.amountNok).toBe(0);
  });

  it("gives no preference to a country outside the agreements", async () => {
    const res = await calculate({ ...tshirt, originCountry: "CN", hasProofOfOrigin: true });

    expect(res.body.duty.preferential).toBeNull();
    expect(res.body.duty.applied).toBe("ordinary");
  });

  it("picks the rate and exchange rate valid on the date", async () => {
    const beef = {
      commodityCode: "02011000",
      originCountry: "DE",
      value: { amount: 1000, currency: "EUR" },
      netWeightKg: 100,
    };
    const november = await calculate({ ...beef, date: "2026-11-21" });
    const december = await calculate({ ...beef, date: "2026-12-02" });

    expect(november.body.duty.amountNok).toBe(1200);
    expect(november.body.customsValueNok).toBe(10454);
    expect(december.body.duty.amountNok).toBe(3228);
    expect(december.body.customsValueNok).toBe(10532);
  });

  it("uses the food VAT rate and lists restrictions", async () => {
    const res = await calculate({
      commodityCode: "02011000",
      originCountry: "DE",
      date: "2026-11-21",
      value: { amount: 1000, currency: "EUR" },
      netWeightKg: 100,
    });

    expect(res.body.vat.rate).toBe(15);
    expect(res.body.restrictions[0]).toMatchObject({ restrictionType: "V5", groupCode: "RALL" });
  });

  it("asks for the weight when a rate is per kg", async () => {
    const res = await calculate({
      commodityCode: "02011000",
      originCountry: "DE",
      date: "2026-11-21",
      value: { amount: 1000, currency: "EUR" },
    });

    expect(res.status).toBe(200);
    expect(res.body.duty.ordinary.missing).toBe("netWeightKg");
    expect(res.body.totalNok).toBeNull();
  });

  it("answers 404 for an unknown code or country", async () => {
    expect((await calculate({ ...tshirt, commodityCode: "99999999" })).status).toBe(404);
    expect((await calculate({ ...tshirt, originCountry: "XX" })).status).toBe(404);
  });

  it("answers 422 when there is no exchange rate for the currency or date", async () => {
    expect((await calculate({ ...tshirt, value: { amount: 1, currency: "TRY" } })).status).toBe(422);
    expect((await calculate({ ...tshirt, date: "2027-06-01" })).status).toBe(422);
  });

  it.each([
    ["the code is too short", { commodityCode: "6109" }],
    ["the country is not 2 letters", { originCountry: "TUR" }],
    ["the date is not a real date", { date: "2026-02-30" }],
    ["the value is missing", { value: undefined }],
    ["the amount is negative", { value: { amount: -1, currency: "EUR" } }],
    ["the currency is not 3 letters", { value: { amount: 1, currency: "EURO" } }],
    ["the weight is not a number", { netWeightKg: "100" }],
    ["proof of origin is not a boolean", { hasProofOfOrigin: "yes" }],
  ])("answers 400 when %s", async (_case, override) => {
    const res = await calculate({ ...tshirt, ...override });

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
  });
});

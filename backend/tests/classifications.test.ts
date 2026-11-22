import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { FakeLlm, type JsonRequest } from "../src/services/llm/llm.js";
import { kari, lukas, registerAndLogin } from "./helpers/users.js";
import { seedEmbeddings, seedTariffData } from "./helpers/tariffData.js";

function fakeModel(suggestions: Record<string, unknown>[]) {
  FakeLlm.answer = (req: JsonRequest) =>
    "suggestions" in req.schema.properties
      ? { suggestions, missingInformation: ["Er den strikket?"] }
      : { nb: "t-skjorter av bomull", en: "cotton t-shirts" };
}

function classify(auth: Record<string, string>, description = "T-skjorte i bomull") {
  return request(app).post("/api/classify").set(auth).send({ description, lang: "nb" });
}

describe("saved classifications", () => {
  beforeEach(async () => {
    await seedTariffData();
    await seedEmbeddings();
    fakeModel([{ code: "61091000", reason: "Strikket t-skjorte av bomull", confidence: "high" }]);
  });

  afterEach(() => {
    FakeLlm.answer = () => ({});
  });

  it("saves a member's classification as it was answered", async () => {
    const { auth } = await registerAndLogin(kari);

    const made = await classify(auth);
    expect(made.status).toBe(200);
    expect(made.body.id).toMatch(/^[0-9a-f-]{36}$/);

    const res = await request(app).get(`/api/classifications/${made.body.id}`).set(auth);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: made.body.id,
      description: "T-skjorte i bomull",
      lang: "nb",
      model: "fake",
      rewritten: { nb: "t-skjorter av bomull", en: "cotton t-shirts" },
      suggestions: made.body.suggestions,
      missingInformation: ["Er den strikket?"],
      candidates: made.body.candidates,
      createdAt: made.body.createdAt,
    });
  });

  it("does not save a guest's classification", async () => {
    const res = await classify({});

    expect(res.status).toBe(200);
    expect(res.body.id).toBeNull();
  });

  it("lists the member's classifications newest first, with the first suggestion", async () => {
    const { auth } = await registerAndLogin(kari);
    await classify(auth, "T-skjorte i bomull");
    fakeModel([]);
    await classify(auth, "Noe helt annet");

    const res = await request(app).get("/api/classifications").set(auth);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((item: { description: string }) => item.description)).toEqual([
      "Noe helt annet",
      "T-skjorte i bomull",
    ]);
    expect(res.body.items[0]).toMatchObject({ topSuggestion: null, suggestionCount: 0 });
    expect(res.body.items[1]).toMatchObject({
      topSuggestion: { code: "61091000", confidence: "high" },
      suggestionCount: 1,
    });
  });

  it("pages the list", async () => {
    const { auth } = await registerAndLogin(kari);
    for (const description of ["a1", "a2", "a3"]) await classify(auth, description);

    const res = await request(app).get("/api/classifications").query({ limit: 2, offset: 2 }).set(auth);

    expect(res.body.total).toBe(3);
    expect(res.body.items.map((item: { description: string }) => item.description)).toEqual(["a1"]);
  });

  it("checks limit and offset", async () => {
    const { auth } = await registerAndLogin(kari);

    expect((await request(app).get("/api/classifications").query({ limit: 0 }).set(auth)).status).toBe(400);
    expect((await request(app).get("/api/classifications").query({ offset: -1 }).set(auth)).status).toBe(400);
  });

  it("deletes a classification", async () => {
    const { auth } = await registerAndLogin(kari);
    const made = await classify(auth);

    const res = await request(app).delete(`/api/classifications/${made.body.id}`).set(auth);

    expect(res.status).toBe(204);
    expect((await request(app).get(`/api/classifications/${made.body.id}`).set(auth)).status).toBe(404);
  });

  it("never shows or deletes another member's classification", async () => {
    const owner = await registerAndLogin(kari);
    const other = await registerAndLogin(lukas);
    const made = await classify(owner.auth);

    expect((await request(app).get(`/api/classifications/${made.body.id}`).set(other.auth)).status).toBe(404);
    expect((await request(app).delete(`/api/classifications/${made.body.id}`).set(other.auth)).status).toBe(404);
    expect((await request(app).get("/api/classifications").set(other.auth)).body.total).toBe(0);
    expect((await request(app).get(`/api/classifications/${made.body.id}`).set(owner.auth)).status).toBe(200);
  });

  it("answers 404 for an id that is not a uuid", async () => {
    const { auth } = await registerAndLogin(kari);

    expect((await request(app).get("/api/classifications/123").set(auth)).status).toBe(404);
  });

  it("requires a login", async () => {
    expect((await request(app).get("/api/classifications")).status).toBe(401);
  });
});

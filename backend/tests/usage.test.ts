import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { FakeLlm, LlmError, type JsonRequest } from "../src/services/llm/llm.js";
import { sequelize } from "../src/config/database.js";
import { kari, lukas, registerAndLogin } from "./helpers/users.js";
import { seedEmbeddings, seedTariffData } from "./helpers/tariffData.js";

const answer = {
  suggestions: [{ code: "61091000", reason: "Strikket t-skjorte av bomull", confidence: "high" }],
  missingInformation: [],
};

function fakeModel() {
  FakeLlm.answer = (req: JsonRequest) =>
    "suggestions" in req.schema.properties ? answer : { nb: "t-skjorter av bomull", en: "cotton t-shirts" };
}

function classify(headers: Record<string, string> = {}, forwardedFor?: string) {
  const req = request(app).post("/api/classify").set(headers);
  if (forwardedFor) req.set("X-Forwarded-For", forwardedFor);
  return req.send({ description: "T-skjorte i bomull", lang: "nb" });
}

async function usageRows() {
  const [rows] = await sequelize.query("SELECT user_id, client_hash, kind FROM usage_events ORDER BY id");
  return rows as { user_id: number | null; client_hash: string | null; kind: string }[];
}

describe("daily quotas", () => {
  beforeEach(async () => {
    await seedTariffData();
    await seedEmbeddings();
    fakeModel();
    vi.stubEnv("GUEST_DAILY_LIMIT", "1");
    vi.stubEnv("USER_DAILY_LIMIT", "2");
    vi.stubEnv("GLOBAL_DAILY_LIMIT", "100");
  });

  afterEach(() => {
    FakeLlm.answer = () => ({});
    vi.unstubAllEnvs();
  });

  it("lets a guest classify once a day, then answers 429 with when it starts again", async () => {
    const first = await classify();
    expect(first.status).toBe(200);
    expect(first.body.id).toBeNull();
    expect(first.body.usage).toMatchObject({ scope: "guest", limit: 1, used: 1, remaining: 0 });

    const second = await classify();
    expect(second.status).toBe(429);
    expect(second.body).toMatchObject({ scope: "guest", limit: 1 });
    expect(second.body.error).toContain("Register");
    expect(Date.parse(second.body.resetsAt)).toBeGreaterThan(Date.now());
    expect(Number(second.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("counts guests by address, and never stores the address itself", async () => {
    expect((await classify({}, "10.0.0.1")).status).toBe(200);
    expect((await classify({}, "10.0.0.2")).status).toBe(200);
    expect((await classify({}, "10.0.0.1")).status).toBe(429);

    const rows = await usageRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]!.client_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]!.client_hash).not.toBe(rows[1]!.client_hash);
    expect(JSON.stringify(rows)).not.toContain("10.0.0.1");
  });

  it("gives a member the member limit, separate from the guest quota of the same address", async () => {
    expect((await classify()).status).toBe(200);
    const { auth } = await registerAndLogin(kari);

    const first = await classify(auth);
    expect(first.status).toBe(200);
    expect(first.body.usage).toMatchObject({ scope: "user", limit: 2, used: 1, remaining: 1 });
    expect((await classify(auth)).status).toBe(200);

    const third = await classify(auth);
    expect(third.status).toBe(429);
    expect(third.body).toMatchObject({ scope: "user", limit: 2 });
  });

  it("uses a member's own limit when an admin set one", async () => {
    const { auth } = await registerAndLogin(kari);
    await User.update({ dailyLimit: 0 }, { where: { email: kari.email } });

    const res = await classify(auth);

    expect(res.status).toBe(429);
    expect(res.body.limit).toBe(0);
  });

  it("stops everyone at the global limit", async () => {
    vi.stubEnv("GLOBAL_DAILY_LIMIT", "2");
    const a = await registerAndLogin(kari);
    const b = await registerAndLogin(lukas);
    expect((await classify(a.auth)).status).toBe(200);
    expect((await classify(b.auth)).status).toBe(200);

    const res = await classify(a.auth);

    expect(res.status).toBe(429);
    expect(res.body.scope).toBe("global");
  });

  it("gives admins no limit of their own", async () => {
    vi.stubEnv("USER_DAILY_LIMIT", "0");
    await registerAndLogin(kari);
    await User.update({ role: "admin" }, { where: { email: kari.email } });
    const login = await request(app).post("/api/auth/login").send({ email: kari.email, password: kari.password });

    const res = await classify({ Authorization: `Bearer ${login.body.token}` });

    expect(res.status).toBe(200);
    expect(res.body.usage).toMatchObject({ limit: null, remaining: null, used: 1 });
  });

  it("gives the place back when the model fails", async () => {
    FakeLlm.answer = () => {
      throw new LlmError("model down");
    };

    const res = await classify();

    expect(res.status).toBe(503);
    expect(await usageRows()).toHaveLength(0);
    fakeModel();
    expect((await classify()).status).toBe(200);
  });

  it("refuses an invalid token instead of treating the caller as a guest", async () => {
    const res = await classify({ Authorization: "Bearer not-a-token" });

    expect(res.status).toBe(401);
    expect(await usageRows()).toHaveLength(0);
  });

  it("does not let two requests at once take the last place", async () => {
    const results = await Promise.all([classify(), classify(), classify()]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 429, 429]);
    expect(await usageRows()).toHaveLength(1);
  });

  describe("search", () => {
    function search(mode: string, q = "t-skjorte bomull") {
      return request(app).get("/api/commodities/search").query({ q, mode });
    }

    it("counts the model-backed modes and leaves text and code search free", async () => {
      expect((await search("text")).status).toBe(200);
      expect((await search("semantic", "6109")).status).toBe(200);
      expect(await usageRows()).toHaveLength(0);

      expect((await search("semantic")).status).toBe(200);
      expect((await usageRows()).map((r) => r.kind)).toEqual(["search"]);

      const res = await search("expanded");
      expect(res.status).toBe(429);
      // Text search still works with the quota used up
      expect((await search("text")).status).toBe(200);
    });

    it("shares the quota with classification", async () => {
      expect((await search("hybrid")).status).toBe(200);

      expect((await classify()).status).toBe(429);
    });
  });

  describe("GET /api/usage", () => {
    it("shows a guest's quota", async () => {
      await classify();

      const res = await request(app).get("/api/usage");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ scope: "guest", limit: 1, used: 1, remaining: 0 });
      expect(Date.parse(res.body.resetsAt)).toBeGreaterThan(Date.now());
    });

    it("shows a member's quota", async () => {
      const { auth } = await registerAndLogin(kari);
      await classify(auth);

      const res = await request(app).get("/api/usage").set(auth);

      expect(res.body).toMatchObject({ scope: "user", limit: 2, used: 1, remaining: 1 });
    });

    it("counts only today: yesterday's use is not in it", async () => {
      const { auth } = await registerAndLogin(kari);
      await classify(auth);
      await classify(auth);
      await sequelize.query("UPDATE usage_events SET created_at = created_at - interval '1 day'");

      const res = await request(app).get("/api/usage").set(auth);

      expect(res.body).toMatchObject({ used: 0, remaining: 2 });
      expect((await classify(auth)).status).toBe(200);
    });
  });
});

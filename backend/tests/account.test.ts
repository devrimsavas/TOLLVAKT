import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { sequelize } from "../src/config/database.js";
import { User } from "../src/models/User.js";
import { PasswordResetToken } from "../src/models/PasswordResetToken.js";
import { FakeLlm, type JsonRequest } from "../src/services/llm/llm.js";
import { kari, lukas, registerAndLogin } from "./helpers/users.js";
import { seedEmbeddings, seedTariffData } from "./helpers/tariffData.js";

function logIn(email: string, password: string) {
  return request(app).post("/api/auth/login").send({ email, password });
}

function classify(auth: Record<string, string>) {
  return request(app).post("/api/classify").set(auth).send({ description: "T-skjorte i bomull" });
}

async function count(table: string, where = "true"): Promise<number> {
  const [rows] = await sequelize.query(`SELECT count(*) AS n FROM ${table} WHERE ${where}`);
  return Number((rows as { n: string }[])[0]!.n);
}

beforeEach(async () => {
  await seedTariffData();
  await seedEmbeddings();
  FakeLlm.answer = (req: JsonRequest) =>
    "suggestions" in req.schema.properties
      ? { suggestions: [{ code: "61091000", reason: "Strikket", confidence: "high" }], missingInformation: [] }
      : { nb: "t-skjorter", en: "t-shirts" };
});

afterEach(() => {
  FakeLlm.answer = () => ({});
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("account endpoints need a login", () => {
  it.each([
    ["delete", "/api/auth/me"],
    ["post", "/api/auth/me/password"],
    ["get", "/api/auth/me/export"],
    ["patch", "/api/auth/me/preferences"],
  ] as const)("%s %s answers 401 without a token", async (method, path) => {
    expect((await request(app)[method](path)).status).toBe(401);
  });
});

describe("POST /api/auth/me/password", () => {
  it("changes the password and gives this device a new token", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .post("/api/auth/me/password")
      .set(auth)
      .send({ currentPassword: lukas.password, newPassword: "BrandNewPassword1" });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect((await logIn(lukas.email, "BrandNewPassword1")).status).toBe(200);
    expect((await logIn(lukas.email, lukas.password)).status).toBe(401);
    const me = await request(app).get("/api/auth/me").set({ Authorization: `Bearer ${res.body.token}` });
    expect(me.status).toBe(200);
  });

  it("ends every other session, even one from the same second", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-22T10:00:00.100Z"));
    const { auth: here } = await registerAndLogin(lukas);
    const other = await logIn(lukas.email, lukas.password);

    vi.setSystemTime(new Date("2026-11-22T10:00:00.500Z"));
    await request(app)
      .post("/api/auth/me/password")
      .set(here)
      .send({ currentPassword: lukas.password, newPassword: "BrandNewPassword1" })
      .expect(200);

    const res = await request(app).get("/api/auth/me").set({ Authorization: `Bearer ${other.body.token}` });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("The password has changed. Log in again.");
  });

  it("refuses a wrong current password and keeps the old one", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .post("/api/auth/me/password")
      .set(auth)
      .send({ currentPassword: "WrongPassword1", newPassword: "BrandNewPassword1" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("The password is wrong");
    expect((await logIn(lukas.email, lukas.password)).status).toBe(200);
  });

  it("refuses a short new password", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .post("/api/auth/me/password")
      .set(auth)
      .send({ currentPassword: lukas.password, newPassword: "short" });

    expect(res.status).toBe(400);
  });

  it("is limited after too many wrong passwords", async () => {
    vi.stubEnv("PASSWORD_CHECK_FAILURES_PER_ACCOUNT", "2");
    const { auth } = await registerAndLogin({ ...kari, email: "kari.limit@example.com" });
    const attempt = (currentPassword: string) =>
      request(app).post("/api/auth/me/password").set(auth).send({ currentPassword, newPassword: "BrandNewPassword1" });

    await attempt("WrongPassword1").expect(401);
    await attempt("WrongPassword1").expect(401);

    expect((await attempt(kari.password)).status).toBe(429);
  });
});

describe("PATCH /api/auth/me/preferences", () => {
  it("sets the language", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app).patch("/api/auth/me/preferences").set(auth).send({ language: "en" });

    expect(res.status).toBe(200);
    expect(res.body.language).toBe("en");
    expect((await request(app).get("/api/auth/me").set(auth)).body.language).toBe("en");
  });

  it("refuses an unknown language", async () => {
    const { auth } = await registerAndLogin(lukas);

    expect((await request(app).patch("/api/auth/me/preferences").set(auth).send({ language: "tr" })).status).toBe(400);
  });
});

describe("GET /api/auth/me/export", () => {
  it("downloads everything stored about the user as a JSON file", async () => {
    const { auth, userId } = await registerAndLogin(lukas);
    const made = await classify(auth);

    const res = await request(app).get("/api/auth/me/export").set(auth);

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="?tollvakt-data-\d{4}-\d{2}-\d{2}\.json"?/);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.format).toBe("tollvakt-export/1");
    expect(res.body.user).toMatchObject({ userId, email: lukas.email, firstName: lukas.firstName, role: "user" });
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(res.body.user).not.toHaveProperty("id");
    expect(res.body.classifications).toHaveLength(1);
    expect(res.body.classifications[0]).toMatchObject({
      classificationId: made.body.id,
      description: "T-skjorte i bomull",
      suggestions: made.body.suggestions,
    });
    expect(res.body.usage).toEqual([{ kind: "classify", at: expect.any(String) }]);
  });

  it("holds nothing of other users", async () => {
    const other = await registerAndLogin(kari);
    await classify(other.auth);
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app).get("/api/auth/me/export").set(auth);

    expect(res.body.classifications).toEqual([]);
    expect(res.body.usage).toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain(kari.email);
  });
});

describe("DELETE /api/auth/me", () => {
  it("deletes the account and its classifications, and keeps today's use counted without the user", async () => {
    const { auth } = await registerAndLogin(lukas);
    await classify(auth);
    const user = (await User.findOne({ where: { email: lukas.email } }))!;
    await PasswordResetToken.create({ userId: user.id, tokenHash: "a".repeat(64), expiresAt: new Date(Date.now() + 60000) });

    const res = await request(app).delete("/api/auth/me").set(auth).send({ password: lukas.password });

    expect(res.status).toBe(204);
    expect(await User.count({ where: { id: user.id } })).toBe(0);
    expect(await count("classifications")).toBe(0);
    expect(await count("password_reset_tokens")).toBe(0);
    // The usage row stays for the global limit, pointing to no one
    expect(await count("usage_events", "user_id IS NULL AND client_hash IS NULL")).toBe(1);
    expect((await request(app).get("/api/auth/me").set(auth)).status).toBe(404);
    expect((await logIn(lukas.email, lukas.password)).status).toBe(401);
  });

  it("keeps other users' data", async () => {
    const lukasSession = await registerAndLogin(lukas);
    const kariSession = await registerAndLogin(kari);
    await classify(lukasSession.auth);
    await classify(kariSession.auth);

    await request(app).delete("/api/auth/me").set(lukasSession.auth).send({ password: lukas.password }).expect(204);

    expect((await request(app).get("/api/classifications").set(kariSession.auth)).body.total).toBe(1);
  });

  it("frees the email, so a new account can be made with it", async () => {
    const { auth } = await registerAndLogin(lukas);
    await request(app).delete("/api/auth/me").set(auth).send({ password: lukas.password }).expect(204);

    expect((await request(app).post("/api/auth/register").send(lukas)).status).toBe(201);
  });

  it("refuses a wrong password, or none, and deletes nothing", async () => {
    const { auth } = await registerAndLogin(lukas);

    expect((await request(app).delete("/api/auth/me").set(auth).send({ password: "WrongPassword1" })).status).toBe(401);
    expect((await request(app).delete("/api/auth/me").set(auth)).status).toBe(401);
    expect(await User.count({ where: { email: lukas.email } })).toBe(1);
  });

  it("never deletes the last admin, but another admin can go", async () => {
    await registerAndLogin(lukas);
    await User.update({ role: "admin" }, { where: { email: lukas.email } });
    const login = await logIn(lukas.email, lukas.password);
    const lukasAuth = { Authorization: `Bearer ${login.body.token}` };

    const refused = await request(app).delete("/api/auth/me").set(lukasAuth).send({ password: lukas.password });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe("The last admin account cannot be deleted");

    await registerAndLogin(kari);
    await User.update({ role: "admin" }, { where: { email: kari.email } });
    const allowed = await request(app).delete("/api/auth/me").set(lukasAuth).send({ password: lukas.password });
    expect(allowed.status).toBe(204);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { FakeLlm, type JsonRequest } from "../src/services/llm/llm.js";
import { sequelize } from "../src/config/database.js";
import { kari, lukas, registerAndLogin, type TestUserInput } from "./helpers/users.js";
import { seedEmbeddings, seedTariffData } from "./helpers/tariffData.js";

// Registers the user, makes them admin and logs in again: the role is read
// from the token
async function loginAsAdmin(user: TestUserInput) {
  const { userId } = await registerAndLogin(user);
  await User.update({ role: "admin" }, { where: { email: user.email } });
  const login = await request(app).post("/api/auth/login").send({ email: user.email, password: user.password });
  return { userId, auth: { Authorization: `Bearer ${login.body.token}` } };
}

function classify(auth: Record<string, string> = {}) {
  return request(app).post("/api/classify").set(auth).send({ description: "T-skjorte i bomull" });
}

describe("admin", () => {
  beforeEach(async () => {
    await seedTariffData();
    await seedEmbeddings();
    FakeLlm.answer = (req: JsonRequest) =>
      "suggestions" in req.schema.properties
        ? { suggestions: [{ code: "61091000", reason: "a", confidence: "high" }], missingInformation: [] }
        : { nb: "t-skjorter", en: "t-shirts" };
    vi.stubEnv("USER_DAILY_LIMIT", "10");
    vi.stubEnv("GUEST_DAILY_LIMIT", "1");
    vi.stubEnv("GLOBAL_DAILY_LIMIT", "200");
  });

  afterEach(() => {
    FakeLlm.answer = () => ({});
    vi.unstubAllEnvs();
  });

  it("is for admins only", async () => {
    const member = await registerAndLogin(kari);

    expect((await request(app).get("/api/admin/users")).status).toBe(401);
    expect((await request(app).get("/api/admin/users").set(member.auth)).status).toBe(403);
    expect((await request(app).get("/api/admin/usage").set(member.auth)).status).toBe(403);
    expect((await request(app).patch(`/api/admin/users/${member.userId}`).set(member.auth).send({ isActive: false })).status).toBe(403);
  });

  it("lists the accounts with their limits and today's use", async () => {
    const admin = await loginAsAdmin(lukas);
    const member = await registerAndLogin(kari);
    await classify(member.auth);
    await classify(member.auth);

    const res = await request(app).get("/api/admin/users").set(admin.auth);

    expect(res.status).toBe(200);
    const kariRow = res.body.find((u: { email: string }) => u.email === kari.email);
    expect(kariRow).toMatchObject({
      userId: member.userId,
      role: "user",
      isActive: true,
      dailyLimit: null,
      effectiveDailyLimit: 10,
      usedToday: 2,
      classificationCount: 2,
    });
    expect(kariRow).not.toHaveProperty("passwordHash");
    const adminRow = res.body.find((u: { email: string }) => u.email === lukas.email);
    expect(adminRow).toMatchObject({ role: "admin", effectiveDailyLimit: null });
  });

  it("changes a member's daily limit, and back to the default", async () => {
    const admin = await loginAsAdmin(lukas);
    const member = await registerAndLogin(kari);

    const set = await request(app).patch(`/api/admin/users/${member.userId}`).set(admin.auth).send({ dailyLimit: 25 });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ dailyLimit: 25, effectiveDailyLimit: 25 });
    expect((await request(app).get("/api/usage").set(member.auth)).body.limit).toBe(25);

    const reset = await request(app).patch(`/api/admin/users/${member.userId}`).set(admin.auth).send({ dailyLimit: null });
    expect(reset.body).toMatchObject({ dailyLimit: null, effectiveDailyLimit: 10 });
  });

  it("checks the changes", async () => {
    const admin = await loginAsAdmin(lukas);
    const member = await registerAndLogin(kari);
    const patch = (body: unknown) => request(app).patch(`/api/admin/users/${member.userId}`).set(admin.auth).send(body as object);

    expect((await patch({})).status).toBe(400);
    expect((await patch({ dailyLimit: -1 })).status).toBe(400);
    expect((await patch({ dailyLimit: 2.5 })).status).toBe(400);
    expect((await patch({ dailyLimit: "5" })).status).toBe(400);
    expect((await patch({ isActive: "no" })).status).toBe(400);
    expect((await request(app).patch("/api/admin/users/not-a-uuid").set(admin.auth).send({ isActive: false })).status).toBe(404);
  });

  it("closes an account: no login, and the token it had stops working", async () => {
    const admin = await loginAsAdmin(lukas);
    const member = await registerAndLogin(kari);

    const res = await request(app).patch(`/api/admin/users/${member.userId}`).set(admin.auth).send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);

    expect((await request(app).get("/api/auth/me").set(member.auth)).status).toBe(403);
    expect((await classify(member.auth)).status).toBe(403);
    const login = await request(app).post("/api/auth/login").send({ email: kari.email, password: kari.password });
    expect(login.status).toBe(403);
    expect(login.body.token).toBeUndefined();

    // Reopened, the member can log in again
    await request(app).patch(`/api/admin/users/${member.userId}`).set(admin.auth).send({ isActive: true });
    expect((await request(app).post("/api/auth/login").send({ email: kari.email, password: kari.password })).status).toBe(200);
  });

  it("does not tell a stranger that a closed account exists", async () => {
    const admin = await loginAsAdmin(lukas);
    const member = await registerAndLogin(kari);
    await request(app).patch(`/api/admin/users/${member.userId}`).set(admin.auth).send({ isActive: false });

    const res = await request(app).post("/api/auth/login").send({ email: kari.email, password: "WrongPassword1" });

    expect(res.status).toBe(401);
  });

  it("does not let an admin close their own account", async () => {
    const admin = await loginAsAdmin(lukas);

    const res = await request(app).patch(`/api/admin/users/${admin.userId}`).set(admin.auth).send({ isActive: false });

    expect(res.status).toBe(400);
  });

  it("shows the use per day and today's total against the global limit", async () => {
    const admin = await loginAsAdmin(lukas);
    const member = await registerAndLogin(kari);
    await classify(member.auth);
    await classify();
    await request(app).get("/api/commodities/search").set(member.auth).query({ q: "bomull", mode: "semantic" });
    // One classification two days ago
    await classify(member.auth);
    await sequelize.query(
      "UPDATE usage_events SET created_at = created_at - interval '2 days' WHERE id = (SELECT max(id) FROM usage_events)",
    );

    const res = await request(app).get("/api/admin/usage").query({ days: 7 }).set(admin.auth);

    expect(res.status).toBe(200);
    expect(res.body.limits).toEqual({ guest: 1, user: 10, global: 200 });
    expect(res.body.today).toEqual({ used: 3, globalLimit: 200, remaining: 197 });
    expect(res.body.days).toHaveLength(7);
    expect(res.body.days[6]).toMatchObject({ classify: 2, search: 1, members: 1, guests: 1 });
    expect(res.body.days[4]).toMatchObject({ classify: 1, search: 0, members: 1, guests: 0 });
    expect(res.body.days[0]).toMatchObject({ classify: 0, search: 0 });
    expect(res.body.days[6].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("checks days", async () => {
    const admin = await loginAsAdmin(lukas);

    expect((await request(app).get("/api/admin/usage").query({ days: 0 }).set(admin.auth)).status).toBe(400);
    expect((await request(app).get("/api/admin/usage").query({ days: 91 }).set(admin.auth)).status).toBe(400);
  });
});

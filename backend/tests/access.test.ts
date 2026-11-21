import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { requireAuth } from "../src/middlewares/requireAuth.js";
import { requireRole } from "../src/middlewares/requireRole.js";
import { ensureAdmin } from "../src/config/ensureAdmin.js";
import { kari, lukas, registerAndLogin } from "./helpers/users.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

// A small app with an admin-only route, to test requireRole on its own
const adminOnly = express();
adminOnly.get("/admin", requireAuth, requireRole("admin"), (req, res) => {
  res.json({ ok: true, role: req.auth?.role });
});

describe("requireRole", () => {
  it("refuses a normal user with 403", async () => {
    const { auth } = await registerAndLogin(kari);

    const res = await request(adminOnly).get("/admin").set(auth);

    expect(res.status).toBe(403);
  });

  it("lets an admin through", async () => {
    const { auth } = await registerAndLogin(kari);
    await User.update({ role: "admin" }, { where: { email: kari.email } });
    // The role is read from the token, so the user logs in again
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: kari.email, password: kari.password });

    const res = await request(adminOnly)
      .get("/admin")
      .set({ Authorization: `Bearer ${login.body.token}` });

    expect(auth).toBeDefined();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, role: "admin" });
  });
});

describe("requireAuth", () => {
  it("refuses a token from before the last password change", async () => {
    const { auth } = await registerAndLogin(kari);
    await User.update(
      { passwordChangedAt: new Date(Date.now() + 1000) },
      { where: { email: kari.email } },
    );

    const res = await request(app).get("/api/auth/me").set(auth);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/password has changed/);
  });
});

describe("ensureAdmin", () => {
  function stubAdminEnv(overrides: Record<string, string> = {}) {
    const values = {
      ADMIN_EMAIL: " Admin@Example.com ",
      ADMIN_PASSWORD: "AdminSecure2026",
      ADMIN_FIRST_NAME: "Ada",
      ADMIN_LAST_NAME: "Admin",
      ...overrides,
    };
    for (const [key, value] of Object.entries(values)) {
      vi.stubEnv(key, value);
    }
  }

  it("creates the admin once, with a normalized email", async () => {
    stubAdminEnv();

    await ensureAdmin();
    await ensureAdmin();

    const admins = await User.findAll({ where: { role: "admin" } });
    expect(admins).toHaveLength(1);
    expect(admins[0]?.email).toBe("admin@example.com");
  });

  it("lets the admin log in with the configured password", async () => {
    stubAdminEnv();
    await ensureAdmin();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "AdminSecure2026" });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("admin");
  });

  it("does nothing when the variables are missing", async () => {
    stubAdminEnv({ ADMIN_PASSWORD: "" });

    await ensureAdmin();

    expect(await User.count()).toBe(0);
  });

  it("does nothing when the password is too short", async () => {
    stubAdminEnv({ ADMIN_PASSWORD: "short" });

    await ensureAdmin();

    expect(await User.count()).toBe(0);
  });

  it("never promotes an existing normal user", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ ...lukas, email: "admin@example.com" });
    stubAdminEnv();

    await ensureAdmin();

    const user = await User.findOne({ where: { email: "admin@example.com" } });
    expect(user?.role).toBe("user");
    expect(await User.count({ where: { role: "admin" } })).toBe(0);
  });
});

describe("login rate limit", () => {
  it("blocks an account after too many wrong passwords, with a retry time", async () => {
    vi.stubEnv("LOGIN_FAILURES_PER_ACCOUNT", "2");
    // An email used only here, since the counts live in memory across tests
    const user = { ...kari, email: "limit.test@example.com" };
    await request(app).post("/api/auth/register").send(user);

    const wrong = { email: user.email, password: "WrongPassword1" };
    await request(app).post("/api/auth/login").send(wrong).expect(401);
    await request(app).post("/api/auth/login").send(wrong).expect(401);
    const blocked = await request(app).post("/api/auth/login").send(wrong);

    expect(blocked.status).toBe(429);
    expect(blocked.body.retryAfterSeconds).toBeGreaterThan(0);
  });
});

import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { PasswordResetToken } from "../src/models/PasswordResetToken.js";
import { getEmailSender, setEmailSender, type Email } from "../src/services/email/emailSender.js";
import { kari, lukas, registerAndLogin } from "./helpers/users.js";

let sent: Email[] = [];

beforeEach(() => {
  sent = [];
  setEmailSender({ send: async (email) => void sent.push(email) });
});

afterEach(() => {
  setEmailSender(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function askForReset(email: string, language?: string) {
  return request(app)
    .post("/api/auth/password-reset")
    .send({ email, ...(language ? { language } : {}) });
}

// The email is sent after the answer, so the tests wait for it
async function waitForEmail(count = 1): Promise<Email> {
  await vi.waitFor(() => expect(sent).toHaveLength(count));
  return sent[count - 1]!;
}

function tokenFrom(email: Email): string {
  const link = email.text.match(/https?:\/\/\S+/)?.[0];
  return new URL(link!).searchParams.get("token")!;
}

async function resetTokenFor(email: string): Promise<string> {
  await askForReset(email).expect(202);
  return tokenFrom(await waitForEmail(sent.length + 1));
}

function confirm(token: unknown, password: string) {
  return request(app).post("/api/auth/password-reset/confirm").send({ token, password });
}

function check(token: unknown) {
  return request(app).post("/api/auth/password-reset/check").send({ token });
}

function logIn(email: string, password: string) {
  return request(app).post("/api/auth/login").send({ email, password });
}

// A short wait, to show that nothing happens later either
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

describe("POST /api/auth/password-reset", () => {
  it("sends a link to the account's email, in Norwegian by default", async () => {
    await registerAndLogin(lukas);

    const res = await askForReset(lukas.email);

    expect(res.status).toBe(202);
    const email = await waitForEmail();
    expect(email.to).toBe(lukas.email);
    expect(email.subject).toBe("Tilbakestill passordet ditt i Tollvakt");
    expect(email.text).toContain(`Hei ${lukas.firstName},`);
    expect(email.text).toContain("60 minutter");
    expect(email.text).toContain("https://tollvakt.test/reset-password?token=");
    expect(email.html).toContain("https://tollvakt.test/reset-password?token=");
  });

  it("writes the email in English when asked", async () => {
    await registerAndLogin(lukas);

    await askForReset(lukas.email, "en");

    expect((await waitForEmail()).subject).toBe("Reset your Tollvakt password");
  });

  it("answers the same for an unknown email and sends nothing", async () => {
    const res = await askForReset("nobody@example.com");

    expect(res.status).toBe(202);
    expect(res.body.message).toBe("If an account has this email, a reset link has been sent");
    await settle();
    expect(sent).toHaveLength(0);
  });

  it("sends nothing for a closed account", async () => {
    await registerAndLogin(lukas);
    await User.update({ isActive: false }, { where: { email: lukas.email } });

    expect((await askForReset(lukas.email)).status).toBe(202);
    await settle();
    expect(sent).toHaveLength(0);
  });

  it("stores only a hash of the token, and a new link replaces the old one", async () => {
    await registerAndLogin(lukas);
    const first = await resetTokenFor(lukas.email);
    const second = await resetTokenFor(lukas.email);

    const rows = await PasswordResetToken.findAll();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(createHash("sha256").update(second).digest("hex"));
    expect((await check(first)).body.valid).toBe(false);
    expect((await check(second)).body.valid).toBe(true);
  });

  it("refuses an invalid email", async () => {
    expect((await askForReset("not-an-email")).status).toBe(400);
  });

  it("is limited per account", async () => {
    vi.stubEnv("PASSWORD_RESETS_PER_ACCOUNT", "2");
    await registerAndLogin({ ...kari, email: "kari.reset@example.com" });

    await askForReset("kari.reset@example.com").expect(202);
    await askForReset("kari.reset@example.com").expect(202);

    expect((await askForReset("kari.reset@example.com")).status).toBe(429);
    // The two emails are sent after the answers; wait for them, so they do
    // not arrive during the next test
    await waitForEmail(2);
  });
});

describe("POST /api/auth/password-reset/confirm", () => {
  it("sets the new password, uses up the link and ends every session", async () => {
    const { auth } = await registerAndLogin(lukas);
    const token = await resetTokenFor(lukas.email);

    const res = await confirm(token, "BrandNewPassword1");

    expect(res.status).toBe(204);
    expect((await logIn(lukas.email, "BrandNewPassword1")).status).toBe(200);
    expect((await logIn(lukas.email, lukas.password)).status).toBe(401);
    expect((await request(app).get("/api/auth/me").set(auth)).status).toBe(401);
    expect((await confirm(token, "AnotherPassword1")).status).toBe(400);
  });

  it("refuses an expired link", async () => {
    await registerAndLogin(lukas);
    const token = await resetTokenFor(lukas.email);
    await PasswordResetToken.update({ expiresAt: new Date(Date.now() - 1000) }, { where: {} });

    const res = await confirm(token, "BrandNewPassword1");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("This link is invalid or has expired");
    expect((await check(token)).body.valid).toBe(false);
  });

  it("refuses a made-up or missing token and a short password", async () => {
    await registerAndLogin(lukas);
    const token = await resetTokenFor(lukas.email);

    expect((await confirm("made-up", "BrandNewPassword1")).status).toBe(400);
    expect((await confirm(undefined, "BrandNewPassword1")).status).toBe(400);
    expect((await confirm(token, "short")).status).toBe(400);
    expect((await check(undefined)).body.valid).toBe(false);
  });

  it("clears earlier failed logins for the account", async () => {
    vi.stubEnv("LOGIN_FAILURES_PER_ACCOUNT", "2");
    await registerAndLogin({ ...kari, email: "kari.locked@example.com" });
    await logIn("kari.locked@example.com", "Wrong1234").expect(401);
    await logIn("kari.locked@example.com", "Wrong1234").expect(401);
    expect((await logIn("kari.locked@example.com", kari.password)).status).toBe(429);

    const token = await resetTokenFor("kari.locked@example.com");
    await confirm(token, "BrandNewPassword1").expect(204);

    expect((await logIn("kari.locked@example.com", "BrandNewPassword1")).status).toBe(200);
  });
});

describe("email providers", () => {
  it("sends with Resend when EMAIL_PROVIDER=resend", async () => {
    setEmailSender(null);
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Tollvakt <test@example.com>");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await getEmailSender().send({ to: "kari@example.com", subject: "S", text: "T", html: "<p>T</p>" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: "Tollvakt <test@example.com>",
      to: ["kari@example.com"],
      subject: "S",
    });
  });

  it("says why Resend refused an email", async () => {
    setEmailSender(null);
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "Invalid from" }), { status: 422 })));

    await expect(
      getEmailSender().send({ to: "kari@example.com", subject: "S", text: "T", html: "T" }),
    ).rejects.toThrow("Resend refused the email (422): Invalid from");
  });

  it("refuses an unknown provider", () => {
    setEmailSender(null);
    vi.stubEnv("EMAIL_PROVIDER", "pigeon");

    expect(() => getEmailSender()).toThrow('Unknown EMAIL_PROVIDER "pigeon"');
  });
});

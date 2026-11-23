import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { setEmailSender, type Email } from "../src/services/email/emailSender.js";

let sent: Email[] = [];

beforeEach(() => {
  sent = [];
  setEmailSender({ send: async (email) => void sent.push(email) });
  vi.stubEnv("FEEDBACK_EMAIL", "owner@example.com");
});

afterEach(() => {
  setEmailSender(null);
  vi.unstubAllEnvs();
});

function send(body: object) {
  return request(app).post("/api/feedback").send(body);
}

describe("POST /api/feedback", () => {
  it("emails the feedback to the owner, with the user's address to reply to", async () => {
    const res = await send({
      kind: "idea",
      message: "  It would help to see the chapter notes.\nThanks!  ",
      email: " kari@example.com ",
      language: "en",
      page: "/classify",
    });

    expect(res.status).toBe(202);
    expect(sent).toHaveLength(1);
    const email = sent[0]!;
    expect(email.to).toBe("owner@example.com");
    expect(email.replyTo).toBe("kari@example.com");
    expect(email.subject).toBe("Tollvakt feedback: Idea (kari@example.com)");
    expect(email.text).toContain("It would help to see the chapter notes.\nThanks!");
    expect(email.text).toContain("Page: /classify");
    expect(email.text).toContain("Language: en");
    expect(email.html).toContain("chapter notes.<br>Thanks!");
  });

  it("sends anonymous feedback without an address to reply to", async () => {
    const res = await send({ message: "Nice tool, but slow." });

    expect(res.status).toBe(202);
    const email = sent[0]!;
    expect(email.replyTo).toBeUndefined();
    expect(email.subject).toBe("Tollvakt feedback: Other (anonymous)");
    expect(email.text).toContain("there is no one to answer");
    expect(email.text).toContain("Language: nb");
  });

  it("escapes HTML in the message", async () => {
    await send({ message: "<script>alert(1)</script> & more" });

    expect(sent[0]!.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; more");
    expect(sent[0]!.html).not.toContain("<script>");
  });

  it("goes to the admin's address when FEEDBACK_EMAIL is not set", async () => {
    vi.stubEnv("FEEDBACK_EMAIL", "");
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");

    await send({ message: "Hello there" });

    expect(sent[0]!.to).toBe("admin@example.com");
  });

  it.each([
    [{}, "The message must be"],
    [{ message: "hi" }, "The message must be"],
    [{ message: "x".repeat(4001) }, "The message must be"],
    [{ message: "Hello there", email: "not-an-email" }, "The email address is not valid"],
    [{ message: "Hello there", kind: "complaint" }, "kind must be one of"],
  ])("refuses %j", async (body, error) => {
    const res = await send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain(error);
    expect(sent).toHaveLength(0);
  });

  it("ignores a page that is not a path of the site", async () => {
    await send({ message: "Hello there", page: "https://evil.example.com" });

    expect(sent[0]!.text).not.toContain("Page:");
  });

  it("answers robots that fill the hidden field as usual, but sends nothing", async () => {
    const res = await send({ message: "Buy cheap watches", website: "http://spam.example.com" });

    expect(res.status).toBe(202);
    expect(sent).toHaveLength(0);
  });

  it("tells the user when the email could not be sent", async () => {
    setEmailSender({
      send: async () => {
        throw new Error("Resend is down");
      },
    });

    const res = await send({ message: "Hello there" });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("The feedback could not be sent. Try again later.");
  });

  it("answers 503 when there is no address to send to", async () => {
    vi.stubEnv("FEEDBACK_EMAIL", "");
    vi.stubEnv("ADMIN_EMAIL", "");

    const res = await send({ message: "Hello there" });

    expect(res.status).toBe(503);
  });

  it("limits the messages from one address", async () => {
    vi.stubEnv("FEEDBACK_PER_ADDRESS", "2");
    const ip = "203.0.113.77";
    const from = () =>
      request(app).post("/api/feedback").set("X-Forwarded-For", ip).send({ message: "Hello there" });

    expect((await from()).status).toBe(202);
    expect((await from()).status).toBe(202);
    const res = await from();

    expect(res.status).toBe(429);
    expect(res.body.error).toBe("Too many messages. Try again later.");
  });
});

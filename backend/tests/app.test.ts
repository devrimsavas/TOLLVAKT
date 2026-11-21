import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { sequelize } from "../src/config/database.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /", () => {
  it("responds with the API name", async () => {
    const res = await request(app).get("/");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Tollvakt API", docs: "/api/docs" });
  });

  it("sends security headers and a request id", async () => {
    const res = await request(app).get("/");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });
});

describe("GET /api/health", () => {
  it("reports ok when the database is reachable", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", database: "ok" });
  });

  it("reports 503 when the database is unreachable", async () => {
    vi.spyOn(sequelize, "query").mockRejectedValueOnce(new Error("down"));

    const res = await request(app).get("/api/health");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "error", database: "unreachable" });
  });
});

describe("errors", () => {
  it("answers unknown API paths with a JSON 404", async () => {
    const res = await request(app).get("/api/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });

  it("answers an invalid JSON body with a JSON 400", async () => {
    const res = await request(app)
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send("{not json");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "The request body is not valid" });
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { seedTariffData } from "./helpers/tariffData.js";

describe("tariff tree", () => {
  beforeEach(async () => {
    await seedTariffData();
  });

  it("starts at the top level, in the tariff's order", async () => {
    const res = await request(app).get("/api/tariff/tree");

    expect(res.status).toBe(200);
    expect(res.body[0]).toEqual({
      id: 1,
      nodeType: "section",
      code: "11",
      hsCode: null,
      descriptionNb: "Tekstilmaterialer og varer derav",
      descriptionEn: "Textiles and textile articles",
      hasChildren: true,
    });
  });

  it("opens one level at a time, and says which nodes have levels below", async () => {
    const section = await request(app).get("/api/tariff/tree/1/children");
    expect(section.status).toBe(200);
    expect(section.body).toEqual([expect.objectContaining({ id: 2, code: "6109", hasChildren: true })]);

    const heading = await request(app).get("/api/tariff/tree/2/children");
    expect(heading.body).toEqual([
      expect.objectContaining({ id: 3, nodeType: "commodity", code: "61091000", hasChildren: false }),
    ]);
  });

  it("leaves out codes that are no longer valid", async () => {
    const res = await request(app).get("/api/tariff/tree/2/children");

    expect(res.body.map((node: { code: string }) => node.code)).not.toContain("61099000");
  });

  it("answers an empty list below a commodity code", async () => {
    const res = await request(app).get("/api/tariff/tree/3/children");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("answers 404 for a node that does not exist and 400 for an id that is not a number", async () => {
    expect((await request(app).get("/api/tariff/tree/9999/children")).status).toBe(404);
    expect((await request(app).get("/api/tariff/tree/abc/children")).status).toBe(400);
    expect((await request(app).get("/api/tariff/tree/0/children")).status).toBe(400);
  });

  it("gives the tree's node ids with a code's details, to open the tree at the code", async () => {
    const res = await request(app).get("/api/commodities/61091000");

    expect(res.body.nodeId).toBe(3);
    expect(res.body.path.map((p: { nodeId: number }) => p.nodeId)).toEqual([1, 2]);
  });
});

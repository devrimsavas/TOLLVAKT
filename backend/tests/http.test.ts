import { afterEach, describe, expect, it, vi } from "vitest";
import { postJsonWithRetry, retrySettings, waitBeforeRetry } from "../src/services/http.js";
import { supportsIterativeScan } from "../src/services/commodityService.js";

function responses(...list: Response[]) {
  const fetchMock = vi.fn();
  for (const response of list) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const json = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

const post = () => postJsonWithRetry("http://x", {}, {}, 1000, "Model", (message) => new Error(message));

describe("postJsonWithRetry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tries again on rate limits and overloaded servers", async () => {
    const waits: number[] = [];
    const sleep = retrySettings.sleep;
    retrySettings.sleep = async (ms) => {
      waits.push(ms);
    };
    const fetchMock = responses(json(429), json(503), json(200, { ok: true }));

    try {
      expect(await post()).toEqual({ ok: true });
    } finally {
      retrySettings.sleep = sleep;
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([2000, 4000]);
  });

  it("gives up after the last attempt", async () => {
    responses(...Array.from({ length: retrySettings.attempts }, () => json(503)));
    await expect(post()).rejects.toThrow(`Model answered 503, also after ${retrySettings.attempts} attempts`);
  });

  it("does not try again on other errors", async () => {
    const fetchMock = responses(json(400));
    await expect(post()).rejects.toThrow("Model answered 400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("waits as long as the server asks, within a limit", () => {
    expect(waitBeforeRetry(1, "7")).toBe(7000);
    expect(waitBeforeRetry(1, "3600")).toBe(retrySettings.maxWaitMs);
    expect(waitBeforeRetry(3, null)).toBe(8000);
  });
});

describe("supportsIterativeScan", () => {
  it("is true from pgvector 0.8", () => {
    expect(supportsIterativeScan("0.8.7")).toBe(true);
    expect(supportsIterativeScan("0.6.0")).toBe(false);
    expect(supportsIterativeScan("1.0.0")).toBe(true);
  });
});

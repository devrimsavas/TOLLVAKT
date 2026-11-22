// POSTs JSON to a model provider, waiting and trying again on answers that
// usually pass: rate limits (429: requests per minute used up) and
// overloaded or failing servers (500, 502, 503 "high demand", 504).
// Timeouts and other errors are not retried: a timeout already took long,
// and a 400 or 401 will not change.

export const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

// Changeable so tests do not wait
export const retrySettings = {
  attempts: 5,
  maxWaitMs: 30_000,
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

// Seconds the server asks to wait (Retry-After), else 2, 4, 8 … seconds
export function waitBeforeRetry(attempt: number, retryAfter: string | null): number {
  const asked = retryAfter ? Number(retryAfter) * 1000 : NaN;
  const wait = Number.isFinite(asked) && asked > 0 ? asked : 2 ** attempt * 1000;
  return Math.min(wait, retrySettings.maxWaitMs);
}

export async function postJsonWithRetry(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
  who: string,
  makeError: (message: string) => Error,
): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw makeError(`${who} did not answer within ${timeoutMs / 1000} seconds`);
      }
      throw makeError(`${who} could not be reached`);
    }
    if (response.ok) return response.json();
    if (!RETRY_STATUSES.has(response.status) || attempt >= retrySettings.attempts) {
      const tries = attempt > 1 ? `, also after ${attempt} attempts` : "";
      throw makeError(`${who} answered ${response.status}${tries}`);
    }
    await retrySettings.sleep(waitBeforeRetry(attempt, response.headers.get("retry-after")));
  }
}

// GoatCounter counts page views without cookies or personal data. It is
// on only when GOATCOUNTER_URL is set (the counter's /count address), so
// development and tests count nothing.
const COUNTER_SCRIPT = "https://gc.zgo.at/count.js";

export function counterUrl(): string | null {
  const value = process.env.GOATCOUNTER_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// Where the browser sends the counts, for the content security policy
export function counterOrigin(): string | null {
  const url = counterUrl();
  return url ? new URL(url).origin : null;
}

export { COUNTER_SCRIPT };

// The path as it is counted: never the query string, which can hold a
// token (password reset), and the ids of saved classifications replaced,
// since what a member classifies is their business
export function countedPath(pathname: string): string {
  return pathname.replace(
    /(^|\/)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi,
    "$1:id",
  );
}

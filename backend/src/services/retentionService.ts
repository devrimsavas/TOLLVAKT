// Deletes or anonymises personal data that is no longer needed, as the
// privacy statement promises:
//  - usage rows older than USAGE_ANONYMISE_DAYS lose the member and the
//    guest's coded address; only an anonymous count by day and kind stays,
//    for the statistics and the cost of the service
//  - password reset links are deleted a day after they expired
// Runs when the API starts and then once a day (see startRetention).
import { sequelize } from "../config/database.js";
import { logger } from "../config/logger.js";

const log = logger.child({ module: "retention" });

// The admin page shows at most 90 days of usage, with guests counted by
// their coded address; older days only need the counts
export const USAGE_ANONYMISE_DAYS = 90;
const RESET_LINK_KEEP_HOURS = 24;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionResult {
  usageAnonymised: number;
  resetLinksDeleted: number;
}

export async function purgeOldData(): Promise<RetentionResult> {
  const [, usage] = await sequelize.query(
    `UPDATE usage_events SET user_id = NULL, client_hash = NULL
      WHERE created_at < now() - make_interval(days => :days)
        AND (user_id IS NOT NULL OR client_hash IS NOT NULL)`,
    { replacements: { days: USAGE_ANONYMISE_DAYS } },
  );
  const [, links] = await sequelize.query(
    `DELETE FROM password_reset_tokens
      WHERE expires_at < now() - make_interval(hours => :hours)`,
    { replacements: { hours: RESET_LINK_KEEP_HOURS } },
  );
  return { usageAnonymised: rowCount(usage), resetLinksDeleted: rowCount(links) };
}

// Postgres gives the number of changed rows in the result's rowCount
function rowCount(result: unknown): number {
  const count = (result as { rowCount?: number } | null)?.rowCount;
  return typeof count === "number" ? count : 0;
}

async function runOnce(): Promise<void> {
  try {
    const result = await purgeOldData();
    if (result.usageAnonymised || result.resetLinksDeleted) log.info(result, "Old personal data removed");
  } catch (error) {
    // A failed run is tried again the next day; it must never stop the API
    log.error({ err: error }, "Removing old personal data failed");
  }
}

// Runs the clean-up now and every day after. The timer does not keep the
// process alive on its own. Returns a function that stops it.
export function startRetention(): () => void {
  void runOnce();
  const timer = setInterval(() => void runOnce(), ONE_DAY_MS);
  timer.unref();
  return () => clearInterval(timer);
}

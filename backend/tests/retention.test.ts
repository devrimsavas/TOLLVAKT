import { describe, expect, it } from "vitest";
import { sequelize } from "../src/config/database.js";
import { User } from "../src/models/User.js";
import { purgeOldData, USAGE_ANONYMISE_DAYS } from "../src/services/retentionService.js";
import { kari, registerAndLogin } from "./helpers/users.js";

async function kariId(): Promise<number> {
  await registerAndLogin(kari);
  const user = await User.findOne({ where: { email: kari.email } });
  return user!.id;
}

async function addUsage(userId: number | null, clientHash: string | null, daysAgo: number) {
  await sequelize.query(
    `INSERT INTO usage_events (user_id, client_hash, kind, created_at)
     VALUES (:userId, :clientHash, 'classify', now() - make_interval(days => :daysAgo))`,
    { replacements: { userId, clientHash, daysAgo } },
  );
}

async function usageRows() {
  const [rows] = await sequelize.query(
    "SELECT user_id, client_hash FROM usage_events ORDER BY created_at",
  );
  return rows as { user_id: number | null; client_hash: string | null }[];
}

async function addResetLink(userId: number, hash: string, hoursFromNow: number) {
  await sequelize.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES (:userId, :hash, now() + make_interval(hours => :hoursFromNow))`,
    { replacements: { userId, hash: hash.padEnd(64, "0"), hoursFromNow } },
  );
}

describe("removing old personal data", () => {
  it("anonymises usage rows older than the limit and keeps them as counts", async () => {
    const userId = await kariId();
    await addUsage(userId, null, USAGE_ANONYMISE_DAYS + 5);
    await addUsage(null, "a".repeat(64), USAGE_ANONYMISE_DAYS + 1);
    await addUsage(userId, null, USAGE_ANONYMISE_DAYS - 1);
    await addUsage(null, "b".repeat(64), 0);

    const result = await purgeOldData();

    expect(result.usageAnonymised).toBe(2);
    expect(await usageRows()).toEqual([
      { user_id: null, client_hash: null },
      { user_id: null, client_hash: null },
      { user_id: userId, client_hash: null },
      { user_id: null, client_hash: "b".repeat(64) },
    ]);
  });

  it("deletes reset links a day after they expired", async () => {
    const userId = await kariId();
    await addResetLink(userId, "1", -30);
    await addResetLink(userId, "2", -2);
    await addResetLink(userId, "3", 1);

    const result = await purgeOldData();

    expect(result.resetLinksDeleted).toBe(1);
    const [rows] = await sequelize.query("SELECT left(token_hash, 1) AS id FROM password_reset_tokens ORDER BY id");
    expect(rows).toEqual([{ id: "2" }, { id: "3" }]);
  });

  it("changes nothing when there is nothing old", async () => {
    const userId = await kariId();
    await addUsage(userId, null, 1);

    expect(await purgeOldData()).toEqual({ usageAnonymised: 0, resetLinksDeleted: 0 });
  });
});

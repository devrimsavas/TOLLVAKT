// Daily quotas for the calls that use a language or embedding model:
// classification and the semantic, hybrid and expanded search modes. Each
// call costs money with a paid model, so nobody may make them without limit.
//
// GUEST_DAILY_LIMIT    per guest (known by a keyed hash of the IP address)
// USER_DAILY_LIMIT     per member, unless an admin set the member's own limit
// GLOBAL_DAILY_LIMIT   for everyone together: caps the cost of a day even if
//                      someone opens many accounts
//
// Admins have no limit of their own but count towards the global one. A day
// runs from midnight to midnight in Norway. Every call is a row in
// usage_events, so the counts are shared by all API processes and survive a
// restart.
import { createHmac } from "node:crypto";
import { QueryTypes, type Transaction } from "sequelize";
import { sequelize } from "../config/database.js";
import { User, type UserRole } from "../models/User.js";
import { getJwtSecret } from "./authService.js";

export type UsageKind = "classify" | "search";

export const DEFAULT_LIMITS = { guest: 1, user: 10, global: 200 };

// A whole number from 0 up; 0 turns the feature off for that group
function limitSetting(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isInteger(value) && value >= 0
    ? value
    : fallback;
}

// Read on every call, so the limits can change without code and tests can
// set their own
export function limitSettings() {
  return {
    guest: limitSetting("GUEST_DAILY_LIMIT", DEFAULT_LIMITS.guest),
    user: limitSetting("USER_DAILY_LIMIT", DEFAULT_LIMITS.user),
    global: limitSetting("GLOBAL_DAILY_LIMIT", DEFAULT_LIMITS.global),
  };
}

export type Caller =
  | { kind: "user"; id: number; role: UserRole; dailyLimit: number | null }
  | { kind: "guest"; clientHash: string };

// The IP address is never stored. The hash is keyed with the server's secret:
// a plain hash of an IPv4 address could be reversed by trying them all.
export function clientHash(ip: string): string {
  return createHmac("sha256", getJwtSecret()).update(`client:${ip}`).digest("hex");
}

// The caller of a request: the logged-in member (req.auth, from optionalAuth
// or requireAuth), or a guest. null when the token's user no longer exists.
export async function callerOf(auth: { userId: string } | undefined, ip: string | undefined): Promise<Caller | null> {
  if (!auth) return { kind: "guest", clientHash: clientHash(ip ?? "unknown") };
  const user = await User.findOne({
    where: { publicId: auth.userId },
    attributes: ["id", "role", "dailyLimit"],
  });
  return user ? { kind: "user", id: user.id, role: user.role, dailyLimit: user.dailyLimit } : null;
}

// The caller's own limit; null means none (admins)
export function limitOf(caller: Caller): number | null {
  const limits = limitSettings();
  if (caller.kind === "guest") return limits.guest;
  if (caller.role === "admin") return null;
  return caller.dailyLimit ?? limits.user;
}

export interface Usage {
  // "guest" or "user": whose limit this is
  scope: "guest" | "user";
  // null: no limit of one's own (admins)
  limit: number | null;
  used: number;
  remaining: number | null;
  // When the day's count starts again: the next midnight in Norway
  resetsAt: string;
}

// Midnight in Norway today and tomorrow, as PostgreSQL computes them. The date
// is taken in Norwegian time first, so the 23- and 25-hour days of the clock
// changes come out right.
export const TODAY_START = "((now() AT TIME ZONE 'Europe/Oslo')::date::timestamp AT TIME ZONE 'Europe/Oslo')";
const TOMORROW_START = "(((now() AT TIME ZONE 'Europe/Oslo')::date + 1)::timestamp AT TIME ZONE 'Europe/Oslo')";

function callerCondition(caller: Caller): { sql: string; replacements: Record<string, unknown> } {
  return caller.kind === "user"
    ? { sql: "user_id = :userId", replacements: { userId: caller.id } }
    : { sql: "user_id IS NULL AND client_hash = :clientHash", replacements: { clientHash: caller.clientHash } };
}

async function countToday(caller: Caller | null, transaction?: Transaction) {
  const condition = caller ? callerCondition(caller) : { sql: "true", replacements: {} };
  const [row] = await sequelize.query<{ used: string; resets_at: Date }>(
    `SELECT count(*) AS used, ${TOMORROW_START} AS resets_at
       FROM usage_events
      WHERE created_at >= ${TODAY_START} AND ${condition.sql}`,
    { type: QueryTypes.SELECT, replacements: condition.replacements, ...(transaction ? { transaction } : {}) },
  );
  return { used: Number(row!.used), resetsAt: new Date(row!.resets_at).toISOString() };
}

function usageOf(caller: Caller, used: number, resetsAt: string): Usage {
  const limit = limitOf(caller);
  return {
    scope: caller.kind,
    limit,
    used,
    remaining: limit === null ? null : Math.max(0, limit - used),
    resetsAt,
  };
}

export async function getUsage(caller: Caller): Promise<Usage> {
  const { used, resetsAt } = await countToday(caller);
  return usageOf(caller, used, resetsAt);
}

export class QuotaExceededError extends Error {
  constructor(
    // "guest" or "user": the caller's own limit; "global": everyone's
    readonly scope: "guest" | "user" | "global",
    readonly limit: number,
    readonly resetsAt: string,
  ) {
    super(
      scope === "global"
        ? "The service has reached its limit for today. Try again tomorrow."
        : scope === "guest"
          ? "Guests can make only a few requests a day. Register for free to make more."
          : "You have used today's requests. Try again tomorrow.",
    );
  }
}

// The same number for every reservation: they run one at a time, so two
// requests at once cannot both take the last place in a quota
const USAGE_LOCK = 742001;

export interface Reservation {
  eventId: string;
  usage: Usage;
}

// Takes one place in the caller's and the global quota for today, before
// the model is called, or throws QuotaExceededError. If the call then fails,
// release() gives the place back.
export async function reserve(caller: Caller, kind: UsageKind): Promise<Reservation> {
  return sequelize.transaction(async (transaction) => {
    await sequelize.query("SELECT pg_advisory_xact_lock(:lock)", {
      transaction,
      replacements: { lock: USAGE_LOCK },
    });

    const limit = limitOf(caller);
    const own = await countToday(caller, transaction);
    if (limit !== null && own.used >= limit) {
      throw new QuotaExceededError(caller.kind, limit, own.resetsAt);
    }
    const global = limitSettings().global;
    const everyone = await countToday(null, transaction);
    if (everyone.used >= global) {
      throw new QuotaExceededError("global", global, everyone.resetsAt);
    }

    const [rows] = await sequelize.query(
      `INSERT INTO usage_events (user_id, client_hash, kind)
       VALUES (:userId, :clientHash, :kind) RETURNING id`,
      {
        transaction,
        replacements: {
          userId: caller.kind === "user" ? caller.id : null,
          clientHash: caller.kind === "guest" ? caller.clientHash : null,
          kind,
        },
      },
    );
    const eventId = String((rows as { id: string }[])[0]!.id);
    return { eventId, usage: usageOf(caller, own.used + 1, own.resetsAt) };
  });
}

// Gives a place back when the call failed on our side (a model that could
// not be reached, for instance): the caller should not pay for that
export async function release(eventId: string): Promise<void> {
  await sequelize.query("DELETE FROM usage_events WHERE id = :id", { replacements: { id: eventId } });
}

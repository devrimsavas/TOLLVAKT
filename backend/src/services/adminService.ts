// What admins see and change: the members, their limits and the use of the
// models over time.
import { QueryTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { User, type UserRole } from "../models/User.js";
import { limitSettings, TODAY_START } from "./usageService.js";

export interface AdminUser {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  // The member's own limit, or null for the default
  dailyLimit: number | null;
  // The limit that applies: the own one, the default, or null for none (admins)
  effectiveDailyLimit: number | null;
  usedToday: number;
  classificationCount: number;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface DailyUsage {
  // The day in Norway, YYYY-MM-DD
  date: string;
  classify: number;
  search: number;
  members: number;
  guests: number;
}

interface UserRow {
  public_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  daily_limit: number | null;
  used_today: string;
  classification_count: string;
  last_login_at: Date | null;
  created_at: Date;
}

function toAdminUser(row: UserRow): AdminUser {
  return {
    userId: row.public_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    dailyLimit: row.daily_limit,
    effectiveDailyLimit: row.role === "admin" ? null : (row.daily_limit ?? limitSettings().user),
    usedToday: Number(row.used_today),
    classificationCount: Number(row.classification_count),
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

const USER_SELECT = `
  SELECT u.public_id, u.first_name, u.last_name, u.email, u.role, u.is_active, u.daily_limit,
         u.last_login_at, u.created_at,
         (SELECT count(*) FROM usage_events e
           WHERE e.user_id = u.id AND e.created_at >= ${TODAY_START}) AS used_today,
         (SELECT count(*) FROM classifications c WHERE c.user_id = u.id) AS classification_count
    FROM users u`;

// Newest members first
export async function listUsers(): Promise<AdminUser[]> {
  const rows = await sequelize.query<UserRow>(`${USER_SELECT} ORDER BY u.created_at DESC, u.id DESC`, {
    type: QueryTypes.SELECT,
  });
  return rows.map(toAdminUser);
}

async function findUser(publicId: string): Promise<AdminUser | null> {
  const [row] = await sequelize.query<UserRow>(`${USER_SELECT} WHERE u.public_id = :publicId`, {
    type: QueryTypes.SELECT,
    replacements: { publicId },
  });
  return row ? toAdminUser(row) : null;
}

export interface UserChanges {
  // null: back to the default
  dailyLimit?: number | null;
  isActive?: boolean;
}

// An admin may not close their own account: there might be no admin left
export class OwnAccountError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function updateUser(
  publicId: string,
  changes: UserChanges,
  adminPublicId: string,
): Promise<AdminUser | null> {
  if (!UUID.test(publicId)) return null;
  const user = await User.findOne({ where: { publicId } });
  if (!user) return null;
  if (changes.isActive === false && publicId === adminPublicId) {
    throw new OwnAccountError("You cannot close your own account");
  }
  if (changes.dailyLimit !== undefined) user.dailyLimit = changes.dailyLimit;
  if (changes.isActive !== undefined) user.isActive = changes.isActive;
  await user.save();
  return findUser(publicId);
}

// The last `days` days in Norway, today included, oldest first; days
// without any use are included with zeros
export async function dailyUsage(days: number): Promise<DailyUsage[]> {
  const rows = await sequelize.query<{
    date: string;
    classify: string;
    search: string;
    members: string;
    guests: string;
  }>(
    `WITH days AS (
       SELECT generate_series(
                (now() AT TIME ZONE 'Europe/Oslo')::date - (:days - 1),
                (now() AT TIME ZONE 'Europe/Oslo')::date,
                interval '1 day')::date AS day
     )
     SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
            count(*) FILTER (WHERE e.kind = 'classify') AS classify,
            count(*) FILTER (WHERE e.kind = 'search') AS search,
            count(DISTINCT e.user_id) AS members,
            count(DISTINCT e.client_hash) AS guests
       FROM days d
       LEFT JOIN usage_events e ON (e.created_at AT TIME ZONE 'Europe/Oslo')::date = d.day
      GROUP BY d.day
      ORDER BY d.day`,
    { type: QueryTypes.SELECT, replacements: { days } },
  );
  return rows.map((row) => ({
    date: row.date,
    classify: Number(row.classify),
    search: Number(row.search),
    members: Number(row.members),
    guests: Number(row.guests),
  }));
}

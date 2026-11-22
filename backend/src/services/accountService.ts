import bcrypt from "bcryptjs";
import { QueryTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { User, type Language } from "../models/User.js";
import {
  InvalidCredentialsError,
  issueToken,
  SALT_ROUNDS,
  toPublicUser,
  type PublicUser,
} from "./authService.js";
import type { SearchLanguage } from "./commodityService.js";
import type { Suggestion } from "./classifier.js";
import type { RewrittenQuery } from "./queryRewriter.js";

// The user's own account: changing the password, downloading every piece
// of data stored about them and deleting the account (the GDPR rights of
// access, portability and erasure).

export class UserNotFoundError extends Error {}
export class LastAdminError extends Error {}

async function findUser(userPublicId: string): Promise<User> {
  const user = await User.findOne({ where: { publicId: userPublicId } });
  if (!user) {
    throw new UserNotFoundError("User not found");
  }
  return user;
}

async function checkPassword(user: User, password: unknown): Promise<void> {
  const matches =
    typeof password === "string" &&
    (await bcrypt.compare(password, user.passwordHash));
  if (!matches) {
    throw new InvalidCredentialsError("The password is wrong");
  }
}

// Sets a new password after checking the current one. Every session ends,
// this one too, so a new token is returned for the device that asked.
export async function changePassword(
  userPublicId: string,
  currentPassword: unknown,
  newPassword: string,
): Promise<{ token: string }> {
  const user = await findUser(userPublicId);
  await checkPassword(user, currentPassword);
  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  user.passwordChangedAt = new Date();
  await user.save();
  return { token: issueToken(user) };
}

// The user's language: the web app's and the emails'
export async function updatePreferences(
  userPublicId: string,
  changes: { language?: Language },
): Promise<PublicUser> {
  const user = await findUser(userPublicId);
  if (changes.language) user.language = changes.language;
  await user.save();
  return toPublicUser(user);
}

// Everything stored about the user, in one JSON document they can read or
// take elsewhere. Internal database ids and the password hash are left
// out; the public ids are the ones the API uses.
export async function exportUserData(userPublicId: string) {
  const user = await findUser(userPublicId);

  const [classifications, usage] = await Promise.all([
    sequelize.query<{
      public_id: string;
      description: string;
      lang: SearchLanguage;
      model: string;
      rewritten: RewrittenQuery | null;
      suggestions: Suggestion[];
      missing_information: string[];
      candidates: string[];
      created_at: Date;
    }>(
      `SELECT public_id, description, lang, model, rewritten, suggestions, missing_information,
              candidates, created_at
         FROM classifications WHERE user_id = :userId ORDER BY created_at, id`,
      { type: QueryTypes.SELECT, replacements: { userId: user.id } },
    ),
    sequelize.query<{ kind: string; created_at: Date }>(
      "SELECT kind, created_at FROM usage_events WHERE user_id = :userId ORDER BY created_at, id",
      { type: QueryTypes.SELECT, replacements: { userId: user.id } },
    ),
  ]);

  return {
    format: "tollvakt-export/1",
    exportedAt: new Date(),
    user: {
      userId: user.publicId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      language: user.language,
      dailyLimit: user.dailyLimit,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      passwordChangedAt: user.passwordChangedAt,
    },
    classifications: classifications.map((row) => ({
      classificationId: row.public_id,
      description: row.description,
      lang: row.lang,
      model: row.model,
      rewritten: row.rewritten,
      suggestions: row.suggestions,
      missingInformation: row.missing_information,
      candidates: row.candidates,
      createdAt: row.created_at,
    })),
    // Every classification and model-backed search, for the daily limit
    usage: usage.map((row) => ({ kind: row.kind, at: row.created_at })),
  };
}

// Deletes the account after checking the password. The database deletes
// the user's classifications and reset links with it; the usage rows lose
// the user and keep only the time and kind, so today's global limit and
// the statistics stay right without pointing to anyone. The last admin
// cannot be deleted, so the system always has one.
export async function deleteAccount(
  userPublicId: string,
  password: unknown,
): Promise<void> {
  await sequelize.transaction(async (transaction) => {
    const user = await User.findOne({
      where: { publicId: userPublicId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!user) {
      throw new UserNotFoundError("User not found");
    }
    await checkPassword(user, password);
    if (user.role === "admin") {
      const admins = await User.count({
        where: { role: "admin" },
        transaction,
      });
      if (admins <= 1) {
        throw new LastAdminError("The last admin account cannot be deleted");
      }
    }
    await user.destroy({ transaction });
  });
}

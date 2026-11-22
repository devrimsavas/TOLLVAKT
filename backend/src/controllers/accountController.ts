import type { Request, Response } from "express";
import { InvalidCredentialsError } from "../services/authService.js";
import {
  changePassword,
  deleteAccount,
  exportUserData,
  LastAdminError,
  updatePreferences,
  UserNotFoundError,
} from "../services/accountService.js";
import { isLanguage, MIN_PASSWORD_LENGTH } from "./authController.js";

// POST /api/auth/me/password
export const changeMyPassword = async (req: Request, res: Response) => {
  // #swagger.tags = ["Auth"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.description = "Changes the password after checking the current one. Every session ends; the answer holds a new token for this device."
     #swagger.requestBody = {
       required: true,
       content: { "application/json": { example: { currentPassword: "OldSecret2026", newPassword: "NewSecret2026" } } }
     } */
  const { currentPassword, newPassword } = req.body ?? {};

  if (
    typeof newPassword !== "string" ||
    newPassword.length < MIN_PASSWORD_LENGTH
  ) {
    res.status(400).json({
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    });
    return;
  }

  try {
    res.json(
      await changePassword(req.auth!.userId, currentPassword, newPassword),
    );
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      res.status(401).json({ error: error.message });
      return;
    }
    if (error instanceof UserNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Request failed");
    res.status(500).json({ error: "Could not change the password" });
  }
};

// GET /api/auth/me/export
export const exportMyData = async (req: Request, res: Response) => {
  // #swagger.tags = ["Auth"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.description = "Everything stored about the user (profile, saved classifications, usage), as a JSON file to download" */
  try {
    const data = await exportUserData(req.auth!.userId);
    const day = data.exportedAt.toISOString().slice(0, 10);
    res
      .attachment(`tollvakt-data-${day}.json`)
      // Personal data: never kept in a cache on the way
      .set("Cache-Control", "no-store")
      .json(data);
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Request failed");
    res.status(500).json({ error: "Could not export the data" });
  }
};

// DELETE /api/auth/me
export const deleteMyAccount = async (req: Request, res: Response) => {
  // #swagger.tags = ["Auth"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.description = "Deletes the account and its saved classifications, after checking the password. The last admin cannot be deleted."
     #swagger.requestBody = {
       required: true,
       content: { "application/json": { example: { password: "MySecret2026" } } }
     } */
  try {
    await deleteAccount(req.auth!.userId, req.body?.password);
    res.status(204).end();
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      res.status(401).json({ error: error.message });
      return;
    }
    if (error instanceof UserNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof LastAdminError) {
      res.status(409).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Request failed");
    res.status(500).json({ error: "Could not delete the account" });
  }
};

// PATCH /api/auth/me/preferences
export const updateMyPreferences = async (req: Request, res: Response) => {
  // #swagger.tags = ["Auth"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.description = "Sets the user's language (nb or en), for the web app and emails"
     #swagger.requestBody = {
       required: true,
       content: { "application/json": { example: { language: "en" } } }
     } */
  const { language } = req.body ?? {};

  if (!isLanguage(language)) {
    res.status(400).json({ error: "language must be nb or en" });
    return;
  }

  try {
    res.json(await updatePreferences(req.auth!.userId, { language }));
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Request failed");
    res.status(500).json({ error: "Could not save the preferences" });
  }
};

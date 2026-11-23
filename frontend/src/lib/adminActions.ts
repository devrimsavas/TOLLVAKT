"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "./api";
import { text } from "./formData";
import { MAX_DAILY_LIMIT } from "./adminRules";

export interface UserChangeState {
  error?: "limitInvalid" | "ownAccount" | "failed";
  saved?: boolean;
}

async function changeUser(
  userId: string,
  changes: { dailyLimit?: number | null; isActive?: boolean },
): Promise<UserChangeState> {
  const result = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: changes,
  });
  if (result.status === 401) redirect("/session-expired");
  if (!result.ok) {
    return { error: result.status === 400 && "isActive" in changes ? "ownAccount" : "failed" };
  }
  revalidatePath("/admin");
  return { saved: true };
}

// A member's own daily limit, or back to the default ("default" button)
export async function setDailyLimitAction(
  _previous: UserChangeState,
  formData: FormData,
): Promise<UserChangeState> {
  const userId = text(formData, "userId");
  if (text(formData, "intent") === "default") return changeUser(userId, { dailyLimit: null });
  const limit = Number(text(formData, "dailyLimit"));
  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_DAILY_LIMIT) {
    return { error: "limitInvalid" };
  }
  return changeUser(userId, { dailyLimit: limit });
}

// Closes or reopens an account
export async function setActiveAction(
  _previous: UserChangeState,
  formData: FormData,
): Promise<UserChangeState> {
  return changeUser(text(formData, "userId"), {
    isActive: text(formData, "isActive") === "true",
  });
}

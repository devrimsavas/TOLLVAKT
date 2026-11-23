"use server";

import { redirect } from "next/navigation";
import { apiFetch } from "./api";

export interface DeleteState {
  failed?: boolean;
}

// Deletes one of the member's classifications and goes back to the list
export async function deleteClassificationAction(
  _previous: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { failed: true };
  const result = await apiFetch(`/api/classifications/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (result.status === 401 || result.status === 403) redirect("/session-expired");
  // Already gone counts as deleted
  if (!result.ok && result.status !== 404) return { failed: true };
  redirect("/history?deleted=1");
}

"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { apiFetch } from "./api";
import { getSessionToken } from "./session";
import { text } from "./formData";
import {
  MAX_DESCRIPTION_LENGTH,
  type Classification,
  type Usage,
} from "./classification";

// Messages are translation keys under "classify.errors"
export type ClassifyErrorKey =
  | "descriptionRequired"
  | "descriptionTooLong"
  | "quotaGuest"
  | "quotaUser"
  | "quotaGlobal"
  | "unavailable";

export interface ClassifyState {
  description?: string;
  result?: Classification;
  usage?: Usage;
  error?: ClassifyErrorKey;
  // With a quota error: when the count starts again (ISO time)
  resetsAt?: string;
}

const QUOTA_ERRORS: Record<string, ClassifyErrorKey> = {
  guest: "quotaGuest",
  user: "quotaUser",
  global: "quotaGlobal",
};

// Classifies a description as the logged-in member, or as a guest without
// a session. The reasons and questions come in the language of the page.
export async function classifyAction(
  _previous: ClassifyState,
  formData: FormData,
): Promise<ClassifyState> {
  const description = text(formData, "description").trim();
  if (!description) return { description, error: "descriptionRequired" };
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return { description, error: "descriptionTooLong" };
  }
  const lang = (await getLocale()) === "en" ? "en" : "nb";

  const result = await apiFetch<Classification & { usage: Usage }>(
    "/api/classify",
    { method: "POST", body: { description, lang } },
  );

  if (result.ok) {
    const { usage, ...classification } = result.data;
    return { description, result: classification, usage };
  }
  // The saved token is no longer accepted (expired, password changed,
  // account closed): the user has to log in again
  if ((result.status === 401 || result.status === 403) && (await getSessionToken())) {
    redirect("/session-expired");
  }
  if (result.status === 429) {
    const data = (result.data ?? {}) as { scope?: string; resetsAt?: string };
    return {
      description,
      error: QUOTA_ERRORS[data.scope ?? ""] ?? "quotaGlobal",
      resetsAt: data.resetsAt,
    };
  }
  if (result.status === 400) return { description, error: "descriptionRequired" };
  return { description, error: "unavailable" };
}

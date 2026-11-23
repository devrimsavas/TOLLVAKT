"use server";

import { getLocale } from "next-intl/server";
import { apiFetch } from "./api";
import { EMAIL_PATTERN } from "./authRules";
import {
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  toFeedbackKind,
  toFeedbackPage,
  type FeedbackKind,
} from "./feedback";
import { retryMinutes, text } from "./formData";

export interface FeedbackState {
  sent?: boolean;
  anonymous?: boolean;
  fieldErrors?: {
    message?: "messageTooShort" | "messageTooLong";
    email?: "emailInvalid";
  };
  formError?: "tooMany" | "unavailable";
  retryMinutes?: number;
  // What the user wrote, to show again after an error
  values?: { kind: FeedbackKind; message: string; email: string };
}

// Sends the feedback to the API, which emails it to the owner
export async function sendFeedbackAction(
  _previous: FeedbackState,
  formData: FormData,
): Promise<FeedbackState> {
  const values = {
    kind: toFeedbackKind(text(formData, "kind")),
    message: text(formData, "message").trim(),
    email: text(formData, "email").trim(),
  };

  if (values.message.length < FEEDBACK_MIN_LENGTH) {
    return { fieldErrors: { message: "messageTooShort" }, values };
  }
  if (values.message.length > FEEDBACK_MAX_LENGTH) {
    return { fieldErrors: { message: "messageTooLong" }, values };
  }
  if (values.email && !EMAIL_PATTERN.test(values.email)) {
    return { fieldErrors: { email: "emailInvalid" }, values };
  }

  const page = toFeedbackPage(text(formData, "page"));
  const result = await apiFetch("/api/feedback", {
    method: "POST",
    body: {
      kind: values.kind,
      message: values.message,
      ...(values.email ? { email: values.email } : {}),
      language: await getLocale(),
      ...(page ? { page } : {}),
      // The hidden field robots fill; passed on so the API can ignore them
      website: text(formData, "website"),
    },
    auth: false,
  });

  if (result.ok) {
    return { sent: true, anonymous: !values.email };
  }
  if (result.status === 429) {
    return { formError: "tooMany", retryMinutes: retryMinutes(result.retryAfterSeconds), values };
  }
  return { formError: "unavailable", values };
}

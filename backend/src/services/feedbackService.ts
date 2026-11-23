// Feedback from users, sent to the owner of Tollvakt by email. Nothing is
// stored: the message only exists in the email (see the privacy statement).
import { getEmailSender } from "./email/emailSender.js";
import { feedbackEmail, type EmailLanguage, type FeedbackKind } from "./email/templates.js";

export const FEEDBACK_MIN_LENGTH = 5;
export const FEEDBACK_MAX_LENGTH = 4000;
export const FEEDBACK_KINDS: readonly FeedbackKind[] = ["idea", "problem", "other"];

export class FeedbackNotSetUpError extends Error {}

export interface Feedback {
  kind: FeedbackKind;
  message: string;
  email: string | null;
  language: EmailLanguage;
  page: string | null;
}

// Where feedback goes: FEEDBACK_EMAIL, or the admin's address when it is
// not set
export function feedbackRecipient(): string | null {
  const address = (process.env.FEEDBACK_EMAIL || process.env.ADMIN_EMAIL || "").trim();
  return address || null;
}

export async function sendFeedback(feedback: Feedback): Promise<void> {
  const to = feedbackRecipient();
  if (!to) {
    throw new FeedbackNotSetUpError("FEEDBACK_EMAIL (or ADMIN_EMAIL) is not set");
  }
  await getEmailSender().send(
    feedbackEmail({
      to,
      kind: feedback.kind,
      message: feedback.message,
      replyTo: feedback.email,
      language: feedback.language,
      page: feedback.page,
      sentAt: new Date(),
    }),
  );
}

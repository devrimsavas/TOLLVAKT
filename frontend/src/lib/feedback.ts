// Rules of the feedback form, shared by the form and its server action.
// The API checks the same limits.
export const FEEDBACK_MIN_LENGTH = 5;
export const FEEDBACK_MAX_LENGTH = 4000;
export const FEEDBACK_KINDS = ["idea", "problem", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export function toFeedbackKind(value: unknown): FeedbackKind {
  return FEEDBACK_KINDS.includes(value as FeedbackKind) ? (value as FeedbackKind) : "other";
}

// Only a path of this site is passed on as the page the feedback is about
export function toFeedbackPage(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value.slice(0, 200)
    : "";
}

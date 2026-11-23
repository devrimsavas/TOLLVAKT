// The shapes of the API's classification answers, and helpers to show them.
// No server-only imports: the result is shown by client components too.

export type Confidence = "high" | "medium" | "low";

export interface Suggestion {
  code: string;
  descriptionNb: string | null;
  descriptionEn: string | null;
  // The path in the tariff, in the asked language
  context: string | null;
  reason: string;
  confidence: Confidence;
}

export interface Usage {
  scope: "guest" | "user";
  // null: no limit of one's own (admins)
  limit: number | null;
  used: number;
  remaining: number | null;
  resetsAt: string;
}

export interface Classification {
  // null for a guest: only members' classifications are saved
  id: string | null;
  description: string;
  rewritten: { nb: string; en: string } | null;
  suggestions: Suggestion[];
  missingInformation: string[];
  candidates: string[];
  model: string;
  createdAt: string;
}

export const MAX_DESCRIPTION_LENGTH = 500;

// "61091000" -> "6109.10.00", as the tariff writes codes
export function formatCode(code: string): string {
  const digits = code.replace(/\D/g, "");
  if (digits.length !== 8) return code;
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
}

// "Section > Chapter > ... > Code" -> the levels, without the section, which
// is long and says little
export function pathLevels(context: string | null): string[] {
  if (!context) return [];
  return context.split(" > ").slice(1);
}

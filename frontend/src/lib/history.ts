import "server-only";
import { apiFetch } from "./api";
import type { Classification, Confidence } from "./classification";

export interface ClassificationSummary {
  id: string;
  description: string;
  lang: "nb" | "en";
  topSuggestion: { code: string; confidence: Confidence } | null;
  suggestionCount: number;
  createdAt: string;
}

export interface SavedClassification extends Omit<Classification, "id"> {
  id: string;
  lang: "nb" | "en";
}

export const HISTORY_PAGE_SIZE = 20;

// One page of the member's classifications, newest first; "expired" when
// the session is no longer accepted
export async function listHistory(
  page: number,
): Promise<{ total: number; items: ClassificationSummary[] } | "expired" | "unavailable"> {
  const params = new URLSearchParams({
    limit: String(HISTORY_PAGE_SIZE),
    offset: String((page - 1) * HISTORY_PAGE_SIZE),
  });
  const result = await apiFetch<{ total: number; items: ClassificationSummary[] }>(
    `/api/classifications?${params}`,
  );
  if (result.ok) return result.data;
  return result.status === 401 || result.status === 403 ? "expired" : "unavailable";
}

// null when there is no such classification of this member
export async function getSaved(
  id: string,
): Promise<SavedClassification | null | "expired" | "unavailable"> {
  const result = await apiFetch<SavedClassification>(`/api/classifications/${encodeURIComponent(id)}`);
  if (result.ok) return result.data;
  if (result.status === 404) return null;
  return result.status === 401 || result.status === 403 ? "expired" : "unavailable";
}

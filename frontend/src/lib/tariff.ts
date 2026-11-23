import "server-only";
import { apiFetch } from "./api";
import type { TreeNode } from "./tariffFormat";

export interface SearchHit {
  code: string;
  descriptionNb: string | null;
  descriptionEn: string | null;
  context: string | null;
}

export interface SearchResult {
  // "all": every word matched; "any": only some of them; "code": digits
  // matched the start of codes
  matched: "all" | "any" | "code";
  hits: SearchHit[];
}

export interface CommodityDetails {
  code: string;
  nodeId: number | null;
  hsCode: string | null;
  descriptionNb: string | null;
  descriptionEn: string | null;
  path: {
    nodeId: number;
    code: string | null;
    hsCode: string | null;
    nodeType: string;
    descriptionNb: string | null;
    descriptionEn: string | null;
  }[];
  unit: string | null;
  unitDescription: string | null;
  secondaryUnit: string | null;
  validFrom: string;
  validTo: string | null;
  references: {
    code: string;
    expression: string | null;
    definitionNbHtml: string | null;
    definitionEnHtml: string | null;
    attachedTo: string | null;
  }[];
}

export const SEARCH_LIMIT = 30;

// Text or code search; never a model, so it is free and has no quota
export async function searchTariff(
  query: string,
  lang: "nb" | "en",
): Promise<SearchResult | "unavailable"> {
  const params = new URLSearchParams({ q: query, lang, limit: String(SEARCH_LIMIT), mode: "text" });
  const result = await apiFetch<SearchResult>(`/api/commodities/search?${params}`);
  return result.ok ? result.data : "unavailable";
}

// null when there is no such code; "unavailable" when the API cannot answer
export async function getCommodity(
  code: string,
): Promise<CommodityDetails | null | "unavailable"> {
  const result = await apiFetch<CommodityDetails>(`/api/commodities/${encodeURIComponent(code)}`);
  if (result.ok) return result.data;
  return result.status === 404 || result.status === 400 ? null : "unavailable";
}

// The sections when nodeId is null; null when the API cannot answer
export async function treeChildren(nodeId: number | null): Promise<TreeNode[] | null> {
  const result = await apiFetch<TreeNode[]>(
    nodeId === null ? "/api/tariff/tree" : `/api/tariff/tree/${nodeId}/children`,
  );
  return result.ok ? result.data : null;
}

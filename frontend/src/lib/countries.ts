import "server-only";
import { apiFetch } from "./api";
import type { Country } from "./duty";

// The origin countries in Tolletaten's data; null when the API cannot answer
export async function listCountries(): Promise<Country[] | null> {
  const result = await apiFetch<Country[]>("/api/countries");
  return result.ok ? result.data : null;
}

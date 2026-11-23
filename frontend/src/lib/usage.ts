import "server-only";
import { apiFetch } from "./api";
import type { Usage } from "./classification";

// Today's quota for the visitor: the member's own, or the guest quota of
// the visitor's address. null when the API cannot tell.
export async function getUsage(): Promise<Usage | null> {
  const result = await apiFetch<Usage>("/api/usage");
  return result.ok ? result.data : null;
}

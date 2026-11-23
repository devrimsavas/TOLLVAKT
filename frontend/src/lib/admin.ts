import "server-only";
import { apiFetch } from "./api";

export interface AdminUser {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "user" | "admin";
  isActive: boolean;
  // The member's own limit, or null for the default
  dailyLimit: number | null;
  // The limit that applies; null for none (admins)
  effectiveDailyLimit: number | null;
  usedToday: number;
  classificationCount: number;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminUsage {
  limits: { guest: number; user: number; global: number };
  today: { used: number; globalLimit: number; remaining: number };
  days: { date: string; classify: number; search: number; members: number; guests: number }[];
}

export const USAGE_DAYS = 30;

export async function getAdminUsers(): Promise<AdminUser[] | null> {
  const result = await apiFetch<AdminUser[]>("/api/admin/users");
  return result.ok ? result.data : null;
}

export async function getAdminUsage(): Promise<AdminUsage | null> {
  const result = await apiFetch<AdminUsage>(`/api/admin/usage?days=${USAGE_DAYS}`);
  return result.ok ? result.data : null;
}

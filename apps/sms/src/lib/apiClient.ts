import { env } from "../env.js";
import type { ToneMode, DailySuggestion } from "@aura/shared";

const base = env.API_BASE_URL;
const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
};

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`API ${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  }
  return json as T;
}

// ── User types ──────────────────────────────────────────────────
export interface ApiUser {
  id: string;
  phoneNumber: string;
  name: string | null;
  timezone: string;
  checkInHour: number;
  toneMode: ToneMode;
  isOnboarded: boolean;
  createdAt: string;
}

// ── Contact types ───────────────────────────────────────────────
export interface ApiContact {
  id: string;
  userId: string;
  name: string;
  relationshipType: string;
  targetFrequencyDays: number;
  lastCheckInAt: string | null;
  birthday: string | null;
  createdAt: string;
}

// ── Routine types ───────────────────────────────────────────────
export interface ApiRoutine {
  id: string;
  userId: string;
  name: string;
  frequencyType: string;
  frequencyValue: number;
  lastDoneAt: string | null;
  createdAt: string;
}

// ── Daily suggestion row ────────────────────────────────────────
export interface ApiDailySuggestionRow {
  id: string;
  userId: string;
  localDate: string;
  payload: DailySuggestion;
  sentAt: string | null;
  createdAt: string;
}

// ── Users ───────────────────────────────────────────────────────

export function getOrCreateUser(phoneNumber: string): Promise<ApiUser> {
  return api<ApiUser>("POST", "/internal/users", { phoneNumber });
}

export function getUserByPhone(phone: string): Promise<ApiUser> {
  return api<ApiUser>("GET", `/internal/users/by-phone/${encodeURIComponent(phone)}`);
}

export function getUser(userId: string): Promise<ApiUser> {
  return api<ApiUser>("GET", `/internal/users/${userId}`);
}

export function updateUser(
  userId: string,
  data: Partial<Pick<ApiUser, "name" | "timezone" | "checkInHour" | "toneMode" | "isOnboarded">>,
): Promise<ApiUser> {
  return api<ApiUser>("PATCH", `/internal/users/${userId}`, data);
}

// ── Contacts ────────────────────────────────────────────────────

export function getContacts(userId: string): Promise<ApiContact[]> {
  return api<ApiContact[]>("GET", `/internal/users/${userId}/contacts`);
}

export function createContact(
  userId: string,
  data: { name: string; targetFrequencyDays: number; relationshipType?: string; birthday?: string },
): Promise<ApiContact> {
  return api<ApiContact>("POST", `/internal/users/${userId}/contacts`, data);
}

// ── Routines ────────────────────────────────────────────────────

export function getRoutines(userId: string): Promise<ApiRoutine[]> {
  return api<ApiRoutine[]>("GET", `/internal/users/${userId}/routines`);
}

export function createRoutine(
  userId: string,
  data: { name: string; frequencyType: string; frequencyValue: number },
): Promise<ApiRoutine> {
  return api<ApiRoutine>("POST", `/internal/users/${userId}/routines`, data);
}

// ── Events ──────────────────────────────────────────────────────

export function recordContactCheckin(contactId: string): Promise<ApiContact> {
  return api<ApiContact>("POST", "/internal/events/contact-checkin", { contactId });
}

export function recordRoutineDone(routineId: string): Promise<ApiRoutine> {
  return api<ApiRoutine>("POST", "/internal/events/routine-done", { routineId });
}

// ── Daily check-in ──────────────────────────────────────────────

export interface DailyCheckinResponse {
  suggestion: DailySuggestion;
  cached: boolean;
}

export function getDailyCheckin(userId: string): Promise<DailyCheckinResponse> {
  return api<DailyCheckinResponse>("GET", `/internal/users/${userId}/daily-checkin`);
}

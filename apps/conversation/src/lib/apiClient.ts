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
  mutedUntil: string | null;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
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

// ── Messages (persistent conversation history) ──────────────────

export interface ApiMessage {
  id: string;
  userId: string;
  role: "user" | "assistant" | "system";
  content: string;
  channel: string | null;
  createdAt: string;
}

export function getMessages(userId: string, limit = 50): Promise<ApiMessage[]> {
  return api<ApiMessage[]>("GET", `/internal/users/${userId}/messages?limit=${limit}`);
}

export function appendMessage(
  userId: string,
  data: { role: "user" | "assistant" | "system"; content: string; channel?: string },
): Promise<ApiMessage> {
  return api<ApiMessage>("POST", `/internal/users/${userId}/messages`, data);
}

export function deleteMessages(userId: string): Promise<{ deleted: number }> {
  return api<{ deleted: number }>("DELETE", `/internal/users/${userId}/messages`);
}

// ── Memories (semantic recall) ──────────────────────────────────

export interface ApiMemory {
  id: string;
  userId: string;
  kind: string;
  content: string;
  importance: number;
  confidence: number;
  source: string;
  attrs: Record<string, unknown>;
  createdAt: string;
  lastRecalledAt: string | null;
  decayedAt: string | null;
  similarity?: number;
  score?: number;
}

export function retrieveMemories(
  userId: string,
  query: string,
  k = 8,
): Promise<ApiMemory[]> {
  return api<ApiMemory[]>("POST", `/internal/users/${userId}/memories/retrieve`, {
    query,
    k,
  });
}

export function listMemories(userId: string): Promise<ApiMemory[]> {
  return api<ApiMemory[]>("GET", `/internal/users/${userId}/memories`);
}

// ── Entities (knowledge graph) ──────────────────────────────────

export interface ApiEntity {
  id: string;
  userId: string;
  kind: string;
  canonical: string;
  aliases: string[];
  attrs: Record<string, unknown>;
  contactId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listEntities(userId: string, kind?: string): Promise<ApiEntity[]> {
  const q = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  return api<ApiEntity[]>("GET", `/internal/users/${userId}/entities${q}`);
}

export function resolveEntity(
  userId: string,
  name: string,
  kind?: string,
): Promise<ApiEntity | null> {
  return api<ApiEntity | null>("POST", `/internal/users/${userId}/entities/resolve`, {
    name,
    kind,
  });
}

// ── Groups ──────────────────────────────────────────────────────

export type ResponsePolicy = "address_only" | "implicit_call" | "quiet" | "host";

export interface ApiGroupParticipant {
  id: string;
  groupSpaceId: string;
  userId: string | null;
  externalHandle: string;
  displayName: string;
  role: string;
  silenced: boolean;
  addedAt: string;
}

export interface ApiGroupSpace {
  id: string;
  externalId: string;
  name: string | null;
  ownerId: string;
  vibe: string | null;
  responsePolicy: ResponsePolicy;
  createdAt: string;
  participants?: ApiGroupParticipant[];
}

export interface ApiGroupMemory {
  id: string;
  groupSpaceId: string;
  kind: string;
  content: string;
  importance: number;
  createdAt: string;
}

export function getOrCreateGroup(opts: {
  externalId: string;
  ownerId: string;
  name?: string;
  vibe?: string;
  responsePolicy?: ResponsePolicy;
}): Promise<ApiGroupSpace> {
  return api<ApiGroupSpace>("POST", "/internal/groups", opts);
}

export function getGroupByExternal(externalId: string): Promise<ApiGroupSpace | null> {
  return api<ApiGroupSpace>("GET", `/internal/groups/by-external?externalId=${encodeURIComponent(externalId)}`)
    .catch(() => null);
}

export function addGroupParticipant(
  groupId: string,
  data: { externalHandle: string; displayName: string; userId?: string; role?: "owner" | "member" | "guest" },
): Promise<ApiGroupParticipant> {
  return api<ApiGroupParticipant>("POST", `/internal/groups/${groupId}/participants`, data);
}

export function listGroupMemories(groupId: string): Promise<ApiGroupMemory[]> {
  return api<ApiGroupMemory[]>("GET", `/internal/groups/${groupId}/memories`);
}

// ── Sprint 7: goals + nudges + agent capabilities ───────────────

export interface ApiGoal {
  id: string;
  userId: string;
  kind: "short" | "long";
  title: string;
  why: string | null;
  deadline: string | null;
  status: "active" | "done" | "paused" | "abandoned";
  createdAt: string;
  updatedAt: string;
}

export function createGoal(
  userId: string,
  data: {
    kind: "short" | "long";
    title: string;
    why?: string;
    deadline?: string;
    milestones?: Array<{ title: string }>;
  },
): Promise<ApiGoal> {
  return api<ApiGoal>("POST", `/internal/users/${userId}/goals`, data);
}

export function updateGoalStatus(
  userId: string,
  goalId: string,
  status: "active" | "done" | "paused" | "abandoned",
): Promise<ApiGoal> {
  return api<ApiGoal>("PATCH", `/internal/users/${userId}/goals/${goalId}/status`, { status });
}

export function scheduleNudge(
  userId: string,
  data: { when: string; kind: string; payload?: Record<string, unknown> },
): Promise<{ id: string }> {
  return api<{ id: string }>("POST", `/internal/users/${userId}/nudges`, data);
}

export function writeMemory(
  userId: string,
  data: { kind: string; content: string; source: string; importance?: number },
): Promise<ApiMemory> {
  return api<ApiMemory>("POST", `/internal/users/${userId}/memories`, data);
}

// ── Sprint 12: orchestrator dispatch ───────────────────────────

export interface SpecialistDispatchResult {
  eventId: string;
  estimateMs: number;
}

export function dispatchSpecialist(
  userId: string,
  data: {
    kind: string;
    brief: {
      goal: string;
      context?: string;
      deadline?: string;
      constraints?: string[];
    };
  },
): Promise<SpecialistDispatchResult> {
  return api<SpecialistDispatchResult>(
    "POST",
    `/internal/users/${userId}/specialists/dispatch`,
    data,
  );
}

// ── Outbound message tracking (Phase 2 governor) ────────────────────

export interface ApiOutboundRow {
  id: string;
  channel: string;
  eventType: string;
  sentAt: string;
  providerSid: string | null;
  replyTo: string | null;
}

export function getRecentOutbound(
  userId: string,
  sinceMinutes = 1440,
): Promise<ApiOutboundRow[]> {
  return api<ApiOutboundRow[]>(
    "GET",
    `/internal/users/${userId}/outbound?sinceMinutes=${sinceMinutes}`,
  );
}

export function recordOutbound(
  userId: string,
  data: {
    channel: string;
    eventType: string;
    body: string;
    providerSid?: string;
    replyTo?: string;
  },
): Promise<ApiOutboundRow> {
  return api<ApiOutboundRow>("POST", `/internal/users/${userId}/outbound`, data);
}

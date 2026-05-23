// Server-side API client — fetches from the internal Aura API using the
// shared INTERNAL_API_SECRET. Only used in Server Components + Route Handlers.
//
// `import "server-only"` makes a build error if anything client-side imports
// this. Without it, a careless `"use client"` import would bundle the secret
// into the public JS bundle.

import "server-only";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3001";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? "";

function headers(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${INTERNAL_API_SECRET}`,
  };
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`api ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`api ${path} → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export async function apiDelete<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`api ${path} → ${res.status}`);
  return (await res.json().catch(() => ({}))) as T;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`api ${path} → ${res.status}`);
  return (await res.json()) as T;
}

// Convenience: shapes we use from the settings pages.

export interface User {
  id: string;
  phoneNumber: string;
  name: string | null;
  timezone: string;
  toneMode: string;
  isOnboarded: boolean;
  createdAt: string;
}

export interface Memory {
  id: string;
  kind: string;
  content: string;
  importance: number;
  confidence: number;
  source: string;
  createdAt: string;
}

export interface IntegrationCard {
  id: string;
  displayName: string;
  description: string;
  transport: "composio" | "shortcut";
  connection: null | {
    id: string;
    status: string;
    connectedAt: string;
    lastSyncAt: string | null;
  };
}

export interface Goal {
  id: string;
  kind: "short" | "long";
  title: string;
  why: string | null;
  status: "active" | "done" | "paused" | "abandoned";
  createdAt: string;
}

export interface MemoryAccess {
  id: string;
  memoryId: string;
  actor: string;
  context: string | null;
  accessedAt: string;
}

export async function getUserByPhone(phone: string): Promise<User | null> {
  try {
    return await apiGet<User>(`/internal/users/by-phone/${encodeURIComponent(phone)}`);
  } catch {
    return null;
  }
}

export function listMemories(userId: string): Promise<Memory[]> {
  return apiGet<Memory[]>(`/internal/users/${userId}/memories`);
}

export function deleteMemory(userId: string, memoryId: string): Promise<unknown> {
  return apiDelete(`/internal/users/${userId}/memories/${memoryId}`);
}

export function listIntegrations(userId: string): Promise<IntegrationCard[]> {
  return apiGet<IntegrationCard[]>(`/internal/users/${userId}/integrations`);
}

export function revokeIntegration(userId: string, app: string): Promise<unknown> {
  return apiPost(`/internal/users/${userId}/integrations/${app}/revoke`, {});
}

export function listGoals(userId: string): Promise<Goal[]> {
  return apiGet<Goal[]>(`/internal/users/${userId}/goals`);
}

export function listAccesses(userId: string): Promise<MemoryAccess[]> {
  return apiGet<MemoryAccess[]>(`/internal/users/${userId}/memory-accesses`);
}

export function exportUser(userId: string): Promise<unknown> {
  return apiGet(`/internal/users/${userId}/export`);
}

export function deleteUser(userId: string): Promise<unknown> {
  return apiDelete(`/internal/users/${userId}`);
}

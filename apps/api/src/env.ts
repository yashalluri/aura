import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().optional(),
  INTERNAL_API_SECRET: z
    .string()
    .min(16, "INTERNAL_API_SECRET must be at least 16 chars"),
  CONVERSATION_BASE_URL: z
    .string()
    .url()
    .default("http://localhost:3002"),

  // Phase 1 — memory extraction (OpenAI) + envelope encryption (KMS root key)
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  KMS_ROOT_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "KMS_ROOT_KEY must be 64 hex chars (32 bytes). Generate with: openssl rand -hex 32")
    .optional(),

  // Phase 4 — Composio integrations (optional in dev; without it, only
  // Shortcut-bridge integrations work)
  COMPOSIO_API_KEY: z.string().min(1).optional(),
  // Retention window for raw signal_events (days). Cron purges anything
  // older. Defaults to 7. Set higher for debugging.
  SIGNAL_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);

export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

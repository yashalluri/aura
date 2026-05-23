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
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required (used for embeddings + memory extraction)"),
  // Sprint 3: integration platform. Optional — integrations disabled if blank.
  COMPOSIO_API_KEY: z.string().optional(),
  // Sprint 4: root key for envelope encryption of per-user keys.
  // 32 bytes = 64 hex chars. Generate with: openssl rand -hex 32
  // Required in production; test mode auto-uses a static key.
  KMS_ROOT_KEY: z.string().length(64, "KMS_ROOT_KEY must be 64 hex chars").optional(),
});

export type Env = z.infer<typeof EnvSchema>;

// Test-mode defaults so unit tests can import any module without a full .env.
// Production / dev still require real values.
const TEST_DEFAULTS: Record<string, string> = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/aura_test",
  INTERNAL_API_SECRET: "test_internal_secret_16_chars_min",
  OPENAI_API_KEY: "sk-test",
};

function loadEnv(): Env {
  const source =
    process.env.NODE_ENV === "test"
      ? { ...TEST_DEFAULTS, ...process.env }
      : process.env;
  return EnvSchema.parse(source);
}

export const env: Env = loadEnv();

export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

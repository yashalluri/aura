import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  CONVERSATION_PORT: z.coerce.number().int().positive().default(3002),

  // Photon Spectrum (iMessage)
  PHOTON_PROJECT_ID: z.string().min(1, "PHOTON_PROJECT_ID is required"),
  PHOTON_PROJECT_SECRET: z.string().min(1, "PHOTON_PROJECT_SECRET is required"),
  PHOTON_LINE_NUMBER: z.string().min(1, "PHOTON_LINE_NUMBER is required"),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),

  // Internal API
  API_BASE_URL: z
    .string()
    .url()
    .default("http://localhost:3001"),
  INTERNAL_API_SECRET: z
    .string()
    .min(16, "INTERNAL_API_SECRET must be at least 16 chars"),

  // Sprint 10: voice mode (optional — leave blank to disable voice route).
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_VOICE_NUMBER: z.string().optional(),
  // ElevenLabs is optional — if blank, voice replies use Twilio's built-in
  // Amazon Polly voice (lower quality but works without an extra account).
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),
  // Public base URL where this conversation worker is reachable (for Twilio
  // callbacks). e.g. https://aura-conversation.your-domain.com
  PUBLIC_BASE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

// Provide harmless defaults in test mode so unit tests can import any module
// without needing a full .env file. Real production parsing still throws.
const TEST_DEFAULTS: Record<string, string> = {
  PHOTON_PROJECT_ID: "test_project",
  PHOTON_PROJECT_SECRET: "test_secret_with_minimum_length_16",
  PHOTON_LINE_NUMBER: "+15555550100",
  OPENAI_API_KEY: "sk-test",
  INTERNAL_API_SECRET: "test_internal_secret_16_chars_min",
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

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
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);

export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

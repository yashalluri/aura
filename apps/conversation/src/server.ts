import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import formbody from "@fastify/formbody";
import { env, isProd } from "./env.js";
import { healthRoutes } from "./routes/health.js";
import { internalRoutes } from "./routes/internal.js";
import { voiceRoutes } from "./routes/voice.js";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : "info",
      transport: isProd
        ? undefined
        : { target: "pino-pretty", options: { translateTime: "HH:MM:ss" } },
    },
  });

  await app.register(cors, { origin: true });
  await app.register(sensible);
  // Twilio sends form-encoded bodies on voice webhooks.
  await app.register(formbody);

  // Public health check
  await app.register(healthRoutes);

  // Internal service-to-service routes (Bearer-auth inside each handler)
  await app.register(internalRoutes);

  // Voice mode (Twilio webhooks — public, signature-validated in handler)
  await app.register(voiceRoutes);

  return app;
}

import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { env, isProd } from "./env.js";
import { webhookRoutes } from "./routes/webhook.js";
import { healthRoutes } from "./routes/health.js";

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

  // Health check
  await app.register(healthRoutes);

  // Twilio inbound SMS webhook
  await app.register(webhookRoutes);

  return app;
}

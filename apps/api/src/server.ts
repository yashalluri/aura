import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { env, isProd } from "./env.js";
import { sendError } from "./lib/errors.js";
import { requireInternalAuth } from "./middleware/internalAuth.js";
import { healthRoutes } from "./routes/health.js";
import { userRoutes } from "./routes/users.js";
import { contactRoutes } from "./routes/contacts.js";
import { routineRoutes } from "./routes/routines.js";
import { eventRoutes } from "./routes/events.js";
import { dailyCheckinRoutes } from "./routes/dailyCheckin.js";
import { waitlistRoutes } from "./routes/waitlist.js";
import { debugRoutes } from "./routes/debug.js";
import { messageRoutes } from "./routes/messages.js";
import { memoryRoutes } from "./routes/memories.js";
import { entityRoutes } from "./routes/entities.js";
import { integrationRoutes } from "./routes/integrations.js";
import { signalsRoutes, publicSignalsRoutes } from "./routes/signals.js";
import { settingsRoutes } from "./routes/settings.js";
import { groupRoutes } from "./routes/groups.js";
import { goalRoutes } from "./routes/goals.js";
import { nudgeRoutes } from "./routes/nudges.js";
import { specialistRoutes } from "./routes/specialists.js";
import { fastifyPlugin as inngestFastify } from "inngest/fastify";
import { inngest } from "./inngest/client.js";
import { functions as inngestFunctions } from "./inngest/functions/index.js";

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

  app.setErrorHandler((err, _req, reply) => sendError(reply, err));

  // Public routes
  await app.register(healthRoutes);

  // Inngest webhook handler (Inngest dev server + cloud both POST here)
  await app.register(inngestFastify, {
    client: inngest,
    functions: inngestFunctions,
    options: {},
  });

  // Internal routes (Bearer secret)
  await app.register(async (instance) => {
    instance.addHook("preHandler", requireInternalAuth);
    await instance.register(userRoutes);
    await instance.register(contactRoutes);
    await instance.register(routineRoutes);
    await instance.register(eventRoutes);
    await instance.register(dailyCheckinRoutes);
    await instance.register(waitlistRoutes);
    await instance.register(messageRoutes);
    await instance.register(memoryRoutes);
    await instance.register(entityRoutes);
    await instance.register(integrationRoutes);
    await instance.register(signalsRoutes);
    await instance.register(settingsRoutes);
    await instance.register(groupRoutes);
    await instance.register(goalRoutes);
    await instance.register(nudgeRoutes);
    await instance.register(specialistRoutes);
  }, { prefix: "/internal" });

  // Public (token-authed) routes — no Bearer required.
  await app.register(publicSignalsRoutes);

  // Debug routes (dev only, also gated by secret)
  if (!isProd) {
    await app.register(async (instance) => {
      instance.addHook("preHandler", requireInternalAuth);
      await instance.register(debugRoutes);
    });
  }

  return app;
}

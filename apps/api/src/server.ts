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
  }, { prefix: "/internal" });

  // Debug routes (dev only, also gated by secret)
  if (!isProd) {
    await app.register(async (instance) => {
      instance.addHook("preHandler", requireInternalAuth);
      await instance.register(debugRoutes);
    });
  }

  return app;
}

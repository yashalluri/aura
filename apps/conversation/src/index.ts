import { buildServer } from "./server.js";
import { env } from "./env.js";
import { startInboundLoop } from "./spectrum.js";

async function main() {
  const app = await buildServer();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: env.CONVERSATION_PORT, host: "0.0.0.0" });
  app.log.info({ port: env.CONVERSATION_PORT }, "fastify listening");

  // Spectrum inbound loop runs in parallel for the life of the process.
  startInboundLoop(app.log).catch((err) => {
    app.log.error({ err }, "spectrum inbound loop crashed");
    process.exit(1);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

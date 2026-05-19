import { buildServer } from "./server.js";
import { env } from "./env.js";
import { assertEnumsInSync } from "./services/enumSync.js";

async function main() {
  assertEnumsInSync();
  const app = await buildServer();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
  app.log.info(
    "scheduler: daily-checkin is now driven by Inngest (cron */15 * * * *)",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

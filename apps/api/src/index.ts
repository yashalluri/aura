import { buildServer } from "./server.js";
import { env } from "./env.js";
import { assertEnumsInSync } from "./services/enumSync.js";
import { startDailyCheckinCron } from "./scheduler/cron.js";

async function main() {
  assertEnumsInSync();
  const app = await buildServer();

  const task = startDailyCheckinCron(app.log);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    task.stop();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

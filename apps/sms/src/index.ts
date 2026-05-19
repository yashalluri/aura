import { buildServer } from "./server.js";
import { env } from "./env.js";
import { startOutboundCron } from "./cron/outbound.js";

async function main() {
  const app = await buildServer();

  const cron = startOutboundCron(app.log);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    cron.stop();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: env.SMS_PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

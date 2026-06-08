import app from "./app";
import { logger } from "./lib/logger";
import { migrate } from "./lib/migrate";
import { startDbKeepAlive } from "./lib/pg";
import { startReminderWorker } from "./worker/reminder";
import { startAutoTeeGenWorker } from "./worker/autoTeeGen";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

startDbKeepAlive();

migrate()
  .then(() => {
    startReminderWorker();
    startAutoTeeGenWorker();
  })
  .catch((err) => {
    logger.warn({ err }, "Migration failed — check DB credentials/firewall. App will serve requests but DB queries may fail.");
    startReminderWorker();
    startAutoTeeGenWorker();
  });

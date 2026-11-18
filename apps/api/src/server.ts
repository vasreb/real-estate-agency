import { createApp } from "./app.js";
import { loadAssistantConfig, loadConfig } from "./infrastructure/config.js";
import { createDatabase } from "./infrastructure/database/index.js";

const config = loadConfig();
const database = createDatabase(config.DATABASE_URL);
const app = createApp(config, {
  database,
  assistantConfig: loadAssistantConfig(),
});
app.addHook("onClose", async () => {
  await database.$disconnect();
});
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  try {
    await app.close();
  } catch {
    process.exitCode = 1;
  }
}
process.once("SIGTERM", () => {
  void shutdown();
});
process.once("SIGINT", () => {
  void shutdown();
});
try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch {
  app.log.fatal({ code: "STARTUP_FAILED" }, "API startup failed");
  await shutdown();
  process.exitCode = 1;
}

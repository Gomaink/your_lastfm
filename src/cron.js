require("dotenv").config();
const cron = require("node-cron");
const sync = require("./index");

cron.schedule("*/10 * * * *", async () => {
  if (running) {
    console.log("⏳ Sync já em execução, pulando...");
    return;
  }

  running = true;

  try {
    await sync();
  } catch (err) {
    console.error("❌ Erro no sync:", err);
  } finally {
    running = false;
  }
});

require("dotenv").config();
const cron = require("node-cron");
const sync = require("./index");

let running = false;

cron.schedule("*/5 * * * *", async () => {
  if (running) {
    console.log("⏳ Sync already in progress, skipping...");
    return;
  }

  running = true;

  try {
    await sync();
    console.log("✅ Sync completed successfully");
  } catch (err) {
    console.error("❌ Sync error:", err);
  } finally {
    running = false;
  }
});

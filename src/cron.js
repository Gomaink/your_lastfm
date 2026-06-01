require("dotenv").config();
const cron = require("node-cron");
const { sync } = require("./sync");
const { verifyIntegrity } = require('./integrity-check');

let running = false;

async function runSync() {
  if (running) return;

  running = true;
  try {
    console.log("Sync started...");
    await sync();
    console.log("✅ Sync completed");
  } catch (err) {
    console.error("❌ Sync error:", err);
  } finally {
    running = false;
  }
}

runSync();

cron.schedule('0 3 * * *', async () => {
    await verifyIntegrity();
});

cron.schedule("*/5 * * * *", runSync);


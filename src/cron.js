require("dotenv").config();

const cron = require("node-cron");

const db = require("./db");
const { sync } = require("./sync");
const { verifyIntegrity } = require("./integrity-check");

let running = false;

async function runSync() {
  if (running) return;

  running = true;
  try {
    const count = db.prepare("SELECT COUNT(*) AS count FROM scrobbles").get().count;
    const result = await sync({ full: count === 0 });

    if (result.started === false) {
      console.log("⏭️ Sync already running in another process");
      return;
    }

    console.log("✅ Scheduled sync completed");
  } catch (error) {
    console.error("❌ Scheduled sync error:", error.message || error);
  } finally {
    running = false;
  }
}

runSync();

cron.schedule(process.env.SYNC_CRON || "*/5 * * * *", runSync);
cron.schedule(process.env.INTEGRITY_CRON || "0 3 * * *", verifyIntegrity);

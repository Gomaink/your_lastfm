require("dotenv").config();

const { sync } = require("./sync");
const db = require("./db");

(async () => {
  const row = db.prepare("SELECT COUNT(*) AS count FROM scrobbles").get();

  if (row.count > 0) {
    console.log("Database already has data, skipping initial sync");
    return;
  }

  console.log("🚀 Running FULL initial sync...");
  await sync({ full: true });
  console.log("✅ FULL initial sync finished");
})().catch(error => {
  console.error("❌ Initial sync failed:", error.message || error);
  process.exitCode = 1;
}).finally(() => db.close());

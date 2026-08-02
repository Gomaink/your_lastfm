require("dotenv").config();

const db = require("./db");
const { sync } = require("./sync");

const full = process.argv.includes("--full");

sync({ full })
  .then(result => {
    if (result.started === false) {
      console.log("⏭️ A sync is already running in another process");
      return;
    }

    console.log(`✅ ${full ? "Full" : "Incremental"} sync completed`);
  })
  .catch(error => {
    console.error("❌ Fatal sync error:", error.message || error);
    process.exitCode = 1;
  })
  .finally(() => db.close());

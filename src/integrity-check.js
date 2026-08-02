require("dotenv").config();

const axios = require("axios");

const db = require("./db");
const { sync } = require("./sync");
const { fetchWithRetry } = require("./utils/fetchRetry");
const { assertLastFmResponse } = require("./utils/lastfmResponse");
const { sanitizeError } = require("./utils/sanitizeAxios");

async function verifyIntegrity() {
  try {
    const response = await fetchWithRetry(async () => {
      const result = await axios.get("https://ws.audioscrobbler.com/2.0/", {
        timeout: Number(process.env.LASTFM_REQUEST_TIMEOUT_MS || 15000),
        params: {
          method: "user.getInfo",
          user: process.env.LASTFM_USERNAME,
          api_key: process.env.LASTFM_API_KEY,
          format: "json"
        }
      });
      assertLastFmResponse(result.data);
      return result;
    });

    const lastfmCount = Number.parseInt(response.data?.user?.playcount || "0", 10);
    const localCount = db.prepare("SELECT COUNT(*) AS count FROM scrobbles").get().count;
    const missingLocally = Math.max(0, lastfmCount - localCount);

    console.log(
      `[Integrity] LastFM=${lastfmCount} Local=${localCount} Missing locally=${missingLocally}`
    );

    if (missingLocally > 25) {
      console.log("[Integrity] Missing history detected, running full sync");
      return sync({ full: true });
    }

    return { checked: true, missingLocally };
  } catch (error) {
    console.error("[Integrity check error]", sanitizeError(error));
    return { checked: false, error: error.message };
  }
}

module.exports = { verifyIntegrity };

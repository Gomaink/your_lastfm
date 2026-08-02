require("dotenv").config();

const axios = require("axios");

const db = require("./db");
const { sync } = require("./sync");
const { fetchWithRetry } = require("./utils/fetchRetry");
const { assertLastFmResponse } = require("./utils/lastfmResponse");
const { sanitizeError } = require("./utils/sanitizeAxios");

const MISSING_THRESHOLD = Math.max(
  1,
  Number.parseInt(process.env.INTEGRITY_MISSING_THRESHOLD || "1", 10) || 1
);

const getLocalCount = db.prepare("SELECT COUNT(*) AS count FROM scrobbles");

async function getLastFmPlaycount() {
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

  const playcount = Number.parseInt(response.data?.user?.playcount, 10);
  if (!Number.isInteger(playcount) || playcount < 0) {
    throw new Error("Last.fm returned an invalid user playcount");
  }

  return playcount;
}

async function verifyIntegrity() {
  try {
    const lastfmCount = await getLastFmPlaycount();
    const localCount = getLocalCount.get().count;
    const difference = lastfmCount - localCount;
    const missingLocally = Math.max(0, difference);
    const extraLocally = Math.max(0, -difference);

    console.log(
      `[Integrity] LastFM=${lastfmCount} Local=${localCount} Missing locally=${missingLocally} Extra locally=${extraLocally}`
    );

    if (missingLocally < MISSING_THRESHOLD) {
      return { checked: true, repaired: false, lastfmCount, localCount, missingLocally, extraLocally };
    }

    console.log(
      `[Integrity] Missing history detected (threshold=${MISSING_THRESHOLD}), running full sync`
    );

    const syncResult = await sync({ full: true });
    if (syncResult.started === false) {
      return {
        checked: true,
        repaired: false,
        deferred: true,
        lastfmCount,
        localCount,
        missingLocally,
        extraLocally
      };
    }

    const repairedLocalCount = getLocalCount.get().count;
    const remainingMissing = Math.max(0, lastfmCount - repairedLocalCount);

    console.log(
      `[Integrity] Repair finished. Local=${repairedLocalCount} Remaining missing=${remainingMissing}`
    );

    return {
      checked: true,
      repaired: true,
      lastfmCount,
      localCount: repairedLocalCount,
      missingLocally: remainingMissing,
      extraLocally: Math.max(0, repairedLocalCount - lastfmCount)
    };
  } catch (error) {
    console.error("[Integrity check error]", sanitizeError(error));
    return { checked: false, error: error.message };
  }
}

module.exports = { verifyIntegrity };

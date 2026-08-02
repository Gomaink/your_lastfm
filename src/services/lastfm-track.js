const axios = require("axios");
require("dotenv").config();

const { fetchWithRetry } = require("../utils/fetchRetry");
const { assertLastFmResponse } = require("../utils/lastfmResponse");

const LASTFM_URL = "https://ws.audioscrobbler.com/2.0/";
const REQUEST_TIMEOUT = Number(process.env.LASTFM_REQUEST_TIMEOUT_MS || 15000);

async function getTrackDuration(artist, track) {
  try {
    const response = await fetchWithRetry(async () => {
      const result = await axios.get(LASTFM_URL, {
        timeout: REQUEST_TIMEOUT,
        params: {
          method: "track.getInfo",
          api_key: process.env.LASTFM_API_KEY,
          artist,
          track,
          format: "json"
        }
      });
      assertLastFmResponse(result.data);
      return result;
    });

    const durationMs = Number(response.data?.track?.duration);
    if (!durationMs || durationMs <= 0) return null;

    return Math.round(durationMs / 1000);
  } catch {
    return null;
  }
}

module.exports = { getTrackDuration };

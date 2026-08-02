const axios = require("axios");
require("dotenv").config();

const { fetchWithRetry } = require("../utils/fetchRetry");
const { assertLastFmResponse } = require("../utils/lastfmResponse");
const { sanitizeError } = require("../utils/sanitizeAxios");

const LASTFM_URL = "https://ws.audioscrobbler.com/2.0/";
const REQUEST_TIMEOUT = Number(process.env.LASTFM_REQUEST_TIMEOUT_MS || 15000);

async function getAlbumImage(artist, album) {
  try {
    const response = await fetchWithRetry(async () => {
      const result = await axios.get(LASTFM_URL, {
        timeout: REQUEST_TIMEOUT,
        params: {
          method: "album.getinfo",
          api_key: process.env.LASTFM_API_KEY,
          artist,
          album,
          format: "json"
        }
      });
      assertLastFmResponse(result.data);
      return result;
    });

    const images = response.data?.album?.image;
    if (!Array.isArray(images)) return null;

    for (let index = images.length - 1; index >= 0; index--) {
      const image = images[index]?.["#text"]?.trim();
      if (image) return image;
    }

    return null;
  } catch (error) {
    console.warn(`⚠️ [Last.fm] Album image failed: ${artist} - ${album}`, sanitizeError(error));
    return null;
  }
}

module.exports = { getAlbumImage };

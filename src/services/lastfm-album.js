const axios = require("axios");
require("dotenv").config();
const { fetchWithRetry } = require("../utils/fetchRetry");
const { sanitizeError } = require("../utils/sanitizeAxios");


const LASTFM_URL = "https://ws.audioscrobbler.com/2.0/";

async function getAlbumImage(artist, album) {
  try {
    const response = await fetchWithRetry(() =>
      axios.get(LASTFM_URL, {
        params: {
          method: "album.getinfo",
          api_key: process.env.LASTFM_API_KEY,
          artist,
          album,
          format: "json"
        }
      })
    );

    const images = response.data?.album?.image;
    if (!images || images.length === 0) return null;

    const image = images[images.length - 1]["#text"];
    return image || null;

  } catch (err) {
    console.warn(
      `⚠️ [Last.fm] Album image failed: ${artist} - ${album}`,
      sanitizeError(err)
    );
    return null;
  }
}

module.exports = { getAlbumImage };

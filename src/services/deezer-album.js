const axios = require("axios");
const { fetchWithRetry } = require("../utils/fetchRetry");

const DEEZER_SEARCH_URL = "https://api.deezer.com/search/album";
const REQUEST_TIMEOUT = Number(process.env.IMAGE_REQUEST_TIMEOUT_MS || 10000);

async function getDeezerAlbumImage(artist, album) {
  try {
    const q = `artist:"${artist}" album:"${album}"`;
    const { data } = await fetchWithRetry(() =>
      axios.get(DEEZER_SEARCH_URL, {
        timeout: REQUEST_TIMEOUT,
        params: { q, limit: 1 }
      }),
      2,
      500
    );

    const item = data?.data?.[0];
    if (!item) return null;

    return item.cover_xl || item.cover_big || item.cover_medium || item.cover || null;
  } catch {
    return null;
  }
}

module.exports = { getDeezerAlbumImage };

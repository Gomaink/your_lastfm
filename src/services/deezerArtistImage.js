const axios = require("axios");
const { fetchWithRetry } = require("../utils/fetchRetry");

const REQUEST_TIMEOUT = Number(process.env.IMAGE_REQUEST_TIMEOUT_MS || 10000);

async function fetchDeezerArtistImage(artist) {
  try {
    const response = await fetchWithRetry(() =>
      axios.get("https://api.deezer.com/search/artist", {
        timeout: REQUEST_TIMEOUT,
        params: { q: artist, limit: 1 }
      }),
      2,
      500
    );

    const item = response.data?.data?.[0];
    if (!item) return null;

    return item.picture_xl || item.picture_big || item.picture_medium || null;
  } catch (error) {
    console.warn(`Deezer artist image failed for ${artist}: ${error.message}`);
    return null;
  }
}

module.exports = { fetchArtistImage: fetchDeezerArtistImage };

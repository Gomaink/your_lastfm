const axios = require("axios");

const API = "https://ws.audioscrobbler.com/2.0/";

async function getRecentTracks(page = 1, retries = 3) {
  try {
    const { data } = await axios.get(API, {
      timeout: 10000,
      params: {
        method: "user.getrecenttracks",
        user: process.env.LASTFM_USERNAME,
        api_key: process.env.LASTFM_API_KEY,
        format: "json",
        limit: 200,
        page
      }
    });

    if (data.error) {
      throw new Error(data.message);
    }

    return data.recenttracks;
  } catch (err) {
    if (retries > 0) {
      console.log(`Erro Last.fm (página ${page}), retry...`);
      await new Promise(r => setTimeout(r, 3000));
      return getRecentTracks(page, retries - 1);
    }

    throw err;
  }
}

module.exports = { getRecentTracks };

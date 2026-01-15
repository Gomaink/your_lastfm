const axios = require("axios");

const DEEZER_SEARCH_URL = "https://api.deezer.com/search/album";

async function getDeezerAlbumImage(artist, album) {
  try {

    const q = `artist:"${artist}" album:"${album}"`;

    const { data } = await axios.get(DEEZER_SEARCH_URL, {
      params: { q, limit: 1 }
    });

    const item = data?.data?.[0];

    if (!item) {
      return null;
    }

    const image =
      item.cover_xl ||
      item.cover_big ||
      item.cover_medium ||
      item.cover ||
      null;

    if (image) {
      return image;
    }

    return null;

  } catch (err) {
    return null;
  }
}

module.exports = { getDeezerAlbumImage };

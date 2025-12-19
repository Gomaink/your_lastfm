const axios = require("axios");

require("dotenv").config();

const LASTFM_URL = "https://ws.audioscrobbler.com/2.0/";

async function getAlbumImage(artist, album) {
  try {
    const { data } = await axios.get(LASTFM_URL, {
      params: {
        method: "album.getinfo",
        api_key: process.env.LASTFM_API_KEY,
        artist: artist,
        album: album,
        format: "json"
      }
    });

    const images = data?.album?.image;
    if (!images || images.length === 0) {
      console.log(`⚠️ Sem imagem: ${artist} - ${album}`);
      return null;
    }

    const image = images[images.length - 1]["#text"];
    return image || null;

  } catch (err) {
    console.error(`❌ Erro capa ${artist} - ${album}`);
    if (err.response?.data) {
      console.error(err.response.data);
    }
    return null;
  }
}

module.exports = { getAlbumImage };

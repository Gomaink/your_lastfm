const db = require("../db");
const { fetchDeezerArtistImage } = require("./deezerArtistImage");

async function ensureArtistImage(artist) {

  const cached = db.prepare(`
    SELECT artist_image
    FROM artists
    WHERE artist = ?
  `).get(artist);

  if (cached?.artist_image) {
    return cached.artist_image;
  }

  const image = await fetchDeezerArtistImage(artist);

  if (!image) {
    return null;
  }

  db.prepare(`
    INSERT OR REPLACE INTO artists (artist, artist_image)
    VALUES (?, ?)
  `).run(artist, image);

  return image;
}

module.exports = { ensureArtistImage };

const { getAlbumImage } = require("./lastfm-album");
const db = require("../db");

async function ensureAlbumCover(artist, album) {
  const row = db.prepare(`
    SELECT album_image
    FROM scrobbles
    WHERE artist = ? AND album = ?
      AND album_image IS NOT NULL
    LIMIT 1
  `).get(artist, album);

  if (row?.album_image) {
    return row.album_image;
  }

  const image = await getAlbumImage(artist, album);
  if (!image) return null;

  db.prepare(`
    UPDATE scrobbles
    SET album_image = ?
    WHERE artist = ? AND album = ?
  `).run(image, artist, album);

  return image;
}

module.exports = { ensureAlbumCover };

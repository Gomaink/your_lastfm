const db = require("../db");
const { fetchArtistImage } = require("./deezerArtistImage");

const getCachedImage = db.prepare(`
  SELECT artist_image, updated_at
  FROM artists
  WHERE artist = ?
`);

const saveCachedImage = db.prepare(`
  INSERT INTO artists (artist, artist_image, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(artist) DO UPDATE SET
    artist_image = excluded.artist_image,
    updated_at = excluded.updated_at
`);

const inFlight = new Map();
const failureTtlMs = Math.max(60000, Number(process.env.IMAGE_FAILURE_CACHE_MS) || 10 * 60 * 1000);

async function ensureArtistImage(artist) {
  if (!artist) return null;

  const cached = getCachedImage.get(artist);
  if (cached?.artist_image) return cached.artist_image;
  if (cached?.updated_at && cached.updated_at > Date.now() - failureTtlMs) return null;
  if (inFlight.has(artist)) return inFlight.get(artist);

  const request = fetchArtistImage(artist)
    .then(image => {
      saveCachedImage.run(artist, image, Date.now());
      return image || null;
    })
    .finally(() => inFlight.delete(artist));

  inFlight.set(artist, request);
  return request;
}

module.exports = { ensureArtistImage };

const { getAlbumImage } = require("./lastfm-album");
const { getDeezerAlbumImage } = require("./deezer-album");
const db = require("../db");

const getCachedCover = db.prepare(`
  SELECT MAX(NULLIF(album_image, '')) AS album_image
  FROM scrobbles
  WHERE artist = ? AND album = ?
`);

const updateCachedCover = db.prepare(`
  UPDATE scrobbles
  SET album_image = ?
  WHERE artist = ? AND album = ?
`);

const inFlight = new Map();
const failedUntil = new Map();
const failureTtlMs = Math.max(60000, Number(process.env.IMAGE_FAILURE_CACHE_MS) || 10 * 60 * 1000);

async function fetchAndCacheAlbumCover(artist, album) {
  let image = await getAlbumImage(artist, album);
  if (!image) image = await getDeezerAlbumImage(artist, album);
  if (!image) return null;

  updateCachedCover.run(image, artist, album);
  return image;
}

async function ensureAlbumCover(artist, album) {
  if (!artist || !album) return null;

  const cached = getCachedCover.get(artist, album)?.album_image;
  if (cached) return cached;

  const key = `${artist}\u0000${album}`;
  if ((failedUntil.get(key) || 0) > Date.now()) return null;
  if (inFlight.has(key)) return inFlight.get(key);

  const request = fetchAndCacheAlbumCover(artist, album)
    .then(image => {
      if (image) failedUntil.delete(key);
      else failedUntil.set(key, Date.now() + failureTtlMs);
      return image;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, request);
  return request;
}

module.exports = { ensureAlbumCover };

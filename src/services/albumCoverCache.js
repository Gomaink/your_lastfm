const { getAlbumImage } = require("./lastfm-album");
const { getDeezerAlbumImage } = require("./deezer-album");
const { isUsableImageUrl, normalizeImageUrl } = require("../utils/lastfmImage");
const db = require("../db");

const getCachedCovers = db.prepare(`
  SELECT DISTINCT album_image
  FROM scrobbles
  WHERE artist = ? COLLATE NOCASE
    AND album = ? COLLATE NOCASE
    AND album_image IS NOT NULL
    AND TRIM(album_image) != ''
`);

const updateCachedCover = db.prepare(`
  UPDATE scrobbles
  SET album_image = ?
  WHERE artist = ? COLLATE NOCASE
    AND album = ? COLLATE NOCASE
`);

const inFlight = new Map();
const failedUntil = new Map();
const failureTtlMs = Math.max(60000, Number(process.env.IMAGE_FAILURE_CACHE_MS) || 10 * 60 * 1000);

function getCachedAlbumCover(artist, album) {
  const rows = getCachedCovers.all(artist, album);

  for (const row of rows) {
    const image = normalizeImageUrl(row.album_image);
    if (isUsableImageUrl(image)) return image;
  }

  return null;
}

function rememberAlbumCover(artist, album, image) {
  const normalized = normalizeImageUrl(image);
  if (!artist || !album || !isUsableImageUrl(normalized)) return null;

  updateCachedCover.run(normalized, artist, album);
  return normalized;
}

async function fetchAndCacheAlbumCover(artist, album) {
  let image = await getAlbumImage(artist, album);
  if (!image) image = await getDeezerAlbumImage(artist, album);
  return rememberAlbumCover(artist, album, image);
}

async function ensureAlbumCover(artist, album) {
  if (!artist || !album) return null;

  const cached = getCachedAlbumCover(artist, album);
  if (cached) return cached;

  const key = `${String(artist).toLocaleLowerCase()}\u0000${String(album).toLocaleLowerCase()}`;
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

module.exports = {
  ensureAlbumCover,
  getCachedAlbumCover,
  rememberAlbumCover
};

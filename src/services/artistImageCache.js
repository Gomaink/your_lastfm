const db = require("../db");
const { fetchArtistImage } = require("./deezerArtistImage");
const { isUsableImageUrl, normalizeImageUrl } = require("../utils/lastfmImage");

const getCachedImage = db.prepare(`
  SELECT artist, artist_image, updated_at
  FROM artists
  WHERE artist = ? COLLATE NOCASE
  ORDER BY updated_at DESC
  LIMIT 1
`);

const updateCachedImage = db.prepare(`
  UPDATE artists
  SET artist_image = ?, updated_at = ?
  WHERE artist = ? COLLATE NOCASE
`);

const insertCachedImage = db.prepare(`
  INSERT INTO artists (artist, artist_image, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(artist) DO UPDATE SET
    artist_image = excluded.artist_image,
    updated_at = excluded.updated_at
`);

const saveCachedImage = db.transaction((artist, image, updatedAt) => {
  const update = updateCachedImage.run(image, updatedAt, artist);
  if (!update.changes) insertCachedImage.run(artist, image, updatedAt);
});

const inFlight = new Map();
const failureTtlMs = Math.max(60000, Number(process.env.IMAGE_FAILURE_CACHE_MS) || 10 * 60 * 1000);

function getCachedArtistImage(artist) {
  if (!artist) return null;

  const cached = getCachedImage.get(artist);
  const image = normalizeImageUrl(cached?.artist_image);
  return isUsableImageUrl(image) ? image : null;
}

function rememberArtistImage(artist, image) {
  const normalized = normalizeImageUrl(image);
  if (!artist || !isUsableImageUrl(normalized)) return null;

  saveCachedImage(artist, normalized, Date.now());
  return normalized;
}

async function ensureArtistImage(artist) {
  if (!artist) return null;

  const cached = getCachedImage.get(artist);
  const cachedImage = getCachedArtistImage(artist);
  if (cachedImage) return cachedImage;
  if (cached?.updated_at && cached.updated_at > Date.now() - failureTtlMs) return null;

  const key = String(artist).toLocaleLowerCase();
  if (inFlight.has(key)) return inFlight.get(key);

  const request = fetchArtistImage(artist)
    .then(image => {
      const saved = rememberArtistImage(artist, image);
      if (!saved) saveCachedImage(artist, null, Date.now());
      return saved;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, request);
  return request;
}

module.exports = { ensureArtistImage, getCachedArtistImage, rememberArtistImage };

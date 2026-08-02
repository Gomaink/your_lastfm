const db = require("../db");
const { ensureAlbumCover } = require("./albumCoverCache");
const { getDeezerTrackImage } = require("./deezer-track");
const { getTrackCoverInfo } = require("./lastfm-track");
const { isUsableImageUrl, normalizeImageUrl } = require("../utils/lastfmImage");

const getTrackRows = db.prepare(`
  SELECT album, album_image
  FROM scrobbles
  WHERE artist = ? COLLATE NOCASE
    AND track = ? COLLATE NOCASE
  ORDER BY played_at DESC
`);

const updateTrackCover = db.prepare(`
  UPDATE scrobbles
  SET
    album_image = ?,
    album = CASE
      WHEN (album IS NULL OR TRIM(album) = '') AND ? IS NOT NULL THEN ?
      ELSE album
    END
  WHERE artist = ? COLLATE NOCASE
    AND track = ? COLLATE NOCASE
`);

const inFlight = new Map();
const failedUntil = new Map();
const failureTtlMs = Math.max(60000, Number(process.env.IMAGE_FAILURE_CACHE_MS) || 10 * 60 * 1000);

function getCachedTrackCover(artist, track) {
  const rows = getTrackRows.all(artist, track);

  for (const row of rows) {
    const image = normalizeImageUrl(row.album_image);
    if (isUsableImageUrl(image)) {
      return { image, album: String(row.album || "").trim() || null };
    }
  }

  return {
    image: null,
    album: rows.map(row => String(row.album || "").trim()).find(Boolean) || null
  };
}

function rememberTrackCover(artist, track, album, image) {
  const normalized = normalizeImageUrl(image);
  if (!artist || !track || !isUsableImageUrl(normalized)) return null;

  const normalizedAlbum = String(album || "").trim() || null;
  updateTrackCover.run(normalized, normalizedAlbum, normalizedAlbum, artist, track);
  return normalized;
}

async function fetchAndCacheTrackCover(artist, track, knownAlbum) {
  const info = await getTrackCoverInfo(artist, track);
  const album = info.album || knownAlbum;
  let image = info.image;

  if (!image && album) image = await ensureAlbumCover(artist, album);
  if (!image) image = await getDeezerTrackImage(artist, track);

  return rememberTrackCover(artist, track, album, image);
}

async function ensureTrackCover(artist, track) {
  if (!artist || !track) return null;

  const cached = getCachedTrackCover(artist, track);
  if (cached.image) return cached.image;

  const key = `${String(artist).toLocaleLowerCase()}\u0000${String(track).toLocaleLowerCase()}`;
  if ((failedUntil.get(key) || 0) > Date.now()) return null;
  if (inFlight.has(key)) return inFlight.get(key);

  const request = fetchAndCacheTrackCover(artist, track, cached.album)
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
  ensureTrackCover,
  getCachedTrackCover,
  rememberTrackCover
};

const db = require("../db");
const { getTrackDuration } = require("./lastfm-track");

const FALLBACK_SECONDS = 180;
const failureTtlMs = Math.max(60000, Number(process.env.METADATA_FAILURE_CACHE_MS) || 10 * 60 * 1000);

const getCachedDuration = db.prepare(`
  SELECT MAX(track_duration) AS track_duration
  FROM scrobbles
  WHERE artist = ? AND track = ?
`);

const updateCachedDuration = db.prepare(`
  UPDATE scrobbles
  SET track_duration = ?
  WHERE artist = ? AND track = ?
`);

const inFlight = new Map();
const failedUntil = new Map();

async function ensureTrackDuration(artist, track) {
  if (!artist || !track) return FALLBACK_SECONDS;

  const cached = getCachedDuration.get(artist, track)?.track_duration;
  if (cached) return cached;

  const key = `${artist}\u0000${track}`;
  if ((failedUntil.get(key) || 0) > Date.now()) return FALLBACK_SECONDS;
  if (inFlight.has(key)) return inFlight.get(key);

  const request = getTrackDuration(artist, track)
    .then(duration => {
      if (!duration) {
        failedUntil.set(key, Date.now() + failureTtlMs);
        return FALLBACK_SECONDS;
      }

      failedUntil.delete(key);
      updateCachedDuration.run(duration, artist, track);
      return duration;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, request);
  return request;
}

module.exports = { ensureTrackDuration };

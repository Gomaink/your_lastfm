const db = require("../db");
const { getTrackDuration } = require("./lastfm-track");

const FALLBACK_SECONDS = 180;

async function ensureTrackDuration(artist, track) {
  const row = db.prepare(`
    SELECT track_duration
    FROM scrobbles
    WHERE artist = ? AND track = ?
      AND track_duration IS NOT NULL
    LIMIT 1
  `).get(artist, track);

  if (row?.track_duration) {
    return row.track_duration;
  }

  const duration = await getTrackDuration(artist, track);

  const finalDuration = duration || FALLBACK_SECONDS;

  db.prepare(`
    UPDATE scrobbles
    SET track_duration = ?
    WHERE artist = ? AND track = ?
  `).run(finalDuration, artist, track);

  /*console.log(
    duration
      ? `Cached duration: ${artist} - ${track} (${finalDuration}s)`
      : `Fallback duration used: ${artist} - ${track}`
  );*/

  return finalDuration;
}

module.exports = { ensureTrackDuration };

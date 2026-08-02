const fastCsv = require("fast-csv");
const { Readable } = require("stream");

const db = require("../db");

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO scrobbles
  (artist, track, album, album_image, played_at, track_duration)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertBatch = db.transaction(rows => {
  let imported = 0;

  for (const row of rows) {
    const result = insertStmt.run(
      row.artist,
      row.track,
      row.album,
      row.albumImage,
      row.playedAt,
      row.trackDuration
    );

    imported += result.changes;
  }

  return imported;
});

function normalizeRow(row) {
  const artist = String(row.artist || "").trim();
  const track = String(row.track || "").trim();
  const playedAt = Number(row.played_at);
  const duration = Number(row.track_duration);
  const maximumTimestamp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

  if (
    !artist
    || !track
    || !Number.isInteger(playedAt)
    || playedAt <= 0
    || playedAt > maximumTimestamp
  ) {
    return null;
  }

  return {
    artist,
    track,
    album: String(row.album || "").trim() || null,
    albumImage: String(row.album_image || "").trim() || null,
    playedAt,
    trackDuration: Number.isInteger(duration) && duration > 0 ? duration : null
  };
}

function importScrobbleCSV(buffer) {
  return new Promise((resolve, reject) => {
    const batch = [];
    let imported = 0;
    let processed = 0;
    let skipped = 0;
    let settled = false;

    function flushBatch() {
      if (!batch.length) return;
      imported += insertBatch(batch.splice(0, batch.length));
    }

    const input = Readable.from([buffer]);
    const parser = fastCsv.parse({
        headers: true,
        ignoreEmpty: true,
        trim: true
      });

    const fail = error => {
      if (settled) return;
      settled = true;
      input.destroy();
      parser.destroy();
      reject(error);
    };

    input
      .pipe(parser)
      .on("error", fail)
      .on("data", row => {
        if (settled) return;

        try {
          processed++;
          const normalized = normalizeRow(row);

          if (!normalized) {
            skipped++;
            return;
          }

          batch.push(normalized);
          if (batch.length >= 1000) flushBatch();
        } catch (error) {
          fail(error);
        }
      })
      .on("end", () => {
        if (settled) return;

        try {
          flushBatch();
          settled = true;
          resolve({ imported, processed, skipped, duplicates: processed - skipped - imported });
        } catch (error) {
          fail(error);
        }
      });
  });
}

module.exports = { importScrobbleCSV };

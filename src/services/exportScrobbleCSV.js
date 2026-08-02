const fastCsv = require("fast-csv");
const { Readable } = require("stream");

const db = require("../db");

function exportScrobbleCSV(res) {
  const stmt = db.prepare(`
    SELECT
      id,
      artist,
      track,
      album,
      album_image,
      track_duration,
      played_at
    FROM scrobbles
    ORDER BY played_at ASC
  `);

  const rowStream = Readable.from(stmt.iterate(), { objectMode: true });
  const csvStream = fastCsv.format({ headers: true });
  let aborted = false;

  const abort = error => {
    if (aborted) return;
    aborted = true;

    if (error) console.error("CSV export error:", error);
    rowStream.destroy();
    csvStream.destroy();
    if (error && !res.destroyed) res.destroy(error);
  };

  rowStream.on("error", abort);
  csvStream.on("error", abort);
  res.on("close", () => {
    if (!res.writableEnded) abort();
  });

  rowStream.pipe(csvStream).pipe(res);
}

module.exports = { exportScrobbleCSV };

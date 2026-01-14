const db = require("../db");
const fastCsv = require("fast-csv");
const { Readable } = require("stream");

// Import scrobble from CSV File
// we receive a buffer and a response object, so we can read the csv file buffer
function importScrobbleCSV(buffer, res) {
  try {
    const stream = Readable.from(buffer.toString());

    // INSERT OR IGNORE, a quick solution for duplicated entries...
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO scrobbles
      (artist, track, album, album_image, played_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        insertStmt.run(
          row.artist,
          row.track,
          row.album || null,
          row.album_image || null,
          Number(row.played_at)
        );
      }
    });

    const rows = [];

    stream
      .pipe(fastCsv.parse({ headers: true, ignoreEmpty: true }))
      .on("error", (err) => {
        console.error(err);
        res.status(400).json({ error: "Invalid CSV" });
      })
      .on("data", (row) => {
        rows.push(row);
      })
      .on("end", () => {
        insertMany(rows);
        res.json({ imported: rows.length });
      });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { importScrobbleCSV };

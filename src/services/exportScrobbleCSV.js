const db = require("../db");
const fastCsv = require("fast-csv");

// Export scrobble to CSV File
// we receive a response object, so we can write the csv file to the response
function exportScrobbleCSV(res) {

  // creating csv Stream and 'piping' it to the response object
  const csvStream = fastCsv.format({ headers: true });
  csvStream.pipe(res);

  const stmt = db.prepare(`
    SELECT
      id,
      artist,
      track,
      album,
      album_image,
      played_at
    FROM scrobbles
  `);

  try {
    for (const row of stmt.iterate()) {
      csvStream.write(row);
    }
  } catch (err) {
    console.error("CSV export error:", err);
  } finally {
    csvStream.end();
  }

  res.on("close", () => {
    csvStream.end();
  });
}

module.exports = {
  exportScrobbleCSV,
};

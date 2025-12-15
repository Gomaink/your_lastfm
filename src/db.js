const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "../data/stats.db"));

db.prepare(`
  CREATE TABLE IF NOT EXISTS scrobbles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist TEXT NOT NULL,
    track TEXT NOT NULL,
    album TEXT,
    album_image TEXT,
    played_at INTEGER NOT NULL,
    UNIQUE(artist, track, played_at)
  )
`).run();

try {
  db.prepare(`
    ALTER TABLE scrobbles ADD COLUMN album_image TEXT
  `).run();
  console.log("✅ coluna album_image adicionada");
} catch (e) {
}


module.exports = db;

const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "../data/stats.db"));

db.prepare(`
  CREATE TABLE IF NOT EXISTS scrobbles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist TEXT NOT NULL,
    track TEXT NOT NULL,
    track_duration INTEGER,
    album TEXT,
    album_image TEXT,
    played_at INTEGER NOT NULL,
    UNIQUE(artist, track, played_at)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS artists (
    artist TEXT PRIMARY KEY,
    artist_image TEXT,
    updated_at INTEGER
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT
  );
`).run();

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_scrobble_unique
  ON scrobbles (
      artist,
      track,
      album,
      played_at
  );
`);

try {
  db.prepare(`
    ALTER TABLE scrobbles ADD COLUMN track_duration INTEGER;
  `).run();
  console.log("✅ coluna track_duration adicionada");
} catch (e) {
}


module.exports = db;

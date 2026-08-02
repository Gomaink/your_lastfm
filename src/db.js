const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "../data");

fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(dataDir, "stats.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("busy_timeout = 5000");
db.pragma("temp_store = MEMORY");
db.pragma("foreign_keys = ON");

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
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS dashboard_cache (
    cache_key TEXT PRIMARY KEY,
    revision INTEGER NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`).run();

const scrobbleColumns = db.prepare("PRAGMA table_info(scrobbles)").all();
const hasTrackDuration = scrobbleColumns.some(column => column.name === "track_duration");

if (!hasTrackDuration) {
  db.prepare("ALTER TABLE scrobbles ADD COLUMN track_duration INTEGER").run();
  console.log("✅ Column track_duration added");
}

const scrobblesTable = db.prepare(`
  SELECT sql
  FROM sqlite_master
  WHERE type = 'table' AND name = 'scrobbles'
`).get();

const hasInlineUniqueConstraint = /UNIQUE\s*\(\s*artist\s*,\s*track\s*,\s*played_at\s*\)/i
  .test(scrobblesTable?.sql || "");

if (hasInlineUniqueConstraint) {
  db.exec("DROP INDEX IF EXISTS idx_scrobble_unique");
} else {
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_scrobble_unique
    ON scrobbles (artist, track, played_at)
  `);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_scrobbles_played_at
  ON scrobbles (played_at DESC);

  CREATE INDEX IF NOT EXISTS idx_scrobbles_artist_played_at
  ON scrobbles (artist, played_at DESC);

  CREATE INDEX IF NOT EXISTS idx_scrobbles_artist_album
  ON scrobbles (artist, album);

  CREATE INDEX IF NOT EXISTS idx_scrobbles_artist_track
  ON scrobbles (artist, track);
`);

module.exports = db;
module.exports.dataDir = dataDir;
module.exports.dbPath = dbPath;

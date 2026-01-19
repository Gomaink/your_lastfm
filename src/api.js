require('dotenv').config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");

const db = require("./db");

const { getActiveFilter } = require("./utils/filters");
const { fillMissingDates } = require("./utils/dateRange");
const { ensureAlbumCover } = require("./services/albumCoverCache");
const { ensureArtistImage } = require("./services/artistImageCache");
const { importScrobbleCSV } = require("./services/importScrobbleCSV");
const { exportScrobbleCSV } = require("./services/exportScrobbleCSV");
const { ensureTrackDuration } = require("./services/trackDurationCache");
const { fetchWithRetry } = require("./utils/fetchRetry");
const { sanitizeError } = require("./utils/sanitizeAxios");


const app = express();
const PORT = process.env.PORT || 1533;
const AVG_TRACK_SECONDS = 180;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.get("/api/top-artists", async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const filter = getActiveFilter(req.query);

    // Filter  Debug
    //console.log(`[Top Artists] Filter: "${filter.where}" | Params: ${filter.params}`);

    const query = `
      SELECT artist, COUNT(*) plays
      FROM scrobbles
      ${filter.where ? `WHERE ${filter.where}` : ""}
      GROUP BY artist
      ORDER BY plays DESC
      LIMIT 10
    `;

    const rows = db.prepare(query).all(...filter.params);

    for (const r of rows) {
      try {
        r.image = await ensureArtistImage(r.artist);
      } catch {
        r.image = null;
      }
    }

    res.json(rows);

  } catch (err) {
    console.error("[ERROR Top Artists]", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/api/top-tracks", async (req, res) => {
  const filter = getActiveFilter(req.query);

  const rows = db.prepare(`
    SELECT
      track, artist, album, album_image,
      COUNT(*) plays
    FROM scrobbles
    WHERE album IS NOT NULL
    ${filter.where ? `AND ${filter.where}` : ""}
    GROUP BY track, artist, album
    ORDER BY plays DESC
    LIMIT 20
  `).all(...(filter.params || []));

  for (const row of rows) {
    const duration = await ensureTrackDuration(row.artist, row.track);
    row.total_seconds = duration * row.plays;

    if (!row.album_image) {
      row.album_image = await ensureAlbumCover(row.artist, row.album);
    }
  }

  res.json(rows);
});

app.get("/api/plays-per-day", (req, res) => {
  const filter = getActiveFilter(req.query);

  const rows = db.prepare(`
    SELECT
      date(played_at, 'unixepoch') day,
      COUNT(*) plays
    FROM scrobbles
    ${filter.where ? `WHERE ${filter.where}` : ""}
    GROUP BY day
    ORDER BY day
  `).all(...(filter.params || []));

  const result = fillMissingDates(rows, req.query.range, req.query.year, req.query.month);
  res.json(result);
});

app.get("/api/summary", (req, res) => {
  const filter = getActiveFilter(req.query);

  const row = db.prepare(`
    SELECT
      COUNT(*) totalPlays,
      COUNT(DISTINCT date(played_at, 'unixepoch')) days
    FROM scrobbles
    ${filter.where ? `WHERE ${filter.where}` : ""}
  `).get(...(filter.params || []));

  const totalMinutes = Math.round((row.totalPlays * AVG_TRACK_SECONDS) / 60);
  const avgPerDay = row.days ? (row.totalPlays / row.days).toFixed(1) : 0;

  res.json({
    totalPlays: row.totalPlays,
    totalMinutes,
    avgPerDay
  });
});

app.get("/api/top-albums", async (req, res) => {
  const filter = getActiveFilter(req.query);
  const filterClause = filter.where ? `AND ${filter.where}` : '';

  const albums = db.prepare(`
    SELECT artist, album, album_image, COUNT(*) plays
    FROM scrobbles
    WHERE album IS NOT NULL
    ${filterClause}
    GROUP BY artist, album
    ORDER BY plays DESC
    LIMIT 12
  `).all(...(filter.params || []));

  for (const a of albums) {
    if (!a.album_image) {
      a.album_image = await ensureAlbumCover(a.artist, a.album);
    }
  }

  res.json(albums);
});

app.post("/api/album-cover", upload.single("cover"), (req, res) => {
  const { artist, album } = req.body;

  if (!artist || !album || !req.file) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const hash = crypto
    .createHash("sha1")
    .update(`${artist}::${album}`)
    .digest("hex");

  const ext = path.extname(req.file.originalname) || ".jpg";
  const fileName = `${hash}${ext}`;

  const coversDir = path.join(__dirname, "../public/covers/albums");
  fs.mkdirSync(coversDir, { recursive: true });

  const filePath = path.join(coversDir, fileName);
  fs.writeFileSync(filePath, req.file.buffer);

  const publicPath = `/covers/albums/${fileName}`;

  db.prepare(`
    UPDATE scrobbles
    SET album_image = ?
    WHERE artist = ? AND album = ?
  `).run(publicPath, artist, album);

  //console.log(`Manual cover added: ${artist} - ${album}`);

  res.json({ image: publicPath });
});

app.get("/api/recent-scrobbles", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = 20;

    const response = await fetchWithRetry(() =>
      axios.get("https://ws.audioscrobbler.com/2.0/", { params: {
        method: "user.getrecenttracks",
        user: process.env.LASTFM_USERNAME,
        api_key: process.env.LASTFM_API_KEY,
        format: "json",
        limit,
        page
      } })
    );

    const recentTracks = response.data?.recenttracks;
    const tracks = recentTracks?.track || [];
    const attr = recentTracks?.["@attr"];

    const parsed = tracks
      .filter(t => !(page > 1 && t["@attr"]?.nowplaying))
      .map(t => ({
        track: t.name,
        artist: t.artist["#text"],
        image: t.image?.find(i => i.size === "extralarge")?.["#text"] ||
               t.image?.find(i => i.size === "large")?.["#text"] || null,
        nowPlaying: Boolean(t["@attr"]?.nowplaying),
        date: t.date ? Number(t.date.uts) * 1000 : null
      }));

    res.json({
      tracks: parsed,
      hasMore: page < Number(attr?.totalPages || 1)
    });

  } catch (err) {
    console.error("[recent-scrobbles ERROR]", sanitizeError(err));

    res.status(500).json({ error: "Failed to fetch recent scrobbles" });
  }
});

app.post("/api/import/scrobbles", upload.single("file"), (req, res) => {
  if(!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const allowedMimeTypes = [
    "text/csv",
    "application/vnd.ms-excel",
    "text/plain",
    "application/csv"
  ];

  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    return res.status(400).json({
      error: `Invalid file type: ${req.file.mimetype}`
    });
  }

  importScrobbleCSV(req.file.buffer, res);
})

app.get("/api/export/scrobbles", (req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="scrobbles.csv"'
  );

  exportScrobbleCSV(res);
});

app.listen(PORT, () => {
  console.log(`🚀 Dashboard running in http://localhost:${PORT}`);
});

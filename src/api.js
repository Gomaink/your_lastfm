require("dotenv").config();

const axios = require("axios");
const cors = require("cors");
const crypto = require("crypto");
const express = require("express");
const fs = require("fs/promises");
const multer = require("multer");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const db = require("./db");
const { startSync, getSyncStatus } = require("./sync");
const { getActiveFilter } = require("./utils/filters");
const { fillMissingDates } = require("./utils/dateRange");
const { fetchWithRetry } = require("./utils/fetchRetry");
const { assertLastFmResponse } = require("./utils/lastfmResponse");
const { mapWithConcurrency } = require("./utils/mapWithConcurrency");
const { sanitizeError } = require("./utils/sanitizeAxios");
const { ensureAlbumCover } = require("./services/albumCoverCache");
const { ensureArtistImage } = require("./services/artistImageCache");
const { importScrobbleCSV } = require("./services/importScrobbleCSV");
const { exportScrobbleCSV } = require("./services/exportScrobbleCSV");
const { ensureTrackDuration } = require("./services/trackDurationCache");
const { getLastFmUserInfo } = require("./services/lastfm-username");
const { getFriendsList, compareWithFriend } = require("./services/lastfm-friends");
const {
  generateShareImage,
  ShareGenerationBusyError
} = require("./services/shareGenerator");

const app = express();
const PORT = Math.max(1, Number(process.env.PORT) || 1533);
const AVG_TRACK_SECONDS = 180;
const EXTERNAL_REQUEST_CONCURRENCY = Number(process.env.EXTERNAL_REQUEST_CONCURRENCY || 4);
const publicDir = path.join(__dirname, "../public");
const albumCoversDir = path.join(db.dataDir, "covers/albums");
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function setNoStore(res) {
  res.set("Cache-Control", "no-store");
}

function getUploadErrorMessage(error) {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return "Uploaded file is too large";
  }

  return error.message || "Upload failed";
}

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    const allowed = allowedImageTypes.has(file.mimetype);
    callback(allowed ? null : new Error("Unsupported image type"), allowed);
  }
});

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 }
});

const corsOrigin = process.env.CORS_ORIGIN?.trim();
if (corsOrigin) {
  const allowedOrigins = corsOrigin.split(",").map(origin => origin.trim()).filter(Boolean);
  app.use(cors({ origin: allowedOrigins }));
}

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use("/covers", express.static(path.join(db.dataDir, "covers"), {
  immutable: true,
  maxAge: "30d"
}));
app.use(express.static(publicDir));

app.get("/api/health", (req, res) => {
  const database = db.prepare("SELECT 1 AS ok").get();
  res.json({ ok: database.ok === 1, timestamp: Date.now() });
});

app.get("/api/top-artists", asyncRoute(async (req, res) => {
  setNoStore(res);
  const filter = getActiveFilter(req.query);

  const rows = db.prepare(`
    SELECT artist, COUNT(*) AS plays
    FROM scrobbles
    ${filter.where ? `WHERE ${filter.where}` : ""}
    GROUP BY artist
    ORDER BY plays DESC
    LIMIT 10
  `).all(...filter.params);

  const result = await mapWithConcurrency(rows, EXTERNAL_REQUEST_CONCURRENCY, async row => ({
    ...row,
    image: await ensureArtistImage(row.artist).catch(() => null)
  }));

  res.json(result);
}));

app.get("/api/top-tracks", asyncRoute(async (req, res) => {
  setNoStore(res);
  const filter = getActiveFilter(req.query);

  const rows = db.prepare(`
    SELECT
      track,
      artist,
      album,
      MAX(NULLIF(album_image, '')) AS album_image,
      COUNT(*) AS plays
    FROM scrobbles
    WHERE album IS NOT NULL
      AND TRIM(album) != ''
      ${filter.where ? `AND ${filter.where}` : ""}
    GROUP BY track, artist, album
    ORDER BY plays DESC
    LIMIT 20
  `).all(...filter.params);

  const result = await mapWithConcurrency(rows, EXTERNAL_REQUEST_CONCURRENCY, async row => {
    const [duration, albumImage] = await Promise.all([
      ensureTrackDuration(row.artist, row.track),
      row.album_image
        ? Promise.resolve(row.album_image)
        : ensureAlbumCover(row.artist, row.album)
    ]);

    return {
      ...row,
      album_image: albumImage,
      total_seconds: duration * row.plays
    };
  });

  res.json(result);
}));

app.get("/api/last-sync", (req, res) => {
  setNoStore(res);
  const row = db.prepare(`
    SELECT value
    FROM metadata
    WHERE key = 'last_sync'
  `).get();

  res.json({
    timestamp: Number(row?.value || 0),
    status: getSyncStatus()
  });
});

app.get("/api/sync/status", (req, res) => {
  setNoStore(res);
  res.json(getSyncStatus());
});

app.post("/api/sync", asyncRoute(async (req, res) => {
  const task = startSync({ full: req.query.full === "true" });

  if (!task.started) {
    return res.status(409).json({
      success: false,
      running: true,
      status: task.status
    });
  }

  task.promise.catch(error => {
    console.error("Manual sync failed:", sanitizeError(error));
  });

  res.status(202).json({
    success: true,
    running: true,
    status: getSyncStatus()
  });
}));

app.get("/api/plays-per-day", (req, res) => {
  setNoStore(res);
  const filter = getActiveFilter(req.query);

  const rows = db.prepare(`
    SELECT
      date(played_at, 'unixepoch') AS day,
      COUNT(*) AS plays
    FROM scrobbles
    ${filter.where ? `WHERE ${filter.where}` : ""}
    GROUP BY day
    ORDER BY day
  `).all(...filter.params);

  res.json(fillMissingDates(rows, req.query.range, req.query.year, req.query.month));
});

app.get("/api/summary", (req, res) => {
  setNoStore(res);
  const filter = getActiveFilter(req.query);

  const row = db.prepare(`
    SELECT
      COUNT(*) AS totalPlays,
      COUNT(DISTINCT date(played_at, 'unixepoch')) AS days,
      COALESCE(SUM(COALESCE(track_duration, ?)), 0) AS totalSeconds
    FROM scrobbles
    ${filter.where ? `WHERE ${filter.where}` : ""}
  `).get(AVG_TRACK_SECONDS, ...filter.params);

  res.json({
    totalPlays: row.totalPlays,
    totalMinutes: Math.round(row.totalSeconds / 60),
    avgPerDay: row.days ? (row.totalPlays / row.days).toFixed(1) : "0"
  });
});

app.get("/api/top-albums", asyncRoute(async (req, res) => {
  setNoStore(res);
  const filter = getActiveFilter(req.query);

  const albums = db.prepare(`
    SELECT
      artist,
      album,
      MAX(NULLIF(album_image, '')) AS album_image,
      COUNT(*) AS plays
    FROM scrobbles
    WHERE album IS NOT NULL
      AND TRIM(album) != ''
      ${filter.where ? `AND ${filter.where}` : ""}
    GROUP BY artist, album
    ORDER BY plays DESC
    LIMIT 12
  `).all(...filter.params);

  const result = await mapWithConcurrency(albums, EXTERNAL_REQUEST_CONCURRENCY, async album => ({
    ...album,
    album_image: album.album_image || await ensureAlbumCover(album.artist, album.album)
  }));

  res.json(result);
}));

app.post("/api/album-cover", (req, res, next) => {
  imageUpload.single("cover")(req, res, error => {
    if (error) return res.status(400).json({ error: getUploadErrorMessage(error) });
    next();
  });
}, asyncRoute(async (req, res) => {
  const artist = String(req.body.artist || "").trim();
  const album = String(req.body.album || "").trim();

  if (!artist || !album || !req.file) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  let sourceImage;
  try {
    sourceImage = await loadImage(req.file.buffer);
  } catch {
    return res.status(400).json({ error: "Invalid or unsupported image" });
  }

  const cropSize = Math.min(sourceImage.width, sourceImage.height);
  const outputSize = Math.max(1, Math.min(1000, Math.floor(cropSize)));
  const sourceX = Math.floor((sourceImage.width - cropSize) / 2);
  const sourceY = Math.floor((sourceImage.height - cropSize) / 2);
  const canvas = createCanvas(outputSize, outputSize);
  const context = canvas.getContext("2d");

  context.drawImage(
    sourceImage,
    sourceX,
    sourceY,
    cropSize,
    cropSize,
    0,
    0,
    outputSize,
    outputSize
  );

  const albumHash = crypto
    .createHash("sha1")
    .update(`${artist}\u0000${album}`)
    .digest("hex")
    .slice(0, 24);
  const imageBuffer = canvas.toBuffer("image/jpeg", {
    quality: 0.9,
    progressive: true
  });
  const contentHash = crypto
    .createHash("sha1")
    .update(imageBuffer)
    .digest("hex")
    .slice(0, 12);
  const fileName = `${albumHash}-${contentHash}.jpg`;
  const filePath = path.join(albumCoversDir, fileName);
  const previousCover = db.prepare(`
    SELECT MAX(NULLIF(album_image, '')) AS album_image
    FROM scrobbles
    WHERE artist = ? AND album = ?
  `).get(artist, album)?.album_image;

  await fs.mkdir(albumCoversDir, { recursive: true });
  await fs.writeFile(filePath, imageBuffer);

  const publicPath = `/covers/albums/${fileName}`;
  db.prepare(`
    UPDATE scrobbles
    SET album_image = ?
    WHERE artist = ? AND album = ?
  `).run(publicPath, artist, album);

  if (previousCover?.startsWith("/covers/albums/") && previousCover !== publicPath) {
    const previousName = path.basename(previousCover);
    await fs.rm(path.join(albumCoversDir, previousName), { force: true });
  }

  res.json({ image: publicPath });
}));

app.post("/api/album-tracks", (req, res) => {
  const artist = String(req.body.artist || "").trim();
  const album = String(req.body.album || "").trim();

  if (!artist || !album) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const filter = getActiveFilter(req.query);
  const tracks = db.prepare(`
    SELECT track, COUNT(*) AS plays
    FROM scrobbles
    WHERE album = ?
      AND artist = ?
      ${filter.where ? `AND ${filter.where}` : ""}
    GROUP BY track
    ORDER BY plays DESC
  `).all(album, artist, ...filter.params);

  res.json(tracks);
});

app.get("/api/recent-scrobbles", asyncRoute(async (req, res) => {
  setNoStore(res);
  const parsedPage = Number.parseInt(req.query.page || "1", 10);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = 20;

  const response = await fetchWithRetry(async () => {
    const result = await axios.get("https://ws.audioscrobbler.com/2.0/", {
      timeout: Number(process.env.LASTFM_REQUEST_TIMEOUT_MS || 15000),
      params: {
        method: "user.getrecenttracks",
        user: process.env.LASTFM_USERNAME,
        api_key: process.env.LASTFM_API_KEY,
        format: "json",
        limit,
        page
      }
    });
    assertLastFmResponse(result.data);
    return result;
  });

  const recentTracks = response.data?.recenttracks;
  const tracks = Array.isArray(recentTracks?.track)
    ? recentTracks.track
    : recentTracks?.track
      ? [recentTracks.track]
      : [];
  const attr = recentTracks?.["@attr"];

  const parsed = tracks
    .filter(track => !(page > 1 && track["@attr"]?.nowplaying))
    .map(track => ({
      track: track.name,
      artist: track.artist?.["#text"] || "Unknown artist",
      image: track.image?.find(image => image.size === "extralarge")?.["#text"]
        || track.image?.find(image => image.size === "large")?.["#text"]
        || null,
      nowPlaying: Boolean(track["@attr"]?.nowplaying),
      date: track.date ? Number(track.date.uts) * 1000 : null
    }));

  res.json({
    tracks: parsed,
    hasMore: page < Number(attr?.totalPages || 1)
  });
}));

app.post("/api/import/scrobbles", (req, res, next) => {
  csvUpload.single("file")(req, res, error => {
    if (error) return res.status(400).json({ error: getUploadErrorMessage(error) });
    next();
  });
}, asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const result = await importScrobbleCSV(req.file.buffer);
  res.json(result);
}));

app.get("/api/export/scrobbles", (req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="scrobbles.csv"');
  exportScrobbleCSV(res);
});

app.get("/api/user-stats", asyncRoute(async (req, res) => {
  setNoStore(res);

  const [lastFmData, stats] = await Promise.all([
    getLastFmUserInfo(),
    Promise.resolve(db.prepare(`
      SELECT
        COUNT(*) AS totalScrobbles,
        COUNT(DISTINCT artist) AS uniqueArtists,
        (
          SELECT COUNT(*)
          FROM (
            SELECT artist, album
            FROM scrobbles
            WHERE album IS NOT NULL AND TRIM(album) != ''
            GROUP BY artist, album
          )
        ) AS uniqueAlbums,
        (
          SELECT COUNT(*)
          FROM (
            SELECT artist, track
            FROM scrobbles
            GROUP BY artist, track
          )
        ) AS uniqueTracks,
        MIN(played_at) AS joinedDate
      FROM scrobbles
    `).get())
  ]);

  res.json({
    username: lastFmData.name,
    avatar: lastFmData.avatar,
    ...stats
  });
}));

app.get("/api/generate-share", asyncRoute(async (req, res) => {
  setNoStore(res);

  try {
    const buffer = await generateShareImage(req.query);
    res.type("png").send(buffer);
  } catch (error) {
    if (error instanceof ShareGenerationBusyError) {
      return res.status(429).json({ error: error.message });
    }

    throw error;
  }
}));

app.get("/api/friends", asyncRoute(async (req, res) => {
  setNoStore(res);
  res.json(await getFriendsList());
}));

app.get("/api/friends/compare/:username", asyncRoute(async (req, res) => {
  setNoStore(res);
  const comparison = await compareWithFriend(db, req.params.username);

  if (comparison.error) {
    return res.status(502).json(comparison);
  }

  res.json(comparison);
}));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  console.error(`[${req.method} ${req.path}]`, sanitizeError(error));
  const parsedStatus = Number(error.statusCode || error.status || 500);
  const status = Number.isInteger(parsedStatus) && parsedStatus >= 400 && parsedStatus <= 599
    ? parsedStatus
    : 500;
  const message = status >= 500 ? "Internal server error" : error.message;
  res.status(status).json({ error: message });
});

let server;

if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`🚀 Dashboard running at http://localhost:${PORT}`);
  });
}

module.exports = { app, server };

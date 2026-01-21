require('dotenv').config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
const { createCanvas, loadImage, registerFont } = require('canvas');

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

app.get('/api/generate-share', async (req, res) => {
    try {
        const { period, types } = req.query; 
        const selectedTypes = types ? types.split(',') : ['albums'];
        
        const now = Math.floor(Date.now() / 1000);
        let start = 0;
        switch (period) {
            case '7day': start = now - (7 * 24 * 60 * 60); break;
            case '30day': start = now - (30 * 24 * 60 * 60); break;
            case '3month': start = now - (90 * 24 * 60 * 60); break;
            case '6month': start = now - (180 * 24 * 60 * 60); break;
            case 'year': start = now - (365 * 24 * 60 * 60); break;
            case 'all': start = 0; break;
            default: start = now - (7 * 24 * 60 * 60);
        }

        const data = {};
        if (selectedTypes.includes('albums')) {
            data.albums = db.prepare(`SELECT album, artist, album_image, COUNT(*) as play_count FROM scrobbles WHERE played_at > ? AND album_image IS NOT NULL AND album_image != '' GROUP BY album, artist ORDER BY play_count DESC LIMIT 9`).all(start);
        }
        if (selectedTypes.includes('artists')) {
            data.artists = db.prepare(`SELECT s.artist, a.artist_image, COUNT(*) as play_count FROM scrobbles s LEFT JOIN artists a ON s.artist = a.artist WHERE s.played_at > ? GROUP BY s.artist ORDER BY play_count DESC LIMIT 6`).all(start);
        }
        if (selectedTypes.includes('tracks')) {
            data.tracks = db.prepare(`SELECT track, artist, album_image, COUNT(*) as play_count FROM scrobbles WHERE played_at > ? GROUP BY track, artist ORDER BY play_count DESC LIMIT 5`).all(start);
        }

        if (!data.albums?.length && !data.artists?.length && !data.tracks?.length) {
            return res.status(400).json({ error: "No data found." });
        }

        const width = 1080;
        const headerHeight = 250;
        const footerHeight = 100;
        
        let totalHeight = headerHeight + footerHeight;
        if (selectedTypes.includes('albums') && data.albums.length > 0) totalHeight += 1150;
        if (selectedTypes.includes('artists') && data.artists.length > 0) totalHeight += 900;
        if (selectedTypes.includes('tracks') && data.tracks.length > 0) totalHeight += 950;

        const canvas = createCanvas(width, totalHeight);
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#121212';
        ctx.fillRect(0, 0, width, totalHeight);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 70px Sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`MY MUSIC RECAP`, width / 2, 100);

        ctx.fillStyle = '#00e054';
        let periodText = period === 'all' ? 'ALL TIME' : period.toUpperCase().replace('DAY', ' DAYS').replace('MONTH', ' MONTHS');
        ctx.font = 'bold 40px Sans-serif';
        ctx.fillText(periodText, width / 2, 170);

        let currentY = headerHeight;

        if (selectedTypes.includes('albums') && data.albums.length > 0) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 50px Sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('TOP ALBUMS', 60, currentY + 50);
            
            const gridSize = 300;
            const gap = 30;
            const startX = (width - ((3 * gridSize) + (2 * gap))) / 2;
            const gridY = currentY + 100;

            for (let i = 0; i < data.albums.length; i++) {
                const item = data.albums[i];
                const r = Math.floor(i / 3);
                const c = i % 3;
                const x = startX + c * (gridSize + gap);
                const y = gridY + r * (gridSize + gap);

                try {
                    const img = await loadImage(item.album_image);
                    ctx.drawImage(img, x, y, gridSize, gridSize);
                    ctx.strokeStyle = '#222';
                    ctx.strokeRect(x, y, gridSize, gridSize);
                } catch(e) {
                    ctx.fillStyle = '#333';
                    ctx.fillRect(x, y, gridSize, gridSize);
                }
            }
            currentY += 1150; 
        }

        if (selectedTypes.includes('artists') && data.artists.length > 0) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 50px Sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('TOP ARTISTS', 60, currentY + 50);

            const artSize = 280;
            const gap = 40;
            const startListY = currentY + 240;

            for (let i = 0; i < Math.min(data.artists.length, 6); i++) {
                const item = data.artists[i];
                const r = Math.floor(i / 3);
                const c = i % 3;
                
                const centerX = 180 + c * (artSize + gap);
                const centerY = startListY + r * (artSize + 110);

                ctx.save();
                ctx.beginPath();
                ctx.arc(centerX, centerY, artSize / 2, 0, Math.PI * 2, true);
                ctx.closePath();
                ctx.clip();

                try {
                    if (item.artist_image) {
                        const img = await loadImage(item.artist_image);
                        ctx.drawImage(img, centerX - artSize/2, centerY - artSize/2, artSize, artSize);
                    } else { throw new Error(); }
                } catch (e) {
                    ctx.fillStyle = '#333';
                    ctx.fillRect(centerX - artSize/2, centerY - artSize/2, artSize, artSize);
                    ctx.fillStyle = '#555';
                    ctx.font = 'bold 100px Sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(item.artist.charAt(0), centerX, centerY + 30);
                }
                ctx.restore();

                ctx.fillStyle = '#fff';
                ctx.font = 'bold 24px Sans-serif';
                ctx.textAlign = 'center';
                let name = item.artist;
                if (name.length > 18) name = name.substring(0, 16) + '...';
                ctx.fillText(name, centerX, centerY + (artSize/2) + 40);
                
                ctx.fillStyle = '#aaa';
                ctx.font = '20px Sans-serif';
                ctx.fillText(`${item.play_count} plays`, centerX, centerY + (artSize/2) + 70);
            }
            currentY += 900;
        }

        if (selectedTypes.includes('tracks') && data.tracks.length > 0) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 50px Sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('TOP TRACKS', 60, currentY + 50);

            let listY = currentY + 120;
            const itemHeight = 160;

            for (let i = 0; i < data.tracks.length; i++) {
                const item = data.tracks[i];
                
                ctx.fillStyle = '#1a1a1a';
                ctx.fillRect(50, listY, width - 100, itemHeight - 20);

                ctx.fillStyle = '#00e054';
                ctx.font = 'bold 50px Sans-serif';
                ctx.textAlign = 'center';

                ctx.fillText(`#${i+1}`, 100, listY + 85);

                if(item.album_image) {
                    try {
                        const img = await loadImage(item.album_image);
                        ctx.drawImage(img, 180, listY + 10, 120, 120);
                    } catch(e) {}
                } else {
                    ctx.fillStyle = '#333';
                    ctx.fillRect(180, listY + 10, 120, 120);
                }

                ctx.textAlign = 'left';
                const textStartX = 340;

                ctx.fillStyle = '#fff';
                ctx.font = 'bold 35px Sans-serif';
                let trackName = item.track;
                if (trackName.length > 25) trackName = trackName.substring(0, 25) + '...';
                ctx.fillText(trackName, textStartX, listY + 60);

                ctx.fillStyle = '#aaa';
                ctx.font = '28px Sans-serif';
                ctx.fillText(item.artist, textStartX, listY + 100);

                ctx.textAlign = 'right';
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 30px Sans-serif';
                ctx.fillText(`${item.play_count}`, width - 80, listY + 85);
                
                listY += itemHeight;
            }
            currentY += 950;
        }

        ctx.fillStyle = '#555';
        ctx.font = '30px Sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Generated by YourLastFM', width / 2, totalHeight - 40);

        const buffer = canvas.toBuffer('image/png');
        res.set('Content-Type', 'image/png');
        res.send(buffer);

    } catch (error) {
        console.error("Generate error:", error);
        res.status(500).json({ error: "Server error generating image" });
    }
});

app.listen(PORT, () => {
  console.log(`🚀 Dashboard running in http://localhost:${PORT}`);
});

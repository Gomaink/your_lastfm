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
const { getLastFmUserInfo } = require("./services/lastfm-username");
const { fetchWithRetry } = require("./utils/fetchRetry");
const { sanitizeError } = require("./utils/sanitizeAxios");
const { getFriendsList, compareWithFriend } = require('./services/lastfm-friends');


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

app.get('/api/user-stats', async (req, res) => {
    try {
        const lastFmData = await getLastFmUserInfo();

        const totalScrobbles = db.prepare('SELECT COUNT(*) as count FROM scrobbles').get().count;
        const uniqueArtists = db.prepare('SELECT COUNT(DISTINCT artist) as count FROM scrobbles').get().count;
        const uniqueAlbums = db.prepare('SELECT COUNT(DISTINCT album) as count FROM scrobbles').get().count;
        const uniqueTracks = db.prepare('SELECT COUNT(DISTINCT track) as count FROM scrobbles').get().count;
        const firstScrobble = db.prepare('SELECT MIN(played_at) as first_date FROM scrobbles').get().first_date;

        res.json({
            username: lastFmData.name,
            avatar: lastFmData.avatar,
            totalScrobbles,
            uniqueArtists,
            uniqueAlbums,
            uniqueTracks,
            joinedDate: firstScrobble
        });

    } catch (error) {
        console.error("Error searching stats:", error);
        res.status(500).json({ error: "Error loading stats" });
    }
});

app.get('/api/generate-share', async (req, res) => {
    try {
        const { period, types, format } = req.query;
        const selectedTypes = types ? types.split(',') : ['albums'];
        const isStory = format === 'story';

        const username = await getLastFmUserInfo();
        const recapTitle = `${username.name} RECAP`;

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

        const limits = isStory 
            ? { albums: 3, artists: 3, tracks: 4 } 
            : { albums: 9, artists: 6, tracks: 5 };

        const data = {};
        if (selectedTypes.includes('albums')) {
            data.albums = db.prepare(`SELECT album, artist, album_image, COUNT(*) as play_count FROM scrobbles WHERE played_at > ? AND album_image IS NOT NULL AND album_image != '' GROUP BY album, artist ORDER BY play_count DESC LIMIT ?`).all(start, limits.albums);
        }
        if (selectedTypes.includes('artists')) {
            data.artists = db.prepare(`SELECT s.artist, a.artist_image, COUNT(*) as play_count FROM scrobbles s LEFT JOIN artists a ON s.artist = a.artist WHERE s.played_at > ? GROUP BY s.artist ORDER BY play_count DESC LIMIT ?`).all(start, limits.artists);
        }
        if (selectedTypes.includes('tracks')) {
            data.tracks = db.prepare(`SELECT track, artist, album_image, COUNT(*) as play_count FROM scrobbles WHERE played_at > ? GROUP BY track, artist ORDER BY play_count DESC LIMIT ?`).all(start, limits.tracks);
        }

        if (!data.albums?.length && !data.artists?.length && !data.tracks?.length) {
            return res.status(400).json({ error: "No data found." });
        }

        let width, height;
        if (isStory) {
            width = 1080;
            height = 1920;
        } else {
            width = 1080;
            const headerHeight = 250;
            const footerHeight = 100;
            let totalHeight = headerHeight + footerHeight;
            if (selectedTypes.includes('albums') && data.albums?.length) totalHeight += 1150;
            if (selectedTypes.includes('artists') && data.artists?.length) totalHeight += 900;
            if (selectedTypes.includes('tracks') && data.tracks?.length) totalHeight += 950;
            height = totalHeight;
        }

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        if (isStory) {
            const grd = ctx.createLinearGradient(0, 0, 0, height);
            grd.addColorStop(0, '#2b2b2b'); 
            grd.addColorStop(1, '#000000');
            ctx.fillStyle = grd;
        } else {
            ctx.fillStyle = '#121212';
        }
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        
        let periodText = period === 'all' ? 'ALL TIME' : period.toUpperCase().replace('DAY', ' DAYS').replace('MONTH', ' MONTHS');
        
        const maxWidth = width - 120;
        let fontSize = isStory ? 60 : 70;

        if (isStory) {
            ctx.fillStyle = '#fff';
            do {
              ctx.font = `bold ${fontSize}px Sans-serif`;
              fontSize -= 2;
            } while (ctx.measureText(recapTitle).width > maxWidth && fontSize > 36);

            ctx.fillText(recapTitle.toUpperCase(), width / 2, isStory ? 220 : 100);
            
            const textWidth = ctx.measureText(periodText).width;
            ctx.fillStyle = '#ff7302';
            ctx.beginPath();
            ctx.roundRect((width/2) - (textWidth/2) - 20, 260, textWidth + 40, 60, 30);
            ctx.fill();
            
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 35px Sans-serif';
            ctx.fillText(periodText, width / 2, 303);
        } else {
            do {
              ctx.font = `bold ${fontSize}px Sans-serif`;
              fontSize -= 2;
            } while (ctx.measureText(recapTitle).width > maxWidth && fontSize > 36);
            
            ctx.fillStyle = '#ff7302';
            ctx.fillText(recapTitle.toUpperCase(), width / 2, isStory ? 220 : 100);

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 40px Sans-serif';
            ctx.fillText(periodText, width / 2, 170);
        }

        
        let currentY = isStory ? 400 : 250;
        const spacingStory = 80;

        if (data.albums && data.albums.length > 0) {
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'left';
            ctx.font = 'bold 45px Sans-serif';
            
            if(isStory) {
                ctx.fillStyle = '#ff7302';
                ctx.fillRect(60, currentY + 10, 10, 40); 
                ctx.fillStyle = '#fff';
                ctx.fillText('TOP ALBUMS', 100, currentY + 45);
            } else {
                ctx.fillText('TOP ALBUMS', 60, currentY + 50);
            }

            const gridSize = isStory ? 280 : 300;
            const gap = 30;
            const cols = 3; 
            const startX = (width - ((cols * gridSize) + ((cols-1) * gap))) / 2;
            const gridY = currentY + (isStory ? 80 : 100);

            for (let i = 0; i < data.albums.length; i++) {
                const item = data.albums[i];
                const r = Math.floor(i / cols);
                const c = i % cols;
                const x = startX + c * (gridSize + gap);
                const y = gridY + r * (gridSize + gap);

                try {
                    const img = await loadImage(item.album_image);
                    ctx.drawImage(img, x, y, gridSize, gridSize);
                    ctx.strokeStyle = isStory ? 'rgba(255,255,255,0.2)' : '#222';
                    ctx.lineWidth = isStory ? 2 : 1;
                    ctx.strokeRect(x, y, gridSize, gridSize);
                    
                    if(isStory) {
                        ctx.fillStyle = '#ff7302';
                        ctx.fillRect(x, y, 50, 50);
                        ctx.fillStyle = '#000';
                        ctx.font = 'bold 30px Sans-serif';
                        ctx.textAlign = 'center'; 
                        ctx.fillText(`${i+1}`, x + 25, y + 37);
                        ctx.textAlign = 'left';
                    }
                } catch(e) {
                    ctx.fillStyle = '#333';
                    ctx.fillRect(x, y, gridSize, gridSize);
                }
            }
            
            if (isStory) {
                const rows = Math.ceil(data.albums.length / 3);
                currentY += (rows * (gridSize + gap)) + spacingStory + 50; 
            } else {
                currentY += 1150;
            }
        }

        if (data.artists && data.artists.length > 0) {
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'left';
            ctx.font = 'bold 45px Sans-serif';
            
            if(isStory) {
                ctx.fillStyle = '#ff7302';
                ctx.fillRect(60, currentY + 10, 10, 40);
                ctx.fillStyle = '#fff';
                ctx.fillText('TOP ARTISTS', 100, currentY + 45);
            } else {
                ctx.fillText('TOP ARTISTS', 60, currentY + 50);
            }

            const artSize = isStory ? 220 : 280;
            const gap = isStory ? 60 : 40;
            const startListY = currentY + 240;
            const maxCols = 3;

            for (let i = 0; i < data.artists.length; i++) {
                const item = data.artists[i];
                const r = Math.floor(i / maxCols);
                const c = i % maxCols;
                
                const totalRowWidth = (Math.min(data.artists.length, maxCols) * artSize) + ((Math.min(data.artists.length, maxCols)-1) * gap);
                const startRowX = (width - totalRowWidth) / 2 + (artSize/2);

                const centerX = startRowX + c * (artSize + gap);
                const centerY = startListY + r * (artSize + (isStory ? 90 : 110)) - (isStory ? 50 : 0);

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
                    ctx.fillStyle = '#fff';
                    ctx.textAlign = 'center';
                    ctx.font = 'bold 80px Sans-serif';
                    ctx.fillText(item.artist.charAt(0), centerX, centerY + 30);
                }
                ctx.restore();

                ctx.fillStyle = '#fff';
                ctx.font = isStory ? 'bold 22px Sans-serif' : 'bold 24px Sans-serif';
                ctx.textAlign = 'center';
                let name = item.artist;
                if (name.length > 18) name = name.substring(0, 16) + '...';
                ctx.fillText(name, centerX, centerY + (artSize/2) + 35);
                
                ctx.fillStyle = '#aaa';
                ctx.font = isStory ? '18px Sans-serif' : '20px Sans-serif';
                ctx.fillText(`${item.play_count} plays`, centerX, centerY + (artSize/2) + 60);
                
                ctx.textAlign = 'left';
            }

            if(isStory) {
                currentY += artSize + 150 + spacingStory;
            } else {
                currentY += 900;
            }
        }

        if (data.tracks && data.tracks.length > 0) {
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'left';
            ctx.font = 'bold 45px Sans-serif';

            if(isStory) {
                ctx.fillStyle = '#ff7302';
                ctx.fillRect(60, currentY + 10, 10, 40);
                ctx.fillStyle = '#fff';
                ctx.fillText('TOP TRACKS', 100, currentY + 45);
            } else {
                ctx.fillText('TOP TRACKS', 60, currentY + 50);
            }

            let listY = currentY + (isStory ? 80 : 120);
            const itemHeight = isStory ? 130 : 160;

            for (let i = 0; i < data.tracks.length; i++) {
                const item = data.tracks[i];
                
                if(isStory) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                    ctx.beginPath();
                    ctx.roundRect(50, listY, width - 100, itemHeight - 15, 15);
                    ctx.fill();
                } else {
                    ctx.fillStyle = '#1a1a1a';
                    ctx.fillRect(50, listY, width - 100, itemHeight - 20);
                }

                ctx.fillStyle = '#ff7302';
                ctx.font = 'bold 40px Sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`#${i+1}`, 100, listY + (isStory ? 75 : 85));

                const imgSize = isStory ? 90 : 120;
                const imgY = listY + (isStory ? 12 : 10);
                const imgX = 160;

                if(item.album_image) {
                    try {
                        const img = await loadImage(item.album_image);
                        ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
                    } catch(e) {}
                } else {
                    ctx.fillStyle = '#333';
                    ctx.fillRect(imgX, imgY, imgSize, imgSize);
                }

                ctx.textAlign = 'left';
                const textStartX = isStory ? 280 : 340;

                ctx.fillStyle = '#fff';
                ctx.font = isStory ? 'bold 30px Sans-serif' : 'bold 35px Sans-serif';
                let trackName = item.track;
                const maxLen = isStory ? 22 : 25;
                if (trackName.length > maxLen) trackName = trackName.substring(0, maxLen) + '...';
                ctx.fillText(trackName, textStartX, listY + (isStory ? 50 : 60));

                ctx.fillStyle = '#aaa';
                ctx.font = isStory ? '24px Sans-serif' : '28px Sans-serif';
                let artistName = item.artist;
                if(isStory && artistName.length > 25) artistName = artistName.substring(0, 25) + '...';
                ctx.fillText(artistName, textStartX, listY + (isStory ? 85 : 100));

                ctx.textAlign = 'right';
                ctx.fillStyle = isStory ? '#ddd' : '#fff';
                ctx.font = 'bold 26px Sans-serif';
                ctx.fillText(`${item.play_count} scrobbles`, width - 80, listY + (isStory ? 75 : 85));
                
                listY += itemHeight;
            }
            if (!isStory) currentY += 950;
        }

        ctx.fillStyle = isStory ? 'rgba(255,255,255,0.5)' : '#555';
        ctx.font = '24px Sans-serif';
        ctx.textAlign = 'center';
        const footerY = isStory ? height - 80 : height - 40;
        ctx.fillText('Generated by YourLastFM', width / 2, footerY);

        const buffer = canvas.toBuffer('image/png');
        res.set('Content-Type', 'image/png');
        res.send(buffer);

    } catch (error) {
        console.error("Generate error:", error);
        res.status(500).json({ error: "Server error generating image" });
    }
});

app.get('/api/friends', async (req, res) => {
    try {
        const friends = await getFriendsList();
        res.json(friends);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error searching for friends' });
    }
});

app.get('/api/friends/compare/:username', async (req, res) => {
    try {
        const friendUsername = req.params.username;
        const comparison = await compareWithFriend(db, friendUsername);
        res.json(comparison);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error comparing profiles' });
    }
});

app.listen(PORT, () => {
  console.log(`🚀 Dashboard running in http://localhost:${PORT}`);
});

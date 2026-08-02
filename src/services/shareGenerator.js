const { createCanvas } = require("canvas");

const db = require("../db");
const { ensureAlbumCover } = require("./albumCoverCache");
const { ensureArtistImage } = require("./artistImageCache");
const { getLastFmUserInfo } = require("./lastfm-username");
const { loadShareImage } = require("./shareImageLoader");
const { mapWithConcurrency } = require("../utils/mapWithConcurrency");

const ALLOWED_PERIODS = new Set(["7day", "30day", "3month", "6month", "year", "all"]);
const ALLOWED_TYPES = new Set(["albums", "artists", "tracks"]);
const ALLOWED_FORMATS = new Set(["standard", "story"]);
const IMAGE_CONCURRENCY = Math.max(1, Number(process.env.SHARE_IMAGE_CONCURRENCY) || 4);
const MAX_ACTIVE_GENERATIONS = Math.max(1, Math.floor(Number(process.env.SHARE_MAX_CONCURRENT) || 2));

let activeGenerations = 0;

class ShareGenerationBusyError extends Error {
  constructor() {
    super("Another recap is already being generated. Please try again in a moment.");
    this.name = "ShareGenerationBusyError";
  }
}

function parseShareOptions(input = {}) {
  const period = ALLOWED_PERIODS.has(input.period) ? input.period : "7day";
  const format = ALLOWED_FORMATS.has(input.format) ? input.format : "standard";
  const rawTypes = Array.isArray(input.types)
    ? input.types
    : String(input.types || "albums").split(",");

  const types = [...new Set(rawTypes
    .map(type => String(type).trim())
    .filter(type => ALLOWED_TYPES.has(type)))];

  if (!types.length) {
    throw new Error("Select at least one valid recap section");
  }

  return { period, format, types };
}

function getPeriodStart(period) {
  const now = Math.floor(Date.now() / 1000);

  switch (period) {
    case "7day": return now - (7 * 24 * 60 * 60);
    case "30day": return now - (30 * 24 * 60 * 60);
    case "3month": return now - (90 * 24 * 60 * 60);
    case "6month": return now - (180 * 24 * 60 * 60);
    case "year": return now - (365 * 24 * 60 * 60);
    case "all": return 0;
    default: return now - (7 * 24 * 60 * 60);
  }
}

function getPeriodLabel(period) {
  const labels = {
    "7day": "LAST 7 DAYS",
    "30day": "LAST 30 DAYS",
    "3month": "LAST 3 MONTHS",
    "6month": "LAST 6 MONTHS",
    year: "LAST YEAR",
    all: "ALL TIME"
  };

  return labels[period] || labels["7day"];
}

function getLimits(isStory) {
  return isStory
    ? { albums: 3, artists: 3, tracks: 4 }
    : { albums: 9, artists: 6, tracks: 5 };
}

function queryShareData(start, types, limits) {
  const data = {};

  if (types.includes("albums")) {
    data.albums = db.prepare(`
      SELECT
        album,
        artist,
        MAX(NULLIF(album_image, '')) AS album_image,
        COUNT(*) AS play_count
      FROM scrobbles
      WHERE played_at >= ?
        AND album IS NOT NULL
        AND TRIM(album) != ''
      GROUP BY album, artist
      ORDER BY play_count DESC
      LIMIT ?
    `).all(start, limits.albums);
  }

  if (types.includes("artists")) {
    data.artists = db.prepare(`
      SELECT
        s.artist,
        MAX(NULLIF(a.artist_image, '')) AS artist_image,
        COUNT(*) AS play_count
      FROM scrobbles s
      LEFT JOIN artists a ON a.artist = s.artist
      WHERE s.played_at >= ?
      GROUP BY s.artist
      ORDER BY play_count DESC
      LIMIT ?
    `).all(start, limits.artists);
  }

  if (types.includes("tracks")) {
    data.tracks = db.prepare(`
      SELECT
        track,
        artist,
        album,
        MAX(NULLIF(album_image, '')) AS album_image,
        COUNT(*) AS play_count
      FROM scrobbles
      WHERE played_at >= ?
      GROUP BY track, artist, album
      ORDER BY play_count DESC
      LIMIT ?
    `).all(start, limits.tracks);
  }

  return data;
}

async function enrichShareData(data) {
  if (data.albums) {
    data.albums = await mapWithConcurrency(data.albums, IMAGE_CONCURRENCY, async item => {
      const albumImage = item.album_image || await ensureAlbumCover(item.artist, item.album);
      return {
        ...item,
        album_image: albumImage,
        image: await loadShareImage(albumImage)
      };
    });
  }

  if (data.artists) {
    data.artists = await mapWithConcurrency(data.artists, IMAGE_CONCURRENCY, async item => {
      const artistImage = item.artist_image || await ensureArtistImage(item.artist);
      return {
        ...item,
        artist_image: artistImage,
        image: await loadShareImage(artistImage)
      };
    });
  }

  if (data.tracks) {
    data.tracks = await mapWithConcurrency(data.tracks, IMAGE_CONCURRENCY, async item => {
      const albumImage = item.album_image
        || (item.album ? await ensureAlbumCover(item.artist, item.album) : null);

      return {
        ...item,
        album_image: albumImage,
        image: await loadShareImage(albumImage)
      };
    });
  }

  return data;
}

function hasShareData(data) {
  return Boolean(data.albums?.length || data.artists?.length || data.tracks?.length);
}

function getStandardHeight(data) {
  let height = 230 + 90;

  if (data.albums?.length) {
    height += 100 + (Math.ceil(data.albums.length / 3) * 330) + 50;
  }

  if (data.artists?.length) {
    height += 150 + (Math.ceil(data.artists.length / 3) * 360) + 70;
  }

  if (data.tracks?.length) {
    height += 100 + (data.tracks.length * 150) + 50;
  }

  return height;
}

function fitText(ctx, text, maxWidth, initialSize, minimumSize = 20, weight = "bold") {
  let fontSize = initialSize;

  while (fontSize > minimumSize) {
    ctx.font = `${weight} ${fontSize}px Sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    fontSize -= 2;
  }

  return fontSize;
}

function truncateText(ctx, text, maxWidth) {
  const value = String(text || "");
  if (ctx.measureText(value).width <= maxWidth) return value;

  let result = value;
  while (result.length > 1 && ctx.measureText(`${result}...`).width > maxWidth) {
    result = result.slice(0, -1);
  }

  return `${result}...`;
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawSectionTitle(ctx, title, y, isStory) {
  ctx.textAlign = "left";
  ctx.font = `bold ${isStory ? 38 : 45}px Sans-serif`;

  if (isStory) {
    ctx.fillStyle = "#ff7302";
    ctx.fillRect(60, y + 8, 9, 36);
    ctx.fillStyle = "#fff";
    ctx.fillText(title, 95, y + 42);
  } else {
    ctx.fillStyle = "#fff";
    ctx.fillText(title, 60, y + 48);
  }
}

function drawImageOrPlaceholder(ctx, image, x, y, width, height, label = "") {
  if (image) {
    ctx.drawImage(image, x, y, width, height);
    return true;
  }

  ctx.fillStyle = "#303030";
  ctx.fillRect(x, y, width, height);

  if (label) {
    ctx.fillStyle = "#777";
    ctx.textAlign = "center";
    ctx.font = `bold ${Math.max(28, Math.floor(width * 0.22))}px Sans-serif`;
    ctx.fillText(String(label).charAt(0).toUpperCase(), x + width / 2, y + height / 2 + width * 0.08);
  }

  return false;
}

function drawHeader(ctx, width, isStory, recapTitle, periodLabel) {
  ctx.textAlign = "center";
  ctx.fillStyle = isStory ? "#fff" : "#ff7302";
  fitText(ctx, recapTitle, width - 120, isStory ? 60 : 70, 36);
  ctx.fillText(recapTitle, width / 2, isStory ? 190 : 95);

  if (isStory) {
    ctx.font = "bold 32px Sans-serif";
    const textWidth = ctx.measureText(periodLabel).width;
    ctx.fillStyle = "#ff7302";
    roundedRect(ctx, (width - textWidth) / 2 - 20, 235, textWidth + 40, 58, 29);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(periodLabel, width / 2, 275);
  } else {
    ctx.fillStyle = "#fff";
    ctx.font = "bold 38px Sans-serif";
    ctx.fillText(periodLabel, width / 2, 160);
  }
}

function drawAlbums(ctx, data, currentY, width, isStory) {
  drawSectionTitle(ctx, "TOP ALBUMS", currentY, isStory);

  const gridSize = isStory ? 250 : 300;
  const gap = isStory ? 25 : 30;
  const columns = 3;
  const startX = (width - ((columns * gridSize) + ((columns - 1) * gap))) / 2;
  const gridY = currentY + (isStory ? 75 : 90);

  data.forEach((item, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = startX + column * (gridSize + gap);
    const y = gridY + row * (gridSize + gap);

    drawImageOrPlaceholder(ctx, item.image, x, y, gridSize, gridSize, item.album);
    ctx.strokeStyle = isStory ? "rgba(255,255,255,0.22)" : "#222";
    ctx.lineWidth = isStory ? 2 : 1;
    ctx.strokeRect(x, y, gridSize, gridSize);

    if (isStory) {
      ctx.fillStyle = "#ff7302";
      ctx.fillRect(x, y, 44, 44);
      ctx.fillStyle = "#000";
      ctx.font = "bold 26px Sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(index + 1), x + 22, y + 32);
    }
  });

  const rows = Math.ceil(data.length / columns);
  return gridY + (rows * (gridSize + gap)) + (isStory ? 30 : 20);
}

function drawArtists(ctx, data, currentY, width, isStory) {
  drawSectionTitle(ctx, "TOP ARTISTS", currentY, isStory);

  const artSize = isStory ? 180 : 250;
  const gap = isStory ? 90 : 85;
  const columns = 3;
  const rowStep = artSize + (isStory ? 85 : 110);
  const firstCenterY = currentY + (isStory ? 150 : 175);
  const totalRowWidth = (columns * artSize) + ((columns - 1) * gap);
  const firstCenterX = (width - totalRowWidth) / 2 + artSize / 2;

  data.forEach((item, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const centerX = firstCenterX + column * (artSize + gap);
    const centerY = firstCenterY + row * rowStep;

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, artSize / 2, 0, Math.PI * 2);
    ctx.clip();
    drawImageOrPlaceholder(
      ctx,
      item.image,
      centerX - artSize / 2,
      centerY - artSize / 2,
      artSize,
      artSize,
      item.artist
    );
    ctx.restore();

    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${isStory ? 21 : 24}px Sans-serif`;
    const name = truncateText(ctx, item.artist, artSize + 50);
    ctx.fillText(name, centerX, centerY + artSize / 2 + 32);

    ctx.fillStyle = "#aaa";
    ctx.font = `${isStory ? 17 : 19}px Sans-serif`;
    ctx.fillText(`${item.play_count} plays`, centerX, centerY + artSize / 2 + 56);
  });

  const rows = Math.ceil(data.length / columns);
  return firstCenterY + ((rows - 1) * rowStep) + artSize / 2 + (isStory ? 85 : 90);
}

function drawTracks(ctx, data, currentY, width, isStory) {
  drawSectionTitle(ctx, "TOP TRACKS", currentY, isStory);

  let listY = currentY + (isStory ? 70 : 90);
  const itemHeight = isStory ? 120 : 150;
  const cardHeight = itemHeight - (isStory ? 10 : 15);

  data.forEach((item, index) => {
    if (isStory) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      roundedRect(ctx, 50, listY, width - 100, cardHeight, 14);
      ctx.fill();
    } else {
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(50, listY, width - 100, cardHeight);
    }

    ctx.fillStyle = "#ff7302";
    ctx.font = `bold ${isStory ? 32 : 38}px Sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`#${index + 1}`, 100, listY + (isStory ? 68 : 80));

    const imageSize = isStory ? 86 : 115;
    const imageX = isStory ? 150 : 160;
    const imageY = listY + Math.floor((cardHeight - imageSize) / 2);
    drawImageOrPlaceholder(ctx, item.image, imageX, imageY, imageSize, imageSize, item.track);

    const textStartX = isStory ? 260 : 305;
    const rightTextWidth = isStory ? 660 : 620;

    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${isStory ? 27 : 32}px Sans-serif`;
    ctx.fillText(
      truncateText(ctx, item.track, rightTextWidth),
      textStartX,
      listY + (isStory ? 47 : 57)
    );

    ctx.fillStyle = "#aaa";
    ctx.font = `${isStory ? 21 : 25}px Sans-serif`;
    ctx.fillText(
      truncateText(ctx, item.artist, rightTextWidth),
      textStartX,
      listY + (isStory ? 80 : 95)
    );

    ctx.textAlign = "right";
    ctx.fillStyle = isStory ? "#ddd" : "#fff";
    ctx.font = `bold ${isStory ? 20 : 24}px Sans-serif`;
    ctx.fillText(`${item.play_count} scrobbles`, width - 70, listY + (isStory ? 68 : 80));

    listY += itemHeight;
  });

  return listY + 25;
}

function renderShareImage(data, options, username) {
  const isStory = options.format === "story";
  const width = 1080;
  const height = isStory ? 1920 : getStandardHeight(data);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  if (isStory) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#2b2b2b");
    gradient.addColorStop(1, "#000000");
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = "#121212";
  }

  ctx.fillRect(0, 0, width, height);

  const recapTitle = `${username.name || "USER"} RECAP`.toUpperCase();
  drawHeader(ctx, width, isStory, recapTitle, getPeriodLabel(options.period));

  let currentY = isStory ? 340 : 220;

  if (data.albums?.length) {
    currentY = drawAlbums(ctx, data.albums, currentY, width, isStory);
  }

  if (data.artists?.length) {
    currentY = drawArtists(ctx, data.artists, currentY, width, isStory);
  }

  if (data.tracks?.length) {
    currentY = drawTracks(ctx, data.tracks, currentY, width, isStory);
  }

  ctx.fillStyle = isStory ? "rgba(255,255,255,0.5)" : "#666";
  ctx.font = "22px Sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Generated by YourLastFM", width / 2, height - (isStory ? 55 : 35));

  return canvas.toBuffer("image/png", {
    compressionLevel: 6
  });
}

async function generateShareImage(rawOptions) {
  if (activeGenerations >= MAX_ACTIVE_GENERATIONS) {
    throw new ShareGenerationBusyError();
  }

  activeGenerations++;

  try {
    const options = parseShareOptions(rawOptions);
    const isStory = options.format === "story";
    const start = getPeriodStart(options.period);
    const limits = getLimits(isStory);

    const [username, rawData] = await Promise.all([
      getLastFmUserInfo(),
      Promise.resolve(queryShareData(start, options.types, limits))
    ]);

    if (!hasShareData(rawData)) {
      const error = new Error("No data found for the selected period");
      error.statusCode = 400;
      throw error;
    }

    const data = await enrichShareData(rawData);
    return renderShareImage(data, options, username);
  } finally {
    activeGenerations--;
  }
}

module.exports = {
  generateShareImage,
  parseShareOptions,
  getPeriodStart,
  ShareGenerationBusyError
};

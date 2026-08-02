const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const db = require("../db");
const { fetchWithRetry } = require("../utils/fetchRetry");
const { normalizeImageUrl } = require("../utils/lastfmImage");

const cacheDir = path.join(db.dataDir, "image-cache");
const maxImageBytes = Math.max(1024, Number(process.env.SHARE_IMAGE_MAX_BYTES) || 10 * 1024 * 1024);
const requestTimeout = Math.max(1000, Number(process.env.IMAGE_REQUEST_TIMEOUT_MS) || 10000);
const failureTtlMs = Math.max(60000, Number(process.env.IMAGE_FAILURE_CACHE_MS) || 10 * 60 * 1000);
const inFlight = new Map();
const failedUntil = new Map();

const ALLOWED_HOSTS = new Set([
  "lastfm.freetls.fastly.net",
  "lastfm-img2.akamaized.net",
  "img2-ak.lst.fm",
  "userserve-ak.last.fm",
  "cdn-images.dzcdn.net",
  "e-cdns-images.dzcdn.net"
]);

const CONTENT_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

function parseAllowedRemoteImageUrl(source) {
  const normalized = normalizeImageUrl(source);
  if (!normalized || normalized.startsWith("/")) return null;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function isAllowedRemoteImageUrl(source) {
  return Boolean(parseAllowedRemoteImageUrl(source));
}

function getCachePaths(source) {
  const hash = crypto.createHash("sha256").update(source).digest("hex");
  return {
    dataPath: path.join(cacheDir, `${hash}.bin`),
    metaPath: path.join(cacheDir, `${hash}.json`),
    hash
  };
}

function detectImageContentType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a") {
    return "image/gif";
  }
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  if (buffer.subarray(4, 12).toString("ascii").includes("ftypavif")) return "image/avif";

  return null;
}

function validateRedirect(options) {
  const protocol = String(options.protocol || "").toLowerCase();
  const hostname = String(options.hostname || options.host || "").toLowerCase();

  if (protocol !== "https:" || !ALLOWED_HOSTS.has(hostname)) {
    throw new Error("Remote image redirect is not allowed");
  }
}

async function removeCache(paths) {
  await Promise.all([
    fs.rm(paths.dataPath, { force: true }),
    fs.rm(paths.metaPath, { force: true })
  ]);
}

async function readCachedImage(paths) {
  try {
    const [buffer, metadataText] = await Promise.all([
      fs.readFile(paths.dataPath),
      fs.readFile(paths.metaPath, "utf8")
    ]);
    const metadata = JSON.parse(metadataText);
    const detectedType = detectImageContentType(buffer);

    if (
      !buffer.length
      || buffer.length > maxImageBytes
      || !detectedType
      || !CONTENT_TYPES.has(metadata.contentType)
      || detectedType !== metadata.contentType
    ) {
      await removeCache(paths);
      return null;
    }

    return {
      buffer,
      contentType: detectedType,
      etag: `"${paths.hash}"`
    };
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    return null;
  }
}

async function downloadRemoteImage(source) {
  const response = await fetchWithRetry(() =>
    axios.get(source, {
      responseType: "arraybuffer",
      timeout: requestTimeout,
      maxContentLength: maxImageBytes,
      maxBodyLength: maxImageBytes,
      maxRedirects: 3,
      beforeRedirect: validateRedirect,
      headers: {
        "User-Agent": "YourLastFM/1.0 image-cache",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
      }
    }),
    2,
    500
  );

  const buffer = Buffer.from(response.data);
  if (!buffer.length || buffer.length > maxImageBytes) {
    throw new Error("Remote image is empty or too large");
  }

  const detectedType = detectImageContentType(buffer);
  if (!detectedType) {
    const reportedType = String(response.headers?.["content-type"] || "").split(";")[0].trim();
    throw new Error(`Unexpected remote image content: ${reportedType || "unknown"}`);
  }

  return { buffer, contentType: detectedType };
}

async function writeCachedImage(paths, image) {
  await fs.mkdir(cacheDir, { recursive: true });
  const token = `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
  const tempDataPath = `${paths.dataPath}.${token}.tmp`;
  const tempMetaPath = `${paths.metaPath}.${token}.tmp`;

  await Promise.all([
    fs.writeFile(tempDataPath, image.buffer),
    fs.writeFile(tempMetaPath, JSON.stringify({ contentType: image.contentType }))
  ]);

  try {
    await Promise.all([
      fs.rename(tempDataPath, paths.dataPath),
      fs.rename(tempMetaPath, paths.metaPath)
    ]);
  } finally {
    await Promise.all([
      fs.rm(tempDataPath, { force: true }),
      fs.rm(tempMetaPath, { force: true })
    ]);
  }
}

async function fetchRemoteImage(source, ignoreCache = false) {
  const normalized = parseAllowedRemoteImageUrl(source);
  if (!normalized) {
    const error = new Error("Remote image host is not allowed");
    error.statusCode = 400;
    throw error;
  }

  const paths = getCachePaths(normalized);
  if (!ignoreCache) {
    const cached = await readCachedImage(paths);
    if (cached) return cached;
  }

  const downloaded = await downloadRemoteImage(normalized);
  await writeCachedImage(paths, downloaded);

  return {
    ...downloaded,
    etag: `"${paths.hash}"`
  };
}

async function getRemoteImage(source) {
  const normalized = parseAllowedRemoteImageUrl(source);
  if (!normalized) {
    const error = new Error("Remote image host is not allowed");
    error.statusCode = 400;
    throw error;
  }

  if ((failedUntil.get(normalized) || 0) > Date.now()) {
    const error = new Error("Remote image is temporarily unavailable");
    error.statusCode = 503;
    throw error;
  }
  if (inFlight.has(normalized)) return inFlight.get(normalized);

  const request = fetchRemoteImage(normalized)
    .then(image => {
      failedUntil.delete(normalized);
      return image;
    })
    .catch(error => {
      failedUntil.set(normalized, Date.now() + failureTtlMs);
      throw error;
    })
    .finally(() => inFlight.delete(normalized));

  inFlight.set(normalized, request);
  return request;
}

function toImageProxyUrl(source) {
  if (!source || typeof source !== "string" || source.startsWith("/")) return source;
  const normalized = parseAllowedRemoteImageUrl(source);
  return normalized ? `/api/image-proxy?url=${encodeURIComponent(normalized)}` : source;
}

module.exports = {
  detectImageContentType,
  getRemoteImage,
  isAllowedRemoteImageUrl,
  parseAllowedRemoteImageUrl,
  toImageProxyUrl
};

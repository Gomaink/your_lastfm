const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { loadImage } = require("canvas");

const db = require("../db");
const { fetchWithRetry } = require("../utils/fetchRetry");

const publicDir = path.join(__dirname, "../../public");
const cacheDir = path.join(db.dataDir, "image-cache");
const maxImageBytes = Math.max(1024, Number(process.env.SHARE_IMAGE_MAX_BYTES) || 10 * 1024 * 1024);
const requestTimeout = Math.max(1000, Number(process.env.IMAGE_REQUEST_TIMEOUT_MS) || 10000);
const failureTtlMs = Math.max(60000, Number(process.env.IMAGE_FAILURE_CACHE_MS) || 10 * 60 * 1000);
const inFlight = new Map();
const failedUntil = new Map();

function isInside(baseDir, targetPath) {
  const relative = path.relative(baseDir, targetPath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function resolveLocalImage(source) {
  if (!source || typeof source !== "string") return null;

  const cleanSource = source.split("?")[0].split("#")[0];
  let target = null;

  if (cleanSource.startsWith("/covers/")) {
    const coversRoot = path.resolve(db.dataDir, "covers");
    target = path.resolve(db.dataDir, cleanSource.slice(1));
    return target === coversRoot || isInside(coversRoot, target) ? target : null;
  }

  if (cleanSource.startsWith("/")) {
    target = path.resolve(publicDir, cleanSource.slice(1));
    return target === publicDir || isInside(publicDir, target) ? target : null;
  }

  if (!/^https?:\/\//i.test(cleanSource)) {
    target = path.resolve(publicDir, cleanSource);
    return target === publicDir || isInside(publicDir, target) ? target : null;
  }

  return null;
}

async function readLocalImage(source) {
  const localPath = resolveLocalImage(source);
  if (!localPath) return null;

  try {
    return await fs.readFile(localPath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Could not read local share image ${source}:`, error.message);
    }
    return null;
  }
}

function getCachePath(source) {
  const hash = crypto.createHash("sha256").update(source).digest("hex");
  return path.join(cacheDir, `${hash}.img`);
}

async function downloadRemoteImage(source, ignoreCache = false) {
  await fs.mkdir(cacheDir, { recursive: true });
  const cachePath = getCachePath(source);

  if (!ignoreCache) {
    try {
      const buffer = await fs.readFile(cachePath);
      if (!buffer.length || buffer.length > maxImageBytes) {
        await fs.rm(cachePath, { force: true });
      } else {
        return { buffer, cachePath };
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  const response = await fetchWithRetry(() =>
    axios.get(source, {
      responseType: "arraybuffer",
      timeout: requestTimeout,
      maxContentLength: maxImageBytes,
      maxBodyLength: maxImageBytes,
      headers: {
        "User-Agent": "YourLastFM/1.0 share-image-generator",
        Accept: "image/*"
      }
    }),
    2,
    500
  );

  const contentType = String(response.headers?.["content-type"] || "").toLowerCase();
  if (contentType && !contentType.startsWith("image/") && !contentType.includes("octet-stream")) {
    throw new Error(`Unexpected remote image content type: ${contentType}`);
  }

  const buffer = Buffer.from(response.data);
  if (!buffer.length || buffer.length > maxImageBytes) {
    throw new Error("Remote image is empty or too large");
  }

  const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, buffer);

  try {
    await fs.rename(tempPath, cachePath);
  } finally {
    await fs.rm(tempPath, { force: true });
  }

  return { buffer, cachePath };
}

async function loadRemoteImage(source) {
  let remote = await downloadRemoteImage(source);

  try {
    return await loadImage(remote.buffer);
  } catch {
    await fs.rm(remote.cachePath, { force: true });
    remote = await downloadRemoteImage(source, true);
    return loadImage(remote.buffer);
  }
}

async function loadShareImageUncached(source) {
  if (!source || typeof source !== "string") return null;

  const localBuffer = await readLocalImage(source);
  if (localBuffer) return loadImage(localBuffer);

  if (/^https?:\/\//i.test(source)) {
    return loadRemoteImage(source);
  }

  return null;
}

async function loadShareImage(source) {
  if (!source) return null;
  if ((failedUntil.get(source) || 0) > Date.now()) return null;
  if (inFlight.has(source)) return inFlight.get(source);

  const request = loadShareImageUncached(source)
    .then(image => {
      if (image) failedUntil.delete(source);
      else failedUntil.set(source, Date.now() + failureTtlMs);
      return image;
    })
    .catch(error => {
      console.warn(`Share image failed (${source}):`, error.message);
      failedUntil.set(source, Date.now() + failureTtlMs);
      return null;
    })
    .finally(() => inFlight.delete(source));

  inFlight.set(source, request);
  return request;
}

module.exports = { loadShareImage, resolveLocalImage };

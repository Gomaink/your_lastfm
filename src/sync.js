require("dotenv").config();

const axios = require("axios");
const fs = require("fs");
const path = require("path");

const db = require("./db");
const { fetchWithRetry } = require("./utils/fetchRetry");
const { assertLastFmResponse } = require("./utils/lastfmResponse");
const { sanitizeError } = require("./utils/sanitizeAxios");
const { parseSyncCheckpoint, resolveSyncWindow } = require("./utils/syncWindow");

const CONFIG = {
  API_URL: "https://ws.audioscrobbler.com/2.0/",
  REQUEST_DELAY: Number(process.env.LASTFM_REQUEST_DELAY_MS || 250),
  REQUEST_TIMEOUT: Number(process.env.LASTFM_REQUEST_TIMEOUT_MS || 15000),
  PER_PAGE: 200,
  OVERLAP_SECONDS: Number(process.env.SYNC_OVERLAP_SECONDS || 86400),
  STALE_LOCK_MS: Number(process.env.SYNC_STALE_LOCK_MS || 2 * 60 * 60 * 1000)
};

const LOCK_FILE = path.join(db.dataDir, "sync.lock");
const STATUS_KEY = "sync_status";
const CHECKPOINT_KEY = "sync_checkpoint";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const insertScrobble = db.prepare(`
  INSERT OR IGNORE INTO scrobbles (artist, track, album, played_at)
  VALUES (?, ?, ?, ?)
`);

const getLastPlayedAt = db.prepare(`
  SELECT MAX(played_at) AS last
  FROM scrobbles
`);

const setMetadata = db.prepare(`
  INSERT INTO metadata (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

const getMetadata = db.prepare(`
  SELECT value
  FROM metadata
  WHERE key = ?
`);

const deleteMetadata = db.prepare(`
  DELETE FROM metadata
  WHERE key = ?
`);

const runSyncTransaction = db.transaction(tracks => {
  let inserted = 0;
  let skipped = 0;

  for (const track of tracks) {
    const artist = track.artist?.["#text"]?.trim();
    const name = track.name?.trim();
    const album = track.album?.["#text"]?.trim() || null;
    const playedAt = Number(track.date?.uts);

    if (!artist || !name || !Number.isInteger(playedAt) || playedAt <= 0) {
      skipped++;
      continue;
    }

    const result = insertScrobble.run(artist, name, album, playedAt);
    if (result.changes > 0) inserted++;
  }

  return { inserted, skipped };
});

let localSyncPromise = null;

function validateConfiguration() {
  if (!process.env.LASTFM_API_KEY || !process.env.LASTFM_USERNAME) {
    throw new Error("LASTFM_API_KEY and LASTFM_USERNAME must be configured");
  }
}

function saveSyncStatus(status) {
  setMetadata.run(STATUS_KEY, JSON.stringify({
    ...status,
    updatedAt: Date.now()
  }));
}

function getSyncStatus() {
  const row = getMetadata.get(STATUS_KEY);

  if (!row?.value) {
    return {
      running: false,
      mode: null,
      page: 0,
      totalPages: 0,
      inserted: 0,
      skipped: 0,
      message: "Not started"
    };
  }

  try {
    return JSON.parse(row.value);
  } catch {
    return {
      running: false,
      mode: null,
      page: 0,
      totalPages: 0,
      inserted: 0,
      skipped: 0,
      message: "Unknown status"
    };
  }
}

function removeStaleLock() {
  try {
    const stat = fs.statSync(LOCK_FILE);
    if (Date.now() - stat.mtimeMs <= CONFIG.STALE_LOCK_MS) return false;

    fs.unlinkSync(LOCK_FILE);
    console.warn("⚠️ Removed stale sync lock");
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function tryAcquireSyncLock() {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(LOCK_FILE, "wx");
      const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      fs.writeFileSync(fd, JSON.stringify({ token, pid: process.pid, startedAt: Date.now() }));
      return { fd, token };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (attempt === 0 && removeStaleLock()) continue;
      return null;
    }
  }

  return null;
}

function releaseSyncLock(lock) {
  try {
    if (lock?.fd !== null && lock?.fd !== undefined) fs.closeSync(lock.fd);
  } catch {}

  try {
    const currentLock = JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));
    if (currentLock.token === lock?.token) fs.unlinkSync(LOCK_FILE);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("Could not remove sync lock:", error.message);
    }
  }
}

function refreshSyncLock(lock) {
  if (lock?.fd === null || lock?.fd === undefined) return;

  try {
    const now = new Date();
    fs.futimesSync(lock.fd, now, now);
  } catch (error) {
    console.warn("Could not refresh sync lock:", error.message);
  }
}

async function fetchLastfmPage({ page, from, to }) {
  try {
    const params = {
      method: "user.getrecenttracks",
      user: process.env.LASTFM_USERNAME,
      api_key: process.env.LASTFM_API_KEY,
      format: "json",
      limit: CONFIG.PER_PAGE,
      page,
      to
    };

    if (from > 0) params.from = from;

    const response = await fetchWithRetry(async () => {
      const result = await axios.get(CONFIG.API_URL, {
        timeout: CONFIG.REQUEST_TIMEOUT,
        params
      });
      assertLastFmResponse(result.data);
      return result;
    });

    const data = response.data;
    if (!data?.recenttracks) throw new Error("Last.fm returned an invalid recent tracks response");

    return data.recenttracks;
  } catch (error) {
    console.error("[Last.fm sync error]", sanitizeError(error));
    throw error;
  }
}

async function runSync(options, lock) {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const lastPlayedAt = Number(getLastPlayedAt.get()?.last || 0);
  const savedCheckpoint = parseSyncCheckpoint(getMetadata.get(CHECKPOINT_KEY)?.value);
  const window = resolveSyncWindow({
    full: options.full === true,
    currentTimestamp,
    lastPlayedAt,
    overlapSeconds: CONFIG.OVERLAP_SECONDS,
    checkpoint: savedCheckpoint
  });
  const isFullSync = window.mode === "full";
  const { mode, from, to, resumed } = window;

  setMetadata.run(CHECKPOINT_KEY, JSON.stringify({ mode, from, to }));

  console.log(
    resumed
      ? `↩️ Resuming ${mode} sync window from ${from} to ${to}...`
      : isFullSync
        ? "🔄 Starting FULL sync with Last.fm..."
        : `🔄 Starting incremental sync from ${from || "the beginning"}...`
  );

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalPages = 1;
  let currentPage = 0;
  const startedAt = Date.now();

  saveSyncStatus({
    running: true,
    mode,
    page: 0,
    totalPages,
    inserted: 0,
    skipped: 0,
    startedAt,
    resumed,
    from,
    to,
    message: resumed ? "Resuming interrupted synchronization..." : "Connecting to Last.fm..."
  });

  try {
    const firstPage = await fetchLastfmPage({ page: 1, from, to });
    const parsedTotalPages = Number.parseInt(firstPage["@attr"]?.totalPages || "1", 10);
    totalPages = Number.isInteger(parsedTotalPages) && parsedTotalPages > 0
      ? parsedTotalPages
      : 1;

    for (let page = 1; page <= totalPages; page++) {
      currentPage = page;
      const pageData = page === 1
        ? firstPage
        : await fetchLastfmPage({ page, from, to });

      const tracks = Array.isArray(pageData.track)
        ? pageData.track
        : pageData.track
          ? [pageData.track]
          : [];

      const result = runSyncTransaction(tracks);
      totalInserted += result.inserted;
      totalSkipped += result.skipped;
      refreshSyncLock(lock);

      const percent = Math.round((page / totalPages) * 100);
      saveSyncStatus({
        running: true,
        mode,
        page,
        totalPages,
        inserted: totalInserted,
        skipped: totalSkipped,
        startedAt,
        resumed,
        from,
        to,
        message: `Syncing page ${page} of ${totalPages} (${percent}%)`
      });

      if (page === 1 || page === totalPages || page % 10 === 0) {
        console.log(`[${page}/${totalPages}] ${percent}% - ${totalInserted} new`);
      }

      if (page < totalPages && CONFIG.REQUEST_DELAY > 0) {
        await sleep(CONFIG.REQUEST_DELAY);
      }
    }

    const finishedAt = Date.now();
    deleteMetadata.run(CHECKPOINT_KEY);
    setMetadata.run("last_sync", String(finishedAt));
    saveSyncStatus({
      running: false,
      mode,
      page: totalPages,
      totalPages,
      inserted: totalInserted,
      skipped: totalSkipped,
      startedAt,
      finishedAt,
      resumed,
      from,
      to,
      message: `Sync completed with ${totalInserted} new scrobbles`
    });

    console.log(`✨ Sync finished - Total new scrobbles: ${totalInserted}`);

    return {
      started: true,
      running: false,
      mode,
      totalPages,
      inserted: totalInserted,
      skipped: totalSkipped,
      resumed,
      from,
      to
    };
  } catch (error) {
    saveSyncStatus({
      running: false,
      mode,
      page: currentPage,
      totalPages,
      inserted: totalInserted,
      skipped: totalSkipped,
      startedAt,
      failedAt: Date.now(),
      resumed,
      from,
      to,
      message: `${error.message || "Sync failed"}. The same sync window will be retried.`,
      error: true
    });
    throw error;
  } finally {
    releaseSyncLock(lock);
  }
}

function startSync(options = {}) {
  if (localSyncPromise) {
    return { started: false, promise: localSyncPromise, status: getSyncStatus() };
  }

  validateConfiguration();
  const lock = tryAcquireSyncLock();

  if (lock === null) {
    return {
      started: false,
      promise: null,
      status: {
        ...getSyncStatus(),
        running: true,
        message: "A synchronization is already running"
      }
    };
  }

  localSyncPromise = runSync(options, lock)
    .finally(() => {
      localSyncPromise = null;
    });

  return { started: true, promise: localSyncPromise, status: getSyncStatus() };
}

async function sync(options = {}) {
  const task = startSync(options);

  if (!task.started) {
    return {
      ...task.status,
      started: false,
      running: true
    };
  }

  return task.promise;
}

module.exports = { sync, startSync, getSyncStatus };

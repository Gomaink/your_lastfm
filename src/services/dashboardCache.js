const db = require("../db");

const CACHE_REVISION_KEY = "dashboard_cache_revision";
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const pendingBuilds = new Map();

const getMetadata = db.prepare(`
  SELECT value
  FROM metadata
  WHERE key = ?
`);

const setMetadata = db.prepare(`
  INSERT INTO metadata (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

const getCacheEntry = db.prepare(`
  SELECT revision, payload, created_at
  FROM dashboard_cache
  WHERE cache_key = ?
`);

const setCacheEntry = db.prepare(`
  INSERT INTO dashboard_cache (cache_key, revision, payload, created_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(cache_key) DO UPDATE SET
    revision = excluded.revision,
    payload = excluded.payload,
    created_at = excluded.created_at
`);

const deleteCacheEntry = db.prepare(`
  DELETE FROM dashboard_cache
  WHERE cache_key = ?
`);

const clearOldCacheEntries = db.prepare(`
  DELETE FROM dashboard_cache
  WHERE revision < ?
`);

function getCacheTtlMs() {
  const parsed = Number.parseInt(process.env.DASHBOARD_CACHE_TTL_MS || "", 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_TTL_MS;
}

function getDashboardCacheRevision() {
  const parsed = Number.parseInt(getMetadata.get(CACHE_REVISION_KEY)?.value || "1", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function invalidateDashboardCache() {
  const nextRevision = Math.max(Date.now(), getDashboardCacheRevision() + 1);
  const update = db.transaction(() => {
    setMetadata.run(CACHE_REVISION_KEY, String(nextRevision));
    clearOldCacheEntries.run(nextRevision);
  });

  update();
  pendingBuilds.clear();
  return nextRevision;
}

function readCachedDashboard(cacheKey, revision, now = Date.now()) {
  const row = getCacheEntry.get(cacheKey);
  if (!row || row.revision !== revision) return null;

  const ageMs = Math.max(0, now - row.created_at);
  const ttlMs = getCacheTtlMs();
  if (ttlMs > 0 && ageMs > ttlMs) return null;

  try {
    return {
      data: JSON.parse(row.payload),
      cache: {
        hit: true,
        revision,
        cachedAt: row.created_at,
        ageMs
      }
    };
  } catch {
    deleteCacheEntry.run(cacheKey);
    return null;
  }
}

async function withDashboardCache(cacheKey, producer) {
  const revision = getDashboardCacheRevision();
  const cached = readCachedDashboard(cacheKey, revision);
  if (cached) return cached;

  const pendingKey = `${revision}:${cacheKey}`;
  if (pendingBuilds.has(pendingKey)) return pendingBuilds.get(pendingKey);

  const build = Promise.resolve()
    .then(producer)
    .then(data => {
      const createdAt = Date.now();
      setCacheEntry.run(cacheKey, revision, JSON.stringify(data), createdAt);

      return {
        data,
        cache: {
          hit: false,
          revision,
          cachedAt: createdAt,
          ageMs: 0
        }
      };
    })
    .finally(() => pendingBuilds.delete(pendingKey));

  pendingBuilds.set(pendingKey, build);
  return build;
}

module.exports = {
  getDashboardCacheRevision,
  invalidateDashboardCache,
  withDashboardCache
};

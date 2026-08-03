const axios = require("axios");
const crypto = require("crypto");

const { version: APP_VERSION } = require("../../package.json");

const db = require("../db");
const { fetchWithRetry } = require("../utils/fetchRetry");
const { assertLastFmResponse } = require("../utils/lastfmResponse");
const { getLastFmImage } = require("../utils/lastfmImage");
const { mapWithConcurrency } = require("../utils/mapWithConcurrency");
const { sanitizeError } = require("../utils/sanitizeAxios");
const {
  aggregateMemberCharts,
  compoundKey,
  extractArtistName,
  normalizeChartItems,
  normalizeGroupInput,
  normalizeKey,
  normalizeLeaderboardType,
  normalizeText
} = require("../utils/leaderboard");
const { parseLeaderboardRange } = require("../utils/leaderboardRange");
const { ensureAlbumCover } = require("./albumCoverCache");
const { ensureArtistImage } = require("./artistImageCache");
const { ensureTrackCover } = require("./trackCoverCache");
const { toImageProxyUrl } = require("./remoteImageCache");

const BASE_URL = "https://ws.audioscrobbler.com/2.0/";
const USER_AGENT = `YourLastFM/${APP_VERSION} (+https://github.com/Gomaink/your_lastfm)`;
const API_KEY = process.env.LASTFM_API_KEY;
const MAIN_USER = normalizeText(process.env.LASTFM_USERNAME);
const AVATAR_PLACEHOLDER = "/images/artist-placeholder.png";
const COVER_PLACEHOLDER = "/images/cover-placeholder.svg";
const REQUEST_TIMEOUT = Math.max(1000, Number(process.env.LASTFM_REQUEST_TIMEOUT_MS) || 15000);
const REQUEST_CONCURRENCY = Math.max(
  1,
  Number(process.env.LEADERBOARD_REQUEST_CONCURRENCY)
    || Number(process.env.EXTERNAL_REQUEST_CONCURRENCY)
    || 4
);
const MAX_MEMBERS = Math.max(2, Number(process.env.LEADERBOARD_MAX_MEMBERS) || 20);
const MAX_GROUPS = Math.max(1, Number(process.env.LEADERBOARD_MAX_GROUPS) || 50);
const MAX_RANGE_DAYS = Math.max(1, Number(process.env.LEADERBOARD_MAX_RANGE_DAYS) || 366);
const cacheTtlValue = process.env.LEADERBOARD_CACHE_TTL_MS;
const parsedCacheTtl = cacheTtlValue === undefined || cacheTtlValue === ""
  ? 15 * 60 * 1000
  : Number(cacheTtlValue);
const CACHE_TTL_MS = Math.max(0, Number.isFinite(parsedCacheTtl) ? parsedCacheTtl : 15 * 60 * 1000);
const PROFILE_TTL_MS = Math.max(60000, Number(process.env.LEADERBOARD_PROFILE_TTL_MS) || 24 * 60 * 60 * 1000);
const ALBUM_TTL_MS = Math.max(60000, Number(process.env.LEADERBOARD_ALBUM_TTL_MS) || 30 * 24 * 60 * 60 * 1000);
const RESULT_LIMIT = 20;

const profileInFlight = new Map();
const chartInFlight = new Map();
const resultInFlight = new Map();
const albumInFlight = new Map();
let lastCachePruneAt = 0;

const chartCacheGet = db.prepare(`
  SELECT payload, created_at
  FROM leaderboard_chart_cache
  WHERE cache_key = ?
`);
const chartCacheSet = db.prepare(`
  INSERT INTO leaderboard_chart_cache (
    cache_key, username_key, chart_type, range_from, range_to, payload, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(cache_key) DO UPDATE SET
    payload = excluded.payload,
    created_at = excluded.created_at
`);
const resultCacheGet = db.prepare(`
  SELECT payload, created_at
  FROM leaderboard_result_cache
  WHERE cache_key = ?
`);
const resultCacheSet = db.prepare(`
  INSERT INTO leaderboard_result_cache (cache_key, group_id, payload, created_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(cache_key) DO UPDATE SET
    payload = excluded.payload,
    created_at = excluded.created_at
`);
const albumCacheGet = db.prepare(`
  SELECT payload, created_at
  FROM leaderboard_album_cache
  WHERE cache_key = ?
`);
const albumCacheSet = db.prepare(`
  INSERT INTO leaderboard_album_cache (cache_key, artist, album, payload, created_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(cache_key) DO UPDATE SET
    payload = excluded.payload,
    created_at = excluded.created_at
`);

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function hashKey(...parts) {
  return crypto
    .createHash("sha256")
    .update(parts.map(part => String(part ?? "")).join("\u0000"))
    .digest("hex");
}

function parseCachedPayload(row, ttlMs) {
  if (!row) return null;
  const ageMs = Date.now() - Number(row.created_at || 0);
  if (ttlMs > 0 && ageMs > ttlMs) return null;

  try {
    return { value: JSON.parse(row.payload), ageMs, createdAt: Number(row.created_at) };
  } catch {
    return null;
  }
}

async function lastFmRequest(params) {
  if (!API_KEY) throw createHttpError("LASTFM_API_KEY is not configured", 500);

  return fetchWithRetry(async () => {
    const response = await axios.get(BASE_URL, {
      timeout: REQUEST_TIMEOUT,
      headers: { "User-Agent": USER_AGENT },
      params: {
        api_key: API_KEY,
        format: "json",
        ...params
      }
    });

    assertLastFmResponse(response.data);
    return response.data;
  });
}

function normalizeProfileRow(row) {
  if (!row) return null;
  return {
    username: row.username,
    realname: row.realname || null,
    avatar: row.avatar || AVATAR_PLACEHOLDER,
    url: row.profile_url || null,
    playcount: Number(row.playcount || 0),
    updatedAt: Number(row.updated_at || 0)
  };
}

function getCachedProfile(username) {
  const key = normalizeKey(username);
  const row = db.prepare(`
    SELECT username, realname, avatar, profile_url, playcount, updated_at
    FROM leaderboard_user_cache
    WHERE username_key = ?
  `).get(key);

  return normalizeProfileRow(row);
}

function saveProfile(profile) {
  const key = normalizeKey(profile.username);
  const now = Date.now();

  db.prepare(`
    INSERT INTO leaderboard_user_cache (
      username_key, username, realname, avatar, profile_url, playcount, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(username_key) DO UPDATE SET
      username = excluded.username,
      realname = excluded.realname,
      avatar = excluded.avatar,
      profile_url = excluded.profile_url,
      playcount = excluded.playcount,
      updated_at = excluded.updated_at
  `).run(
    key,
    profile.username,
    profile.realname,
    profile.avatar,
    profile.url,
    profile.playcount,
    now
  );

  return { ...profile, updatedAt: now };
}

async function fetchUserProfile(username) {
  let data;

  try {
    data = await lastFmRequest({
      method: "user.getInfo",
      user: username
    });
  } catch (error) {
    if ([6, 7].includes(Number(error.lastFmCode))) {
      throw createHttpError(`Last.fm user "${username}" was not found`, 400);
    }
    throw error;
  }

  const user = data?.user;
  if (!user?.name) throw createHttpError(`Last.fm user "${username}" was not found`, 400);

  return saveProfile({
    username: normalizeText(user.name),
    realname: normalizeText(user.realname) || null,
    avatar: toImageProxyUrl(getLastFmImage(user.image)) || AVATAR_PLACEHOLDER,
    url: normalizeText(user.url) || null,
    playcount: Math.max(0, Number.parseInt(user.playcount || "0", 10) || 0)
  });
}

async function getUserProfile(username, { force = false } = {}) {
  const cleanUsername = normalizeText(username);
  if (!cleanUsername) throw createHttpError("Last.fm username is required");

  const key = normalizeKey(cleanUsername);
  const cached = getCachedProfile(cleanUsername);
  if (!force && cached && Date.now() - cached.updatedAt <= PROFILE_TTL_MS) return cached;
  if (profileInFlight.has(key)) return profileInFlight.get(key);

  const request = fetchUserProfile(cleanUsername)
    .catch(error => {
      if (cached && Number(error.statusCode || error.response?.status || 500) >= 500) {
        console.warn(`Using stale leaderboard profile for ${cleanUsername}:`, error.message);
        return { ...cached, stale: true };
      }
      throw error;
    })
    .finally(() => profileInFlight.delete(key));

  profileInFlight.set(key, request);
  return request;
}

function getGroupRow(groupId) {
  const id = Number.parseInt(groupId, 10);
  if (!Number.isInteger(id) || id <= 0) throw createHttpError("Invalid leaderboard group", 400);

  const group = db.prepare(`
    SELECT id, name, created_at, updated_at
    FROM leaderboard_groups
    WHERE id = ?
  `).get(id);

  if (!group) throw createHttpError("Leaderboard group not found", 404);
  return group;
}

function loadGroupMembers(groupId) {
  return db.prepare(`
    SELECT
      member.username,
      member.username_key,
      member.position,
      profile.realname,
      profile.avatar,
      profile.profile_url,
      profile.playcount,
      profile.updated_at
    FROM leaderboard_members AS member
    LEFT JOIN leaderboard_user_cache AS profile
      ON profile.username_key = member.username_key
    WHERE member.group_id = ?
    ORDER BY member.position, member.username COLLATE NOCASE
  `).all(groupId).map(row => ({
    username: row.username,
    realname: row.realname || null,
    avatar: row.avatar || AVATAR_PLACEHOLDER,
    url: row.profile_url || null,
    playcount: Number(row.playcount || 0),
    updatedAt: Number(row.updated_at || 0)
  }));
}

function serializeGroup(row, members = null) {
  return {
    id: Number(row.id),
    name: row.name,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    members: members || loadGroupMembers(row.id)
  };
}

function listLeaderboardGroups() {
  const rows = db.prepare(`
    SELECT id, name, created_at, updated_at
    FROM leaderboard_groups
    ORDER BY updated_at DESC, name COLLATE NOCASE
  `).all();
  const membersByGroup = new Map();

  if (rows.length) {
    const memberRows = db.prepare(`
      SELECT
        member.group_id,
        member.username,
        member.position,
        profile.realname,
        profile.avatar,
        profile.profile_url,
        profile.playcount,
        profile.updated_at
      FROM leaderboard_members AS member
      LEFT JOIN leaderboard_user_cache AS profile
        ON profile.username_key = member.username_key
      ORDER BY member.group_id, member.position, member.username COLLATE NOCASE
    `).all();

    for (const member of memberRows) {
      const groupMembers = membersByGroup.get(member.group_id) || [];
      groupMembers.push({
        username: member.username,
        realname: member.realname || null,
        avatar: member.avatar || AVATAR_PLACEHOLDER,
        url: member.profile_url || null,
        playcount: Number(member.playcount || 0),
        updatedAt: Number(member.updated_at || 0)
      });
      membersByGroup.set(member.group_id, groupMembers);
    }
  }

  return {
    mainUsername: MAIN_USER || null,
    limits: {
      maxGroups: MAX_GROUPS,
      maxMembers: MAX_MEMBERS,
      maxRangeDays: MAX_RANGE_DAYS
    },
    groups: rows.map(row => serializeGroup(row, membersByGroup.get(row.id) || []))
  };
}

function getLeaderboardGroup(groupId) {
  return serializeGroup(getGroupRow(groupId));
}

function invalidateGroupResultCache(groupId) {
  db.prepare("DELETE FROM leaderboard_result_cache WHERE group_id = ?").run(groupId);
}

function convertGroupConstraint(error) {
  if (String(error.code || "").startsWith("SQLITE_CONSTRAINT")) {
    throw createHttpError("A leaderboard group with this name already exists", 409);
  }
  throw error;
}

async function validateMembers(usernames) {
  return mapWithConcurrency(usernames, REQUEST_CONCURRENCY, username => getUserProfile(username));
}

async function createLeaderboardGroup(payload) {
  const input = normalizeGroupInput(payload, { maxMembers: MAX_MEMBERS });
  const total = db.prepare("SELECT COUNT(*) AS total FROM leaderboard_groups").get().total;
  if (Number(total) >= MAX_GROUPS) {
    throw createHttpError(`You can create at most ${MAX_GROUPS} leaderboard groups`, 409);
  }

  const profiles = await validateMembers(input.members);
  const now = Date.now();
  const insertGroup = db.prepare(`
    INSERT INTO leaderboard_groups (name, created_at, updated_at)
    VALUES (?, ?, ?)
  `);
  const insertMember = db.prepare(`
    INSERT INTO leaderboard_members (group_id, username_key, username, position)
    VALUES (?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    const result = insertGroup.run(input.name, now, now);
    const groupId = Number(result.lastInsertRowid);

    profiles.forEach((profile, index) => {
      insertMember.run(groupId, normalizeKey(profile.username), profile.username, index);
    });

    return groupId;
  });

  try {
    return getLeaderboardGroup(transaction());
  } catch (error) {
    return convertGroupConstraint(error);
  }
}

async function updateLeaderboardGroup(groupId, payload) {
  const group = getGroupRow(groupId);
  const input = normalizeGroupInput(payload, { maxMembers: MAX_MEMBERS });
  const profiles = await validateMembers(input.members);
  const now = Date.now();
  const updateGroup = db.prepare(`
    UPDATE leaderboard_groups
    SET name = ?, updated_at = ?
    WHERE id = ?
  `);
  const deleteMembers = db.prepare("DELETE FROM leaderboard_members WHERE group_id = ?");
  const insertMember = db.prepare(`
    INSERT INTO leaderboard_members (group_id, username_key, username, position)
    VALUES (?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    updateGroup.run(input.name, now, group.id);
    deleteMembers.run(group.id);
    profiles.forEach((profile, index) => {
      insertMember.run(group.id, normalizeKey(profile.username), profile.username, index);
    });
    invalidateGroupResultCache(group.id);
  });

  try {
    transaction();
    return getLeaderboardGroup(group.id);
  } catch (error) {
    return convertGroupConstraint(error);
  }
}

function deleteLeaderboardGroup(groupId) {
  const group = getGroupRow(groupId);
  db.prepare("DELETE FROM leaderboard_groups WHERE id = ?").run(group.id);
  return { deleted: true, id: Number(group.id) };
}

function getChartResponseItems(type, data) {
  if (type === "artists") return data?.weeklyartistchart?.artist;
  if (type === "albums") return data?.weeklyalbumchart?.album;
  return data?.weeklytrackchart?.track;
}

function getChartMethod(type) {
  if (type === "artists") return "user.getWeeklyArtistChart";
  if (type === "albums") return "user.getWeeklyAlbumChart";
  return "user.getWeeklyTrackChart";
}

async function fetchUserChart(username, type, range) {
  const data = await lastFmRequest({
    method: getChartMethod(type),
    user: username,
    from: range.fromTimestamp,
    to: range.toTimestamp
  });
  const items = normalizeChartItems(type, getChartResponseItems(type, data));

  return {
    username,
    type,
    from: range.fromTimestamp,
    to: range.toTimestamp,
    totalScrobbles: items.reduce((sum, item) => sum + item.playcount, 0),
    items,
    fetchedAt: Date.now()
  };
}

async function getUserChart(username, typeInput, range, { force = false } = {}) {
  const type = normalizeLeaderboardType(typeInput);
  const usernameKey = normalizeKey(username);
  const cacheKey = hashKey("leaderboard-chart", usernameKey, type, range.fromTimestamp, range.toTimestamp);

  const cacheRow = chartCacheGet.get(cacheKey);
  const staleCached = parseCachedPayload(cacheRow, 0);

  if (!force) {
    const cached = parseCachedPayload(cacheRow, CACHE_TTL_MS);
    if (cached) return cached.value;
  }

  const inFlightKey = `${cacheKey}:${force ? "refresh" : "normal"}`;
  if (chartInFlight.has(inFlightKey)) return chartInFlight.get(inFlightKey);

  const request = fetchUserChart(username, type, range)
    .then(chart => {
      chartCacheSet.run(
        cacheKey,
        usernameKey,
        type,
        range.fromTimestamp,
        range.toTimestamp,
        JSON.stringify(chart),
        Date.now()
      );
      return chart;
    })
    .catch(error => {
      if (!force && staleCached) {
        console.warn(`Using stale ${type} chart for ${username}:`, error.message);
        return { ...staleCached.value, stale: true };
      }
      throw error;
    })
    .finally(() => chartInFlight.delete(inFlightKey));

  chartInFlight.set(inFlightKey, request);
  return request;
}

async function resolveItemImage(type, item) {
  try {
    let source;
    if (type === "artists") source = await ensureArtistImage(item.name);
    if (type === "albums") source = await ensureAlbumCover(item.artist, item.name);
    if (type === "tracks") source = await ensureTrackCover(item.artist, item.name);
    return toImageProxyUrl(source) || COVER_PLACEHOLDER;
  } catch (error) {
    console.warn(`Leaderboard artwork failed (${type}: ${item.name}):`, error.message);
    return COVER_PLACEHOLDER;
  }
}

async function enrichItems(type, items) {
  return mapWithConcurrency(items, REQUEST_CONCURRENCY, async item => ({
    ...item,
    image: await resolveItemImage(type, item)
  }));
}

function buildResultCacheKey(group, type, range) {
  return hashKey(
    "leaderboard-result",
    group.id,
    group.updatedAt,
    type,
    range.fromTimestamp,
    range.toTimestamp
  );
}

async function buildLeaderboardResult(group, type, range, force) {
  const charts = await mapWithConcurrency(group.members, REQUEST_CONCURRENCY, async member => {
    try {
      const chart = await getUserChart(member.username, type, range, { force });
      const totalChart = type === "artists"
        ? chart
        : await getUserChart(member.username, "artists", range, { force });

      return {
        ...chart,
        totalScrobbles: totalChart.totalScrobbles,
        stale: Boolean(chart.stale || totalChart.stale),
        profile: member
      };
    } catch (error) {
      console.warn(`Leaderboard chart failed for ${member.username}:`, sanitizeError(error));
      return {
        username: member.username,
        profile: member,
        items: [],
        totalScrobbles: 0,
        error: error.message || "Could not load this user"
      };
    }
  });

  const availableCharts = charts.filter(chart => !chart.error);
  if (!availableCharts.length) {
    throw createHttpError("Last.fm did not return data for any group member", 502);
  }

  const aggregate = aggregateMemberCharts(type, charts, RESULT_LIMIT);
  const items = await enrichItems(type, aggregate.items);
  const generatedAt = Date.now();

  return {
    group,
    type,
    range,
    totalScrobbles: aggregate.totalScrobbles,
    members: aggregate.members,
    items,
    partial: availableCharts.length !== charts.length,
    stale: charts.some(chart => chart.stale),
    generatedAt
  };
}

function pruneLeaderboardCaches() {
  const now = Date.now();
  if (now - lastCachePruneAt < 60 * 60 * 1000) return;
  lastCachePruneAt = now;

  const chartCutoff = now - 30 * 24 * 60 * 60 * 1000;
  const albumCutoff = now - 90 * 24 * 60 * 60 * 1000;
  db.prepare("DELETE FROM leaderboard_chart_cache WHERE created_at < ?").run(chartCutoff);
  db.prepare("DELETE FROM leaderboard_result_cache WHERE created_at < ?").run(chartCutoff);
  db.prepare("DELETE FROM leaderboard_album_cache WHERE created_at < ?").run(albumCutoff);
}

async function getLeaderboardResult(groupId, query = {}) {
  const group = getLeaderboardGroup(groupId);
  const type = normalizeLeaderboardType(query.type || "artists");
  const range = parseLeaderboardRange(query, { maxDays: MAX_RANGE_DAYS });
  const force = String(query.refresh || "").toLowerCase() === "true" || query.refresh === "1";
  const cacheKey = buildResultCacheKey(group, type, range);
  const cacheRow = resultCacheGet.get(cacheKey);
  const staleCached = parseCachedPayload(cacheRow, 0);
  pruneLeaderboardCaches();

  if (!force) {
    const cached = parseCachedPayload(cacheRow, CACHE_TTL_MS);
    if (cached) {
      return {
        ...cached.value,
        cache: {
          hit: true,
          stale: false,
          ageMs: cached.ageMs,
          cachedAt: cached.createdAt
        }
      };
    }
  }

  const inFlightKey = `${cacheKey}:${force ? "refresh" : "normal"}`;
  if (resultInFlight.has(inFlightKey)) return resultInFlight.get(inFlightKey);

  const request = buildLeaderboardResult(group, type, range, force)
    .then(result => {
      const createdAt = Date.now();
      resultCacheSet.run(cacheKey, group.id, JSON.stringify(result), createdAt);
      return {
        ...result,
        cache: { hit: false, stale: false, ageMs: 0, cachedAt: createdAt }
      };
    })
    .catch(error => {
      if (!force && staleCached) {
        console.warn(`Using stale leaderboard result for group ${group.id}:`, error.message);
        return {
          ...staleCached.value,
          stale: true,
          cache: {
            hit: true,
            stale: true,
            ageMs: staleCached.ageMs,
            cachedAt: staleCached.createdAt
          }
        };
      }
      throw error;
    })
    .finally(() => resultInFlight.delete(inFlightKey));

  resultInFlight.set(inFlightKey, request);
  return request;
}

async function fetchAlbumTrackList(artist, album) {
  const data = await lastFmRequest({
    method: "album.getInfo",
    artist,
    album,
    autocorrect: 1
  });
  const albumData = data?.album;
  const rows = Array.isArray(albumData?.tracks?.track)
    ? albumData.tracks.track
    : albumData?.tracks?.track
      ? [albumData.tracks.track]
      : [];

  const fallbackArtist = normalizeText(albumData?.artist) || artist;
  const tracks = rows.map(track => ({
    name: normalizeText(track?.name),
    artist: extractArtistName(track?.artist) || fallbackArtist,
    url: normalizeText(track?.url) || null
  })).filter(track => track.name && track.artist);

  if (!tracks.length) {
    throw createHttpError("Last.fm did not return a track list for this album", 404);
  }

  return {
    artist: normalizeText(albumData?.artist) || artist,
    album: normalizeText(albumData?.name) || album,
    tracks,
    fetchedAt: Date.now()
  };
}

async function getAlbumTrackList(artist, album, { force = false } = {}) {
  const cacheKey = hashKey("leaderboard-album", normalizeKey(artist), normalizeKey(album));
  const cacheRow = albumCacheGet.get(cacheKey);
  const staleCached = parseCachedPayload(cacheRow, 0);

  if (!force) {
    const cached = parseCachedPayload(cacheRow, ALBUM_TTL_MS);
    if (cached) return cached.value;
  }

  const inFlightKey = `${cacheKey}:${force ? "refresh" : "normal"}`;
  if (albumInFlight.has(inFlightKey)) return albumInFlight.get(inFlightKey);

  const request = fetchAlbumTrackList(artist, album)
    .then(value => {
      albumCacheSet.run(cacheKey, artist, album, JSON.stringify(value), Date.now());
      return value;
    })
    .catch(error => {
      if (!force && staleCached) {
        console.warn(`Using stale album metadata for ${artist} — ${album}:`, error.message);
        return { ...staleCached.value, stale: true };
      }
      throw error;
    })
    .finally(() => albumInFlight.delete(inFlightKey));

  albumInFlight.set(inFlightKey, request);
  return request;
}

async function getLeaderboardItemDetails(groupId, query = {}) {
  const group = getLeaderboardGroup(groupId);
  const range = parseLeaderboardRange(query, { maxDays: MAX_RANGE_DAYS });
  const kind = normalizeText(query.kind).toLocaleLowerCase();
  const name = normalizeText(query.name);
  const artist = normalizeText(query.artist);
  const force = String(query.refresh || "").toLowerCase() === "true" || query.refresh === "1";

  if (!name) throw createHttpError("Item name is required");
  if (!new Set(["artist", "album"]).has(kind)) {
    throw createHttpError("Item kind must be artist or album");
  }
  if (kind === "album" && !artist) throw createHttpError("Album artist is required");

  let acceptedKeys = null;
  const targetArtist = kind === "artist" ? name : artist;
  let canonicalTitle = name;
  let canonicalArtist = targetArtist;

  if (kind === "album") {
    const albumInfo = await getAlbumTrackList(artist, name, { force });
    canonicalTitle = albumInfo.album;
    canonicalArtist = albumInfo.artist;
    acceptedKeys = new Set(albumInfo.tracks.map(track => compoundKey(track.artist, track.name)));
  }

  const charts = await mapWithConcurrency(group.members, REQUEST_CONCURRENCY, async member => {
    try {
      const chart = await getUserChart(member.username, "tracks", range, { force });
      const items = chart.items.filter(item => {
        if (kind === "artist") return normalizeKey(item.artist) === normalizeKey(targetArtist);
        return acceptedKeys.has(compoundKey(item.artist, item.name));
      });

      return {
        ...chart,
        items,
        totalScrobbles: items.reduce((sum, item) => sum + item.playcount, 0),
        profile: member
      };
    } catch (error) {
      return {
        username: member.username,
        profile: member,
        items: [],
        totalScrobbles: 0,
        error: error.message || "Could not load this user"
      };
    }
  });

  const availableCharts = charts.filter(chart => !chart.error);
  if (!availableCharts.length) {
    throw createHttpError("Last.fm did not return track data for any group member", 502);
  }

  const aggregate = aggregateMemberCharts("tracks", charts, RESULT_LIMIT);
  const items = await enrichItems("tracks", aggregate.items);

  return {
    group: { id: group.id, name: group.name },
    kind,
    title: canonicalTitle,
    artist: canonicalArtist,
    range,
    totalScrobbles: aggregate.totalScrobbles,
    members: aggregate.members,
    items,
    partial: availableCharts.length !== charts.length,
    stale: charts.some(chart => chart.stale) || false,
    generatedAt: Date.now()
  };
}

module.exports = {
  createLeaderboardGroup,
  deleteLeaderboardGroup,
  getLeaderboardGroup,
  getLeaderboardItemDetails,
  getLeaderboardResult,
  getUserProfile,
  listLeaderboardGroups,
  updateLeaderboardGroup
};

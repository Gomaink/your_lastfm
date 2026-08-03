const LEADERBOARD_TYPES = new Set(["artists", "albums", "tracks"]);

function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLocaleLowerCase();
}

function compoundKey(artist, name) {
  return `${normalizeKey(artist)}\u0000${normalizeKey(name)}`;
}

function extractArtistName(value) {
  if (typeof value === "string") return normalizeText(value);
  return normalizeText(value?.name || value?.["#text"]);
}

function normalizeLeaderboardType(value) {
  const type = normalizeKey(value || "artists");
  if (!LEADERBOARD_TYPES.has(type)) {
    throw createValidationError("Leaderboard type must be artists, albums, or tracks");
  }
  return type;
}

function normalizeChartItems(typeInput, value) {
  const type = normalizeLeaderboardType(typeInput);
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  const items = [];

  for (const row of rows) {
    const name = normalizeText(row?.name);
    const artist = type === "artists" ? null : extractArtistName(row?.artist);
    const playcount = Math.max(0, Number.parseInt(row?.playcount || "0", 10) || 0);

    if (!name || playcount <= 0 || (type !== "artists" && !artist)) continue;

    items.push({
      key: type === "artists" ? normalizeKey(name) : compoundKey(artist, name),
      name,
      artist,
      playcount,
      url: normalizeText(row?.url) || null,
      mbid: normalizeText(row?.mbid) || null
    });
  }

  return items;
}

function aggregateMemberCharts(typeInput, charts, limit = 20) {
  const type = normalizeLeaderboardType(typeInput);
  const itemMap = new Map();
  const members = [];
  let totalScrobbles = 0;

  for (const chart of charts || []) {
    const username = normalizeText(chart?.username || chart?.profile?.username);
    const profile = chart?.profile || {};
    const error = normalizeText(chart?.error);
    const items = Array.isArray(chart?.items) ? chart.items : [];
    const memberTotal = error
      ? 0
      : Math.max(0, Number(chart?.totalScrobbles) || items.reduce(
        (sum, item) => sum + Math.max(0, Number(item?.playcount) || 0),
        0
      ));

    totalScrobbles += memberTotal;
    members.push({
      username,
      realname: normalizeText(profile.realname) || null,
      avatar: normalizeText(profile.avatar) || null,
      url: normalizeText(profile.url) || null,
      scrobbles: memberTotal,
      error: error || null
    });

    if (error) continue;

    for (const item of items) {
      const playcount = Math.max(0, Number(item?.playcount) || 0);
      if (!item?.key || playcount <= 0) continue;

      let aggregate = itemMap.get(item.key);
      if (!aggregate) {
        aggregate = {
          key: item.key,
          name: normalizeText(item.name),
          artist: normalizeText(item.artist) || null,
          url: normalizeText(item.url) || null,
          mbid: normalizeText(item.mbid) || null,
          plays: 0,
          listeners: 0,
          contributions: []
        };
        itemMap.set(item.key, aggregate);
      }

      aggregate.plays += playcount;
      aggregate.listeners += 1;
      aggregate.contributions.push({ username, plays: playcount });
      if (!aggregate.url && item.url) aggregate.url = item.url;
      if (!aggregate.mbid && item.mbid) aggregate.mbid = item.mbid;
    }
  }

  members.sort((left, right) => (
    right.scrobbles - left.scrobbles
    || left.username.localeCompare(right.username)
  ));

  const items = Array.from(itemMap.values())
    .map(item => ({
      ...item,
      contributions: item.contributions.sort((left, right) => (
        right.plays - left.plays
        || left.username.localeCompare(right.username)
      ))
    }))
    .sort((left, right) => (
      right.plays - left.plays
      || right.listeners - left.listeners
      || left.name.localeCompare(right.name)
    ))
    .slice(0, Math.max(1, Number(limit) || 20));

  return { type, members, items, totalScrobbles };
}

function normalizeGroupInput(payload, options = {}) {
  const name = normalizeText(payload?.name);
  if (!name) throw createValidationError("Group name is required");
  if (name.length > 60) throw createValidationError("Group name must be 60 characters or fewer");

  if (!Array.isArray(payload?.members)) {
    throw createValidationError("Group members must be an array");
  }

  const minMembers = Math.max(1, Number(options.minMembers) || 2);
  const maxMembers = Math.max(minMembers, Number(options.maxMembers) || 20);
  const seen = new Set();
  const members = [];

  for (const member of payload.members) {
    const username = normalizeText(typeof member === "string" ? member : member?.username);
    if (!username) continue;
    if (username.length > 64 || /\s/.test(username)) {
      throw createValidationError(`Invalid Last.fm username: ${username}`);
    }

    const key = normalizeKey(username);
    if (seen.has(key)) continue;
    seen.add(key);
    members.push(username);
  }

  if (members.length < minMembers) {
    throw createValidationError(`A group needs at least ${minMembers} members`);
  }
  if (members.length > maxMembers) {
    throw createValidationError(`A group can have at most ${maxMembers} members`);
  }

  return { name, members };
}

module.exports = {
  aggregateMemberCharts,
  compoundKey,
  extractArtistName,
  normalizeChartItems,
  normalizeGroupInput,
  normalizeKey,
  normalizeLeaderboardType,
  normalizeText
};

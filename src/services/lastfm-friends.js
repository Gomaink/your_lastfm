require("dotenv").config();

const axios = require("axios");

const {
  ensureAlbumCover,
  getCachedAlbumCover,
  rememberAlbumCover
} = require("./albumCoverCache");
const {
  ensureArtistImage,
  getCachedArtistImage,
  rememberArtistImage
} = require("./artistImageCache");
const {
  ensureTrackCover,
  getCachedTrackCover,
  rememberTrackCover
} = require("./trackCoverCache");
const { fetchWithRetry } = require("../utils/fetchRetry");
const { toImageProxyUrl } = require("./remoteImageCache");
const { getLastFmImage } = require("../utils/lastfmImage");
const { assertLastFmResponse } = require("../utils/lastfmResponse");
const { mapWithConcurrency } = require("../utils/mapWithConcurrency");
const { sanitizeError } = require("../utils/sanitizeAxios");

const API_KEY = process.env.LASTFM_API_KEY;
const MAIN_USER = process.env.LASTFM_USERNAME;
const BASE_URL = "https://ws.audioscrobbler.com/2.0/";
const AVATAR_PLACEHOLDER = "/images/artist-placeholder.png";
const COVER_PLACEHOLDER = "/images/cover-placeholder.svg";
const REQUEST_TIMEOUT = Number(process.env.LASTFM_REQUEST_TIMEOUT_MS || 15000);
const IMAGE_CONCURRENCY = Math.max(1, Number(process.env.EXTERNAL_REQUEST_CONCURRENCY || 4));
const FRIENDS_CACHE_TTL_MS = Math.max(30000, Number(process.env.FRIENDS_CACHE_TTL_MS) || 5 * 60 * 1000);

const normalize = value => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const normalizeKey = value => String(value || "").trim().toLocaleLowerCase();
const compoundKey = (name, artist) => `${normalizeKey(name)}\u0000${normalizeKey(artist)}`;

let friendsCache = null;
let friendsCacheExpiresAt = 0;
let friendsInFlight = null;

async function lastFmRequest(params) {
  return fetchWithRetry(async () => {
    const response = await axios.get(BASE_URL, {
      timeout: REQUEST_TIMEOUT,
      params: {
        api_key: API_KEY,
        format: "json",
        ...params
      }
    });
    assertLastFmResponse(response.data);
    return response;
  });
}

async function findBestImage(type, name, artistName, apiImages) {
  try {
    const apiImage = getLastFmImage(apiImages);

    if (type === "artist") {
      const cached = getCachedArtistImage(name);
      if (cached) return cached;
      if (apiImage) return rememberArtistImage(name, apiImage) || apiImage;
      return await ensureArtistImage(name) || COVER_PLACEHOLDER;
    }

    if (type === "album") {
      const cached = getCachedAlbumCover(artistName, name);
      if (cached) return cached;
      if (apiImage) return rememberAlbumCover(artistName, name, apiImage) || apiImage;
      return await ensureAlbumCover(artistName, name) || COVER_PLACEHOLDER;
    }

    const cached = getCachedTrackCover(artistName, name);
    if (cached.image) return cached.image;
    if (apiImage) {
      return rememberTrackCover(artistName, name, cached.album, apiImage) || apiImage;
    }

    return await ensureTrackCover(artistName, name) || COVER_PLACEHOLDER;
  } catch (error) {
    console.warn(`Image lookup failed (${type}: ${name}):`, error.message);
    return COVER_PLACEHOLDER;
  }
}

function calculateCompatibilityScore(commonArtists, commonAlbums, commonTracks) {
  const artistScore = Math.min(50, (commonArtists.length / 10) * 50);
  const albumScore = Math.min(30, (commonAlbums.length / 5) * 30);
  const trackScore = Math.min(20, (commonTracks.length / 5) * 20);
  const bonus = commonArtists.length > 20 ? 5 : 0;

  return Math.round(Math.min(100, artistScore + albumScore + trackScore + bonus));
}

function getLocalListeningMaps(db) {
  const artists = db.prepare(`
    SELECT artist, COUNT(*) AS plays
    FROM scrobbles
    GROUP BY artist
  `).all();

  const albums = db.prepare(`
    SELECT album, artist, COUNT(*) AS plays
    FROM scrobbles
    WHERE album IS NOT NULL AND TRIM(album) != ''
    GROUP BY album, artist
  `).all();

  const tracks = db.prepare(`
    SELECT track, artist, COUNT(*) AS plays
    FROM scrobbles
    GROUP BY track, artist
  `).all();

  const accumulate = (rows, getKey) => {
    const result = new Map();

    for (const item of rows) {
      const key = getKey(item);
      result.set(key, (result.get(key) || 0) + Number(item.plays || 0));
    }

    return result;
  };

  return {
    artists: accumulate(artists, item => normalizeKey(item.artist)),
    albums: accumulate(albums, item => compoundKey(item.album, item.artist)),
    tracks: accumulate(tracks, item => compoundKey(item.track, item.artist))
  };
}

async function fetchFriendsList(limit) {
  const response = await lastFmRequest({
    method: "user.getFriends",
    user: MAIN_USER,
    limit
  });

  return normalize(response.data?.friends?.user).map(friend => ({
    name: String(friend.name || "").trim(),
    realname: String(friend.realname || "").trim() || null,
    avatar: toImageProxyUrl(getLastFmImage(friend.image)) || AVATAR_PLACEHOLDER,
    playcount: Number.parseInt(friend.playcount || "0", 10),
    url: friend.url || null
  })).filter(friend => friend.name);
}

async function getFriendsList(limit = 50) {
  if (friendsCache && friendsCacheExpiresAt > Date.now()) return friendsCache;
  if (friendsInFlight) return friendsInFlight;

  friendsInFlight = fetchFriendsList(limit)
    .then(friends => {
      friendsCache = friends;
      friendsCacheExpiresAt = Date.now() + FRIENDS_CACHE_TTL_MS;
      return friends;
    })
    .finally(() => {
      friendsInFlight = null;
    });

  return friendsInFlight;
}

async function resolveCommonImages(rawCommonArtists, rawCommonAlbums, rawCommonTracks) {
  const tasks = [
    ...rawCommonArtists.slice(0, 5).map(item => ({ type: "artist", item })),
    ...rawCommonAlbums.slice(0, 5).map(item => ({ type: "album", item })),
    ...rawCommonTracks.slice(0, 5).map(item => ({ type: "track", item }))
  ];

  const resolved = await mapWithConcurrency(tasks, IMAGE_CONCURRENCY, async task => {
    const { type, item } = task;
    const artist = type === "artist" ? null : item.artist;

    return {
      type,
      value: {
        name: item.source.name,
        ...(artist ? { artist } : {}),
        myPlays: item.myPlays,
        friendPlays: Number.parseInt(item.source.playcount || "0", 10),
        image: toImageProxyUrl(await findBestImage(type, item.source.name, artist, item.source.image))
      }
    };
  });

  return {
    commonArtists: resolved.filter(item => item.type === "artist").map(item => item.value),
    commonAlbums: resolved.filter(item => item.type === "album").map(item => item.value),
    commonTracks: resolved.filter(item => item.type === "track").map(item => item.value)
  };
}

async function compareWithFriend(db, friendUsername) {
  try {
    const user = String(friendUsername || "").trim();
    if (!user) return { error: true, message: "Invalid Last.fm username." };

    const params = { user, limit: 50, period: "overall" };
    const [infoRes, artistsRes, albumsRes, tracksRes] = await Promise.all([
      lastFmRequest({ user, method: "user.getInfo" }),
      lastFmRequest({ ...params, method: "user.getTopArtists" }),
      lastFmRequest({ ...params, method: "user.getTopAlbums" }),
      lastFmRequest({ ...params, method: "user.getTopTracks" })
    ]);

    const friendData = infoRes.data?.user;
    if (!friendData) return { error: true, message: "Last.fm user not found." };

    const friendArtists = normalize(artistsRes.data?.topartists?.artist);
    const friendAlbums = normalize(albumsRes.data?.topalbums?.album);
    const friendTracks = normalize(tracksRes.data?.toptracks?.track);
    const localMaps = getLocalListeningMaps(db);

    const rawCommonArtists = friendArtists
      .map(item => ({
        source: item,
        myPlays: localMaps.artists.get(normalizeKey(item.name)) || 0
      }))
      .filter(item => item.myPlays > 0)
      .sort((a, b) => b.myPlays - a.myPlays);

    const rawCommonAlbums = friendAlbums
      .map(item => ({
        source: item,
        artist: item.artist?.name || item.artist?.["#text"] || "",
        myPlays: localMaps.albums.get(compoundKey(
          item.name,
          item.artist?.name || item.artist?.["#text"]
        )) || 0
      }))
      .filter(item => item.myPlays > 0)
      .sort((a, b) => b.myPlays - a.myPlays);

    const rawCommonTracks = friendTracks
      .map(item => ({
        source: item,
        artist: item.artist?.name || item.artist?.["#text"] || "",
        myPlays: localMaps.tracks.get(compoundKey(
          item.name,
          item.artist?.name || item.artist?.["#text"]
        )) || 0
      }))
      .filter(item => item.myPlays > 0)
      .sort((a, b) => b.myPlays - a.myPlays);

    const { commonArtists, commonAlbums, commonTracks } = await resolveCommonImages(
      rawCommonArtists,
      rawCommonAlbums,
      rawCommonTracks
    );

    const myStats = db.prepare(`
      SELECT
        COUNT(*) AS scrobbles,
        (
          SELECT COUNT(*)
          FROM (
            SELECT artist, album
            FROM scrobbles
            WHERE album IS NOT NULL AND TRIM(album) != ''
            GROUP BY artist, album
          )
        ) AS albumsCount
      FROM scrobbles
    `).get();

    const friendTotalAlbums = Number.parseInt(
      albumsRes.data?.topalbums?.["@attr"]?.total || "0",
      10
    );

    return {
      user: {
        username: "You",
        scrobbles: myStats.scrobbles,
        albumsCount: myStats.albumsCount
      },
      friend: {
        username: friendData.name,
        avatar: toImageProxyUrl(getLastFmImage(friendData.image)) || AVATAR_PLACEHOLDER,
        scrobbles: Number.parseInt(friendData.playcount || "0", 10),
        albumsCount: friendTotalAlbums,
        url: friendData.url
      },
      compatibilityScore: calculateCompatibilityScore(
        rawCommonArtists,
        rawCommonAlbums,
        rawCommonTracks
      ),
      commonArtists,
      commonAlbums,
      commonTracks
    };
  } catch (error) {
    console.error("compareWithFriend error:", sanitizeError(error));
    return { error: true, message: "Error comparing profiles. Please try again." };
  }
}

module.exports = { getFriendsList, compareWithFriend };

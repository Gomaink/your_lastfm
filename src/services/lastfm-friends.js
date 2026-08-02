require("dotenv").config();

const axios = require("axios");

const { getDeezerAlbumImage } = require("./deezer-album");
const { fetchArtistImage } = require("./deezerArtistImage");
const { fetchWithRetry } = require("../utils/fetchRetry");
const { assertLastFmResponse } = require("../utils/lastfmResponse");
const { mapWithConcurrency } = require("../utils/mapWithConcurrency");
const { sanitizeError } = require("../utils/sanitizeAxios");

const API_KEY = process.env.LASTFM_API_KEY;
const MAIN_USER = process.env.LASTFM_USERNAME;
const BASE_URL = "https://ws.audioscrobbler.com/2.0/";
const PLACEHOLDER_IMG = "/images/artist-placeholder.png";
const REQUEST_TIMEOUT = Number(process.env.LASTFM_REQUEST_TIMEOUT_MS || 15000);
const IMAGE_CONCURRENCY = Number(process.env.EXTERNAL_REQUEST_CONCURRENCY || 4);

const normalize = value => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const normalizeKey = value => String(value || "").trim().toLocaleLowerCase();
const compoundKey = (name, artist) => `${normalizeKey(name)}\u0000${normalizeKey(artist)}`;

const getApiImage = imageArray => {
  if (!Array.isArray(imageArray)) return null;

  for (let index = imageArray.length - 1; index >= 0; index--) {
    const image = imageArray[index]?.["#text"]?.trim();
    if (image) return image;
  }

  return null;
};

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

async function findBestImage(db, type, name, artistName, apiImageArray) {
  try {
    if (type === "artist") {
      const cachedArtist = db.prepare(`
        SELECT artist_image
        FROM artists
        WHERE lower(artist) = lower(?)
      `).get(name)?.artist_image;

      if (cachedArtist) return cachedArtist;
    } else {
      const field = type === "album" ? "album" : "track";
      const localImage = db.prepare(`
        SELECT MAX(NULLIF(album_image, '')) AS album_image
        FROM scrobbles
        WHERE lower(${field}) = lower(?)
          AND lower(artist) = lower(?)
      `).get(name, artistName)?.album_image;

      if (localImage) return localImage;
    }

    const apiImage = getApiImage(apiImageArray);
    if (apiImage) return apiImage;

    if (type === "artist") {
      return await fetchArtistImage(name) || PLACEHOLDER_IMG;
    }

    return await getDeezerAlbumImage(artistName, name) || PLACEHOLDER_IMG;
  } catch (error) {
    console.warn(`Image lookup failed (${type}: ${name}):`, error.message);
    return PLACEHOLDER_IMG;
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

  return {
    artists: new Map(artists.map(item => [normalizeKey(item.artist), item.plays])),
    albums: new Map(albums.map(item => [compoundKey(item.album, item.artist), item.plays])),
    tracks: new Map(tracks.map(item => [compoundKey(item.track, item.artist), item.plays]))
  };
}

async function getFriendsList(limit = 50) {
  const response = await lastFmRequest({
    method: "user.getFriends",
    user: MAIN_USER,
    limit
  });

  return normalize(response.data?.friends?.user);
}

async function compareWithFriend(db, friendUsername) {
  try {
    const user = String(friendUsername || "").trim();
    if (!user) return { error: true, message: "Invalid Last.fm username." };

    const params = { user, limit: 50 };
    const [infoRes, artistsRes, albumsRes, tracksRes] = await Promise.all([
      lastFmRequest({ ...params, method: "user.getInfo" }),
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

    const [commonArtists, commonAlbums, commonTracks] = await Promise.all([
      mapWithConcurrency(rawCommonArtists.slice(0, 5), IMAGE_CONCURRENCY, async item => ({
        name: item.source.name,
        myPlays: item.myPlays,
        friendPlays: Number.parseInt(item.source.playcount || "0", 10),
        image: await findBestImage(db, "artist", item.source.name, null, item.source.image)
      })),
      mapWithConcurrency(rawCommonAlbums.slice(0, 5), IMAGE_CONCURRENCY, async item => ({
        name: item.source.name,
        artist: item.artist,
        myPlays: item.myPlays,
        friendPlays: Number.parseInt(item.source.playcount || "0", 10),
        image: await findBestImage(db, "album", item.source.name, item.artist, item.source.image)
      })),
      mapWithConcurrency(rawCommonTracks.slice(0, 5), IMAGE_CONCURRENCY, async item => ({
        name: item.source.name,
        artist: item.artist,
        myPlays: item.myPlays,
        friendPlays: Number.parseInt(item.source.playcount || "0", 10),
        image: await findBestImage(db, "track", item.source.name, item.artist, item.source.image)
      }))
    ]);

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
        avatar: getApiImage(friendData.image) || PLACEHOLDER_IMG,
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

const axios = require("axios");
require("dotenv").config();

const { fetchWithRetry } = require("../utils/fetchRetry");
const { assertLastFmResponse } = require("../utils/lastfmResponse");
const { getLastFmImage } = require("../utils/lastfmImage");

const LASTFM_URL = "https://ws.audioscrobbler.com/2.0/";
const REQUEST_TIMEOUT = Number(process.env.LASTFM_REQUEST_TIMEOUT_MS || 15000);
const RESPONSE_CACHE_TTL_MS = 60 * 1000;

const responseCache = new Map();
const inFlight = new Map();

const requestKey = (artist, track) => (
  `${String(artist || "").trim().toLocaleLowerCase()}\u0000${String(track || "").trim().toLocaleLowerCase()}`
);

async function fetchTrackInfo(artist, track) {
  const response = await fetchWithRetry(async () => {
    const result = await axios.get(LASTFM_URL, {
      timeout: REQUEST_TIMEOUT,
      params: {
        method: "track.getInfo",
        api_key: process.env.LASTFM_API_KEY,
        artist,
        track,
        autocorrect: 1,
        format: "json"
      }
    });
    assertLastFmResponse(result.data);
    return result;
  });

  return response.data?.track || null;
}

async function getTrackInfo(artist, track) {
  if (!artist || !track) return null;

  const key = requestKey(artist, track);
  const cached = responseCache.get(key);
  if (cached?.expiresAt > Date.now()) return cached.value;
  if (inFlight.has(key)) return inFlight.get(key);

  const request = fetchTrackInfo(artist, track)
    .then(value => {
      responseCache.set(key, {
        value,
        expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS
      });
      return value;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(key));

  inFlight.set(key, request);
  return request;
}

async function getTrackDuration(artist, track) {
  const info = await getTrackInfo(artist, track);
  const durationMs = Number(info?.duration);
  if (!durationMs || durationMs <= 0) return null;
  return Math.round(durationMs / 1000);
}

async function getTrackCoverInfo(artist, track) {
  const info = await getTrackInfo(artist, track);
  if (!info) return { album: null, image: null };

  return {
    album: String(info.album?.title || "").trim() || null,
    image: getLastFmImage(info.album?.image)
  };
}

module.exports = { getTrackCoverInfo, getTrackDuration, getTrackInfo };

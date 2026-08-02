const axios = require("axios");
require("dotenv").config();

const { fetchWithRetry } = require("../utils/fetchRetry");
const { assertLastFmResponse } = require("../utils/lastfmResponse");

const REQUEST_TIMEOUT = Number(process.env.LASTFM_REQUEST_TIMEOUT_MS || 15000);
const CACHE_TTL_MS = 10 * 60 * 1000;
const FAILURE_TTL_MS = 60 * 1000;

let cachedUser = null;
let cacheExpiresAt = 0;
let inFlight = null;

async function fetchLastFmUserInfo() {
  const response = await fetchWithRetry(async () => {
    const result = await axios.get("https://ws.audioscrobbler.com/2.0/", {
      timeout: REQUEST_TIMEOUT,
      params: {
        method: "user.getInfo",
        user: process.env.LASTFM_USERNAME,
        api_key: process.env.LASTFM_API_KEY,
        format: "json"
      }
    });
    assertLastFmResponse(result.data);
    return result;
  });

  const user = response.data?.user;
  if (!user) throw new Error("Last.fm user not found");

  const images = Array.isArray(user.image) ? user.image : [];
  const avatarObj = images.find(image => image.size === "extralarge")
    || images.find(image => image.size === "large");

  return {
    name: user.name || process.env.LASTFM_USERNAME || "User",
    avatar: avatarObj?.["#text"] || null
  };
}

async function getLastFmUserInfo() {
  if (cachedUser && cacheExpiresAt > Date.now()) return cachedUser;
  if (inFlight) return inFlight;

  inFlight = fetchLastFmUserInfo()
    .then(user => {
      cachedUser = user;
      cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      return user;
    })
    .catch(error => {
      console.warn("Error getting data from Last.fm:", error.message);
      cacheExpiresAt = Date.now() + FAILURE_TTL_MS;
      cachedUser ||= {
        name: process.env.LASTFM_USERNAME || "User",
        avatar: null
      };
      return cachedUser;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

module.exports = { getLastFmUserInfo };

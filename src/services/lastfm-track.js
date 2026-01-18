const axios = require("axios");
require("dotenv").config();

const LASTFM_URL = "https://ws.audioscrobbler.com/2.0/";

async function getTrackDuration(artist, track) {
  try {
    const { data } = await axios.get(LASTFM_URL, {
      params: {
        method: "track.getInfo",
        api_key: process.env.LASTFM_API_KEY,
        artist,
        track,
        format: "json"
      }
    });

    const durationMs = Number(data?.track?.duration);

    if (!durationMs || durationMs <= 0) {
      //console.log(`[Last.fm] No duration: ${artist} - ${track}`);
      return null;
    }

    const seconds = Math.round(durationMs / 1000);

    //console.log(`[Last.fm] Duration ${artist} - ${track}: ${seconds}s`);
    return seconds;

  } catch (err) {
    //console.error(`[Last.fm] Duration error ${artist} - ${track}`);
    return null;
  }
}

module.exports = { getTrackDuration };

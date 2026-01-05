require("dotenv").config();
const axios = require("axios");
const db = require("./db");

const CONFIG = {
  API_URL: "https://ws.audioscrobbler.com/2.0/",         
  RETRY_DELAY: 3000,       
  REQUEST_DELAY: 300,     
  PER_PAGE: 200
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const insertScrobble = db.prepare(`
  INSERT OR IGNORE INTO scrobbles (artist, track, album, played_at)
  VALUES (?, ?, ?, ?)
`);

const getLastPlayedAt = db.prepare(`
  SELECT MAX(played_at) as last FROM scrobbles
`);

const runSyncTransaction = db.transaction((tracks) => {
  let count = 0;
  for (const track of tracks) {
    if (!track.date) continue;

    const result = insertScrobble.run(
      track.artist["#text"],
      track.name,
      track.album["#text"] || null,
      Number(track.date.uts)
    );
    if (result.changes > 0) count++;
  }
  return count;
});

async function fetchLastfmPage(page, retries = 3) {
  try {
    const { data } = await axios.get(CONFIG.API_URL, {
      timeout: 10000,
      params: {
        method: "user.getrecenttracks",
        user: process.env.LASTFM_USERNAME,
        api_key: process.env.LASTFM_API_KEY,
        format: "json",
        limit: CONFIG.PER_PAGE,
        page
      }
    });

    if (data.error) throw new Error(data.message);
    return data.recenttracks;

  } catch (err) {
    if (retries > 0) {
      console.warn(`⚠️ Error on page ${page}. Retrying in ${CONFIG.RETRY_DELAY / 1000}s...`);
      await sleep(CONFIG.RETRY_DELAY);
      return fetchLastfmPage(page, retries - 1);
    }
    throw err;
  }
}

async function sync() {
  console.log("🔄 Starting incremental sync with Last.fm...");

  const row = getLastPlayedAt.get();
  const lastPlayedAt = row?.last || 0;

  if (lastPlayedAt === 0) {
    console.log("🆕 Empty database, running full sync...");
  } else {
    console.log(
      `⏱️ Last scrobble in DB: ${new Date(lastPlayedAt * 1000).toISOString()}`
    );
  }

  let page = 1;
  let totalInserted = 0;
  let shouldStop = false;

  try {
    while (!shouldStop) {
      console.log(`📥 Fetching page ${page}...`);

      const data = await fetchLastfmPage(page);
      const tracks = data.track || [];

      if (tracks.length === 0) break;

      const newTracks = [];

      for (const track of tracks) {
        if (!track.date) continue;

        const playedAt = Number(track.date.uts);

        if (playedAt <= lastPlayedAt) {
          shouldStop = true;
          break;
        }

        newTracks.push(track);
      }

      const inserted = runSyncTransaction(newTracks);
      totalInserted += inserted;

      console.log(`✅ Page ${page}: +${inserted} new scrobbles`);

      if (shouldStop) {
        console.log("🛑 Reached already synced scrobbles, stopping.");
        break;
      }

      page++;
      await sleep(CONFIG.REQUEST_DELAY);
    }

    console.log(`✨ Sync finished — ${totalInserted} new scrobbles added.`);
  } catch (err) {
    console.error("❌ Sync failed:", err.message);
  }
}


sync();
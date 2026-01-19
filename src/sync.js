require("dotenv").config();
const axios = require("axios");
const db = require("./db");
const { fetchWithRetry } = require("./utils/fetchRetry");
const { sanitizeAxiosConfig } = require("./utils/sanitizeAxios");

const CONFIG = {
  API_URL: "https://ws.audioscrobbler.com/2.0/",
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

async function fetchLastfmPage(page) {
  try {
    const response = await fetchWithRetry(() =>
      axios.get(CONFIG.API_URL, {
        timeout: 10000,
        params: {
          method: "user.getrecenttracks",
          user: process.env.LASTFM_USERNAME,
          api_key: process.env.LASTFM_API_KEY,
          format: "json",
          limit: CONFIG.PER_PAGE,
          page
        }
      })
    );

    const data = response.data;

    if (data.error) {
      throw new Error(`[Last.fm] ${data.message}`);
    }

    return data.recenttracks;

  } catch (err) {
    console.error(
      "[Last.fm sync error]",
      sanitizeAxiosConfig(err.config)
    );
    throw err;
  }
}

async function getTotalPages() {
  const data = await fetchLastfmPage(1);
  const totalPages = parseInt(data["@attr"]?.totalPages || 1);
  return totalPages;
}


async function sync(options = {}) {
  const isFullSync = options.full === true;

  console.log(
    isFullSync
      ? "🔄 Starting FULL sync with Last.fm..."
      : "🔄 Starting incremental sync with Last.fm..."
  );

  const row = getLastPlayedAt.get();
  const lastPlayedAt = isFullSync ? 0 : (row?.last || 0);

  // Get total pages
  const totalPages = await getTotalPages();

  let page = 1;
  let shouldStop = false;
  let totalInserted = 0;

  while (!shouldStop) {
    const data = await fetchLastfmPage(page);
    const tracks = data.track || [];

    if (!tracks.length) {
      break;
    }

    const newTracks = [];

    for (const track of tracks) {
      if (!track.date) continue;
      const playedAt = Number(track.date.uts);
      if (!isFullSync && playedAt <= lastPlayedAt) {
        shouldStop = true;
        break;
      }
      newTracks.push(track);
    }

    const inserted = runSyncTransaction(newTracks);
    totalInserted += inserted;

    // Show progress every 10 pages
    if (page % 10 === 0 || page === totalPages) {
      const percent = Math.round((page / totalPages) * 100);
      console.log(`[${page}/${totalPages}] ${percent}%`);
    }

    page++;

    await sleep(CONFIG.REQUEST_DELAY);
  }

  console.log(`✨ Sync finished - Total new scrobbles: ${totalInserted}`);
}

module.exports = { sync };

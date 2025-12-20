require("dotenv").config();
const axios = require("axios");
const db = require("./db");

const CONFIG = {
  API_URL: "https://ws.audioscrobbler.com/2.0/",         
  RETRY_DELAY: 3000,       
  REQUEST_DELAY: 1200,     
  PER_PAGE: 200
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const insertScrobble = db.prepare(`
  INSERT OR IGNORE INTO scrobbles (artist, track, album, played_at)
  VALUES (?, ?, ?, ?)
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

async function sync(page_limit = 0) {
  console.log("🚀 Starting full synchronization with Last.fm...");
  
  let page = 1;
  let totalPages = 1;
  let totalInserted = 0;

  try {
    do {
      console.log(`📥 Downloading page ${page} of ${totalPages || '?' }...`);
      const data = await fetchLastfmPage(page);
      
      totalPages = Number(data["@attr"].totalPages);
      const tracks = data.track || [];

      const insertedInPage = runSyncTransaction(tracks);
      totalInserted += insertedInPage;

      console.log(`✅ Page ${page} processed. (+${insertedInPage} new | Total: ${totalInserted})`);

      if (page_limit !== 0 && page >= page_limit) break;

      page++;
      await sleep(CONFIG.REQUEST_DELAY);

    } while (page <= totalPages);

    console.log(`\n✨ Sync finished! ${totalInserted} new scrobbles added to the database.`);
  } catch (err) {
    console.error("\n❌ Critical sync failure:", err.message);
  }
}

sync();
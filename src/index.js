require("dotenv").config();
const db = require("./db");
const { getRecentTracks } = require("./lastfm");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const insert = db.prepare(`
  INSERT OR IGNORE INTO scrobbles
  (artist, track, album, played_at)
  VALUES (?, ?, ?, ?)
`);

async function sync() {
  let page = 1;
  let totalPages = 1;
  let inserted = 0;

  console.log("Iniciando sync...");

  do {
    console.log(`Página ${page}`);

    const data = await getRecentTracks(page);
    totalPages = Number(data["@attr"].totalPages);

    for (const track of data.track) {
      if (!track.date) continue;

      const res = insert.run(
        track.artist["#text"],
        track.name,
        track.album["#text"] || null,
        Number(track.date.uts)
      );

      if (res.changes) inserted++;
    }

    page++;
    await sleep(1200);
  } while (page <= totalPages && page <= 5);

  console.log(`Sync OK — ${inserted} novos scrobbles`);
}

sync().catch(err => {
  console.error("Falha no sync:", err.message);
});

import { fetchJSON } from "./api.js";
import { buildQuery } from "./filters.js";
import { renderCover, initCoverUploads } from "./coverUploader.js";
import { escapeHTML } from "./dom.js";

function formatDuration(totalSeconds) {
  const secondsValue = Number(totalSeconds) || 0;
  const hours = Math.floor(secondsValue / 3600);
  const minutes = Math.floor((secondsValue % 3600) / 60);
  const seconds = secondsValue % 60;

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export async function loadTopSongs() {
  const data = await fetchJSON("/api/top-tracks" + buildQuery());
  const container = document.getElementById("top-songs");

  container.innerHTML = data.map((row, index) => `
    <div class="top-song-row">
      <span class="song-position">${index + 1}</span>
      <div class="song-main">
        ${renderCover({
          image: row.album_image,
          artist: row.artist,
          album: row.album
        })}
        <div>
          <div class="song-title">${escapeHTML(row.track)}</div>
          <div class="song-artist">${escapeHTML(row.artist)}</div>
        </div>
      </div>
      <span>${Number(row.plays).toLocaleString()}</span>
      <span>${formatDuration(row.total_seconds)}</span>
    </div>
  `).join("");

  initCoverUploads();
}

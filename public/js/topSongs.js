import { buildQuery } from "./filters.js";
import { renderCover, initCoverUploads } from "./coverUploader.js";

export async function loadTopSongs() {
  const res = await fetch("/api/top-tracks" + buildQuery());
  const data = await res.json();

  const container = document.getElementById("top-songs");
  container.innerHTML = "";

  data.forEach((row, i) => {
    const totalSec = row.total_seconds;
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    const time = hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${minutes}:${String(seconds).padStart(2, "0")}`;

    container.innerHTML += `
      <div class="top-song-row">
        <span class="song-position">${i + 1}</span>

        <div class="song-main">
          ${renderCover({
            image: row.album_image,
            artist: row.artist,
            album: row.album
          })}

          <div>
            <div class="song-title">${row.track}</div>
            <div class="song-artist">${row.artist}</div>
          </div>
        </div>

        <span>${row.plays}</span>
        <span>${time}</span>
      </div>
    `;
  });

  initCoverUploads();
}

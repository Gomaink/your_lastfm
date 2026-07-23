import { fetchJSON } from "./api.js";
import { buildQuery } from "./filters.js";

const PLACEHOLDER = "https://www.beatstars.com/assets/img/placeholders/playlist-placeholder.svg";

export async function showAlbumModal({ album, artist, image, plays }) {
  document.getElementById("album-modal-title").textContent = album;
  document.getElementById("album-modal-artist").textContent = artist;
  document.getElementById("album-modal-plays").textContent = `${plays} plays`;

  const img = document.getElementById("album-modal-image");
  img.src = image || PLACEHOLDER;
  img.alt = album;

  const tracksEl = document.getElementById("album-modal-tracks");
  tracksEl.innerHTML = "";

  const modalEl = document.getElementById("album-cover-modal");
  bootstrap.Modal.getOrCreateInstance(modalEl).show();

  const tracks = await fetchJSON("/api/album-tracks" + buildQuery(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ artist, album })
  });

  if (!tracks.length) {
    tracksEl.innerHTML = `<div class="album-modal-tracks-empty">No tracks found</div>`;
    return;
  }

  tracksEl.innerHTML = tracks.map((t, i) => `
    <div class="track-row">
      <span class="track-position">${i + 1}</span>
      <span class="track-name">${t.track}</span>
      <span class="track-plays">${t.plays} plays</span>
    </div>
  `).join("");
}

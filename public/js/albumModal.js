import { fetchJSON } from "./api.js";
import { buildQuery } from "./filters.js";
import { escapeHTML, safeImageUrl } from "./dom.js";

const PLACEHOLDER = "https://www.beatstars.com/assets/img/placeholders/playlist-placeholder.svg";
let requestId = 0;

export async function showAlbumModal({ album, artist, image, plays }) {
  const currentRequest = ++requestId;
  document.getElementById("album-modal-title").textContent = album;
  document.getElementById("album-modal-artist").textContent = artist;
  document.getElementById("album-modal-plays").textContent = `${plays} plays`;

  const imageElement = document.getElementById("album-modal-image");
  imageElement.src = safeImageUrl(image, PLACEHOLDER);
  imageElement.alt = album;

  const tracksElement = document.getElementById("album-modal-tracks");
  tracksElement.innerHTML = '<div class="album-modal-tracks-empty">Loading tracks...</div>';

  const modalElement = document.getElementById("album-cover-modal");
  bootstrap.Modal.getOrCreateInstance(modalElement).show();

  try {
    const tracks = await fetchJSON("/api/album-tracks" + buildQuery(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artist, album })
    });

    if (currentRequest !== requestId) return;

    if (!tracks.length) {
      tracksElement.innerHTML = '<div class="album-modal-tracks-empty">No tracks found</div>';
      return;
    }

    tracksElement.innerHTML = tracks.map((track, index) => `
      <div class="track-row">
        <span class="track-position">${index + 1}</span>
        <span class="track-name">${escapeHTML(track.track)}</span>
        <span class="track-plays">${Number(track.plays).toLocaleString()} plays</span>
      </div>
    `).join("");
  } catch (error) {
    if (currentRequest !== requestId) return;
    tracksElement.innerHTML = `<div class="album-modal-tracks-empty">${escapeHTML(error.message)}</div>`;
  }
}

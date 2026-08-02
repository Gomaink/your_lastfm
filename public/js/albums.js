import { fetchJSON } from "./api.js";
import { buildQuery } from "./filters.js";
import { renderCover, initCoverUploads } from "./coverUploader.js";
import { showAlbumModal } from "./albumModal.js";
import { escapeAttribute, escapeHTML } from "./dom.js";

export function renderAlbums(albums = []) {
  const grid = document.getElementById("albums-grid");
  const fragment = document.createDocumentFragment();

  grid.innerHTML = "";

  for (const album of albums) {
    const card = document.createElement("div");
    card.className = "album-card";
    card.innerHTML = `
      ${renderCover({
        image: album.album_image,
        artist: album.artist,
        album: album.album,
        size: "large"
      })}
      <a
        class="music-link album-title-link"
        href="${escapeAttribute(album.url || "#")}"
        target="_blank"
        rel="noopener noreferrer"
        title="Open album on Last.fm"
      >
        <strong>${escapeHTML(album.album)}</strong>
        <i class="mdi mdi-open-in-new"></i>
      </a>
      <a
        class="music-link album-artist-link"
        href="${escapeAttribute(album.artist_url || "#")}"
        target="_blank"
        rel="noopener noreferrer"
        title="Open artist on Last.fm"
      >${escapeHTML(album.artist)}</a>
      <small>${Number(album.plays).toLocaleString()} plays</small>
    `;

    card.querySelector(".cover-wrapper")?.addEventListener("click", event => {
      if (event.target.matches("input, .cover-overlay, .cover-overlay *")) return;

      showAlbumModal({
        album: album.album,
        artist: album.artist,
        image: album.album_image,
        plays: album.plays
      });
    });

    fragment.appendChild(card);
  }

  grid.appendChild(fragment);
  initCoverUploads();
}

export async function loadAlbums() {
  const albums = await fetchJSON("/api/top-albums" + buildQuery());
  renderAlbums(albums);
}

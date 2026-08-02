import { fetchJSON } from "./api.js";
import { buildQuery } from "./filters.js";
import { renderCover, initCoverUploads } from "./coverUploader.js";
import { showAlbumModal } from "./albumModal.js";

export async function loadAlbums() {
  const albums = await fetchJSON("/api/top-albums" + buildQuery());
  const grid = document.getElementById("albums-grid");

  grid.innerHTML = "";

  for (const a of albums) {
    const div = document.createElement("div");
    div.className = "album-card";

    div.innerHTML = `
      ${renderCover({
        image: a.album_image,
        artist: a.artist,
        album: a.album,
        size: "large"
      })}
      <strong>${a.album}</strong>
      <span>${a.artist}</span>
      <small>${a.plays} plays</small>
    `;

    div.querySelector(".cover-wrapper").addEventListener("click", () => {
      showAlbumModal({
        album: a.album,
        artist: a.artist,
        image: a.album_image,
        plays: a.plays
      });
    });

    grid.appendChild(div);
  }

  initCoverUploads();
}

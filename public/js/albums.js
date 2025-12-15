import { fetchJSON } from "./api.js";

export async function loadAlbums() {
  const albums = await fetchJSON("/api/top-albums");
  const grid = document.getElementById("albums-grid");

  grid.innerHTML = "";

  for (const a of albums) {
    const div = document.createElement("div");
    div.className = "album-card";

    div.innerHTML = `
      <img src="${a.album_image || 'https://via.placeholder.com/300'}">
      <strong>${a.album}</strong>
      <span>${a.artist}</span>
      <small>${a.plays} plays</small>
    `;

    grid.appendChild(div);
  }
}

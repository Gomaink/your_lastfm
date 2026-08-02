import { fetchJSON } from "./api.js";
import { buildQuery } from "./filters.js";
import { escapeAttribute, escapeHTML, safeImageUrl } from "./dom.js";

export async function loadTopArtists() {
  const data = await fetchJSON("/api/top-artists" + buildQuery());
  const container = document.getElementById("top-artists");

  container.innerHTML = data.map((artist, index) => `
    <div class="top-row">
      <span class="rank">${index + 1}</span>
      <img
        src="${escapeAttribute(safeImageUrl(artist.image))}"
        alt="${escapeAttribute(artist.artist)}"
        class="cover artist"
        loading="lazy"
      />
      <div class="meta">
        <strong>${escapeHTML(artist.artist)}</strong>
        <small>${Number(artist.plays).toLocaleString()} plays</small>
      </div>
    </div>
  `).join("");
}

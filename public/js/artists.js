import { fetchJSON } from "./api.js";
import { buildQuery } from "./filters.js";
import { escapeAttribute, escapeHTML, installImageFallbacks, safeImageUrl } from "./dom.js";

export function renderTopArtists(data = []) {
  const container = document.getElementById("top-artists");

  container.innerHTML = data.map((artist, index) => `
    <div class="top-row">
      <span class="rank">${index + 1}</span>
      <img
        src="${escapeAttribute(safeImageUrl(artist.image))}"
        alt="${escapeAttribute(artist.artist)}"
        class="cover artist"
        loading="lazy"
        decoding="async"
        data-fallback="/images/artist-placeholder.png"
      />
      <div class="meta">
        <a
          class="music-link artist-name-link"
          href="${escapeAttribute(artist.url || "#")}"
          target="_blank"
          rel="noopener noreferrer"
          title="Open artist on Last.fm"
        >
          <strong>${escapeHTML(artist.artist)}</strong>
          <i class="mdi mdi-open-in-new"></i>
        </a>
        <small>${Number(artist.plays).toLocaleString()} plays</small>
      </div>
    </div>
  `).join("");

  installImageFallbacks(container);
}

export async function loadTopArtists() {
  const data = await fetchJSON("/api/top-artists" + buildQuery());
  renderTopArtists(data);
}

import { fetchJSON } from "./api.js";
import { buildQuery } from "./filters.js";

export async function loadTopArtists() {
  const data = await fetchJSON("/api/top-artists" + buildQuery());
  const container = document.getElementById("top-artists");

  container.innerHTML = "";

  data.forEach((a, i) => {
    const row = document.createElement("div");
    row.className = "top-row";

    row.innerHTML = `
      <span class="rank">${i + 1}</span>

      <img
        src="${a.image || "/images/artist-placeholder.png"}"
        class="cover artist"
      />

      <div class="meta">
        <strong>${a.artist}</strong>
        <small>${a.plays} plays</small>
      </div>
    `;

    container.appendChild(row);
  });
}

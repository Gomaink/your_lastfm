import { fetchJSON } from "./api.js";
import { escapeAttribute, escapeHTML, safeImageUrl } from "./dom.js";

let currentPage = 1;
let loading = false;

export async function loadScrobbles(reset = true) {
  if (loading) return;
  loading = true;

  const button = document.getElementById("load-more-scrobbles");
  const container = document.getElementById("scrobbles-list");

  if (reset) {
    currentPage = 1;
    button.classList.add("d-none");
    container.innerHTML = "";
  }

  button.disabled = true;

  try {
    const data = await fetchJSON(`/api/recent-scrobbles?page=${currentPage}`, {
      cache: "no-store"
    });

    const html = (data.tracks || []).map(scrobble => `
      <div class="scrobble-item">
        <div class="scrobble-cover">
          ${scrobble.image
            ? `<img
                src="${escapeAttribute(safeImageUrl(scrobble.image))}"
                alt="${escapeAttribute(scrobble.track)}"
                loading="lazy"
              />`
            : '<div class="cover-placeholder"></div>'}
        </div>
        <div class="scrobble-info">
          <div class="scrobble-track">${escapeHTML(scrobble.track)}</div>
          <div class="scrobble-artist">${escapeHTML(scrobble.artist)}</div>
          <div class="scrobble-time">
            ${scrobble.nowPlaying
              ? '<i class="mdi mdi-access-point me-1 text-green"></i>Listening now'
              : timeAgo(scrobble.date)}
          </div>
        </div>
      </div>
    `).join("");

    container.insertAdjacentHTML("beforeend", html);
    button.classList.toggle("d-none", !data.hasMore);
    currentPage++;
  } catch (error) {
    console.error("Error loading scrobbles:", error);
    if (reset) {
      container.innerHTML = `<p class="text-danger">${escapeHTML(error.message)}</p>`;
    }
  } finally {
    loading = false;
    button.disabled = false;
  }
}

document.getElementById("load-more-scrobbles")?.addEventListener("click", () => {
  loadScrobbles(false);
});

function timeAgo(timestamp) {
  if (!timestamp) return "";

  const diff = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

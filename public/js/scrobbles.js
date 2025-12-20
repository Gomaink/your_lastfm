let currentPage = 1;
let loading = false;

export async function loadScrobbles(reset = true) {
  if (loading) return;
  loading = true;

  const btn = document.getElementById("load-more-scrobbles");

  if (reset) {
    currentPage = 1;
    btn.classList.add("d-none");
  }

  const res = await fetch(`/api/recent-scrobbles?page=${currentPage}`);
  const data = await res.json();

  const scrobbles = data.tracks || [];
  const container = document.getElementById("scrobbles-list");

  if (reset) container.innerHTML = "";

  for (const s of scrobbles) {
    container.innerHTML += `
      <div class="scrobble-item">
        <div class="scrobble-cover">
          ${
            s.image
              ? `<img src="${s.image}" alt="${s.track}" />`
              : `<div class="cover-placeholder"></div>`
          }
        </div>

        <div class="scrobble-info">
          <div class="scrobble-track">${s.track}</div>
          <div class="scrobble-artist">${s.artist}</div>
          <div class="scrobble-time">
            ${s.nowPlaying ? `<i class="mdi mdi-access-point me-1 text-green"></i>Listening now` : timeAgo(s.date)}
          </div>
        </div>
      </div>
    `;
  }

  if (data.hasMore) {
    btn.classList.remove("d-none");
  } else {
    btn.classList.add("d-none");
  }

  currentPage++;
  loading = false;
}

document
  .getElementById("load-more-scrobbles")
  .addEventListener("click", () => {
    loadScrobbles(false);
  });

function timeAgo(ts) {
  if (!ts) return "";

  const diff = Math.floor((Date.now() - ts) / 1000);

  if (diff < 60) return "just now"; 
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`; 
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} days ago`; 
}
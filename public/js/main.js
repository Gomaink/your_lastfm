import { initFilters } from "./filters.js";
import { loadSummary } from "./summary.js";
import { loadAlbums } from "./albums.js";
import { loadChart } from "./charts.js";
import { loadTopSongs } from "./topSongs.js";
import { loadTopArtists } from "./artists.js";
import { loadScrobbles } from "./scrobbles.js";

const loading = document.getElementById("global-loading");

async function reload() {
  loading.style.display = "flex";

  await Promise.all([
    loadSummary(),
    loadAlbums(),
    loadTopSongs(),
    loadTopArtists(),
    loadChart({
      url: "/api/plays-per-day",
      canvasId: "daily",
      labelKey: "day",
      valueKey: "plays",
      label: "Plays por dia"
    })
  ]);

  loading.style.display = "none";
}

initFilters(() => {
  reload();
});

reload();

const navButtons = document.querySelectorAll(".nav-btn");
const scrobblesView = document.getElementById("scrobbles-view");

const dashboardSections = Array.from(
  document.querySelectorAll("main > section")
).filter(sec => sec.id !== "scrobbles-view");

function setActiveView(view) {
  navButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });

  if (view === "scrobbles") {
    scrobblesView.classList.remove("d-none");
    dashboardSections.forEach(sec => sec.classList.add("d-none"));
    loadScrobbles(true);
  } else {
    dashboardSections.forEach(sec => sec.classList.remove("d-none"));
    scrobblesView.classList.add("d-none");
  }
}

navButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    setActiveView(btn.dataset.view);
  });
});

setActiveView("dashboard");

import { initFilters } from "./filters.js";
import { loadSummary } from "./summary.js";
import { loadAlbums } from "./albums.js";
import { loadChart } from "./charts.js";
import { loadTopSongs } from "./topSongs.js";
import { loadTopArtists } from "./artists.js";
import { loadScrobbles } from "./scrobbles.js";
import { LoadExportCSV, LoadImportCSV } from "./csv.js";

const UI = {
  loading: document.getElementById("global-loading"),
  scrobblesView: document.getElementById("scrobbles-view"),
  dashboardSections: Array.from(document.querySelectorAll("main > section"))
    .filter(sec => sec.id !== "scrobbles-view"),
  sidebarButtons: document.querySelectorAll(".sidebar-link")
};

const CHART_DAILY_CONFIG = {
  url: "/api/plays-per-day",
  canvasId: "daily",
  labelKey: "day",
  valueKey: "plays",
  label: "Plays per day"
};

LoadExportCSV();
LoadImportCSV();

async function reloadDashboardData() {
  UI.loading.style.display = "flex";

  try {
    await Promise.all([
      loadSummary(),
      loadAlbums(),
      loadTopSongs(),
      loadTopArtists(),
      loadChart(CHART_DAILY_CONFIG)
    ]);
  } catch (error) {
    console.error("Error loading dashboard:", error);
  } finally {
    UI.loading.style.display = "none";
  }
}

function closeSidebarOnMobile() {
  if (window.innerWidth <= 768) {
    document.querySelector(".sidebar")?.classList.remove("open");
    document.getElementById("sidebar-overlay")?.classList.remove("active");
  }
}

function toggleView(viewName) {
  const isScrobbles = viewName === "scrobbles";

  UI.sidebarButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });

  UI.scrobblesView.classList.toggle("d-none", !isScrobbles);
  UI.dashboardSections.forEach(sec =>
    sec.classList.toggle("d-none", isScrobbles)
  );

  if (isScrobbles) {
    loadScrobbles(true);
  }

  closeSidebarOnMobile();
}


UI.sidebarButtons.forEach(btn => {
  btn.addEventListener("click", () => toggleView(btn.dataset.view));
});

initFilters(() => {
  reloadDashboardData();
});

toggleView("dashboard");
reloadDashboardData();

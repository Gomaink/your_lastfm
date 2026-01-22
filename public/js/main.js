import { initFilters } from "./filters.js";
import { loadSummary } from "./summary.js";
import { loadAlbums } from "./albums.js";
import { loadChart } from "./charts.js";
import { loadTopSongs } from "./topSongs.js";
import { loadTopArtists } from "./artists.js";
import { loadScrobbles } from "./scrobbles.js";
import { LoadExportCSV, LoadImportCSV } from "./csv.js";
import { initSharePage } from "./share.js";

const UI = {
  loading: document.getElementById("global-loading"),
  sections: document.querySelectorAll("main > section"),
  sidebarButtons: document.querySelectorAll(".sidebar-link"),
  sidebar: document.querySelector(".sidebar"),
  sidebarOverlay: document.getElementById("sidebar-overlay")
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
    UI.sidebar?.classList.remove("open");
    UI.sidebarOverlay?.classList.remove("active");
  }
}

window.addEventListener("resize", () => {
  if (window.innerWidth > 768) {
    UI.sidebar?.classList.remove("open");
    UI.sidebarOverlay?.classList.remove("active");
  }
});

function toggleView(viewName) {
  localStorage.setItem("activeView", viewName);

  UI.sidebarButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });

  UI.sections.forEach(section => {
    section.classList.toggle(
      "d-none",
      section.id !== `${viewName}-view`
    );
  });

  switch (viewName) {
    case "dashboard":
      reloadDashboardData();
      break;

    case "scrobbles":
      loadScrobbles(true);
      break;

    case "friends":
      window.loadFriends?.();
      break;

    case "share":
      window.initShare?.();
      break;

    case "account":
      window.loadAccount?.();
      break;
  }

  closeSidebarOnMobile();
}

UI.sidebarButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    toggleView(btn.dataset.view);
  });
});

initFilters(() => {
  const dashboardVisible = !document
    .getElementById("dashboard-view")
    ?.classList.contains("d-none");

  if (dashboardVisible) {
    reloadDashboardData();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  initSharePage();

  const savedView = localStorage.getItem("activeView") || "dashboard";
  toggleView(savedView);
});

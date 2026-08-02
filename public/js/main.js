import { initFilters } from "./filters.js";
import { loadSummary } from "./summary.js";
import { loadAlbums } from "./albums.js";
import { loadChart } from "./charts.js";
import { loadTopSongs } from "./topSongs.js";
import { loadTopArtists } from "./artists.js";
import { loadScrobbles } from "./scrobbles.js";
import { loadAccount } from "./account.js";
import { initSharePage } from "./share.js";
import { loadFriends } from "./friends.js";

const UI = {
  loading: document.getElementById("global-loading"),
  sections: document.querySelectorAll("[id$='-view']"),
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

async function reloadDashboardData() {
  console.log("Loading dashboard...");
  UI.loading.style.display = "flex";

  try {
    await Promise.all([
      loadSummary(),
      loadAlbums(),
      loadTopSongs(),
      loadTopArtists(),
      loadChart(CHART_DAILY_CONFIG)
    ]);

    const res = await fetch('/api/last-sync');
    const data = await res.json();

    document.getElementById('last-sync').innerText =
      `Last sync: ${new Date(data.timestamp).toLocaleString()}`;

    document
      .getElementById('sync-now')
      .addEventListener('click', async () => {
          await fetch('/api/sync', {
              method: 'POST'
          });

          let syncStatus = {
              running: false,
              page: 0,
              totalPages: 0,
              inserted: 0,
              message: ''
          };
      });

  } catch (error) {
    console.error("Error loading dashboard:", error);
  } finally {
    UI.loading.style.display = "none";
  }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');

    toast.className = `sync-toast ${type}`;
    toast.innerHTML = message;

    document
        .getElementById('toast-container')
        .appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');

        setTimeout(() => toast.remove(), 300);
    }, 5000);
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
  console.log("Opening view:", viewName);
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
      loadFriends();
      break;

    case "share":
      initSharePage();
      break;

    case "account":
      loadAccount();
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
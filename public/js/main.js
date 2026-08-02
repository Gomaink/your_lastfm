import { fetchJSON } from "./api.js";
import { initFilters, buildQuery } from "./filters.js";
import { renderSummary } from "./summary.js";
import { renderAlbums } from "./albums.js";
import { renderDailyChart, renderListeningClock } from "./charts.js";
import { renderTopSongs } from "./topSongs.js";
import { renderTopArtists } from "./artists.js";
import { loadScrobbles } from "./scrobbles.js";
import { loadAccount } from "./account.js";
import { initSharePage } from "./share.js";
import { loadFriends } from "./friends.js";

const UI = {
  loading: document.getElementById("global-loading"),
  sections: document.querySelectorAll("[id$='-view']"),
  sidebarButtons: document.querySelectorAll(".sidebar-link"),
  sidebar: document.querySelector(".sidebar"),
  sidebarOverlay: document.getElementById("sidebar-overlay"),
  sidebarOpenButton: document.getElementById("open-sidebar"),
  syncButton: document.getElementById("sync-btn"),
  lastSync: document.getElementById("last-sync"),
  dashboardCacheState: document.getElementById("dashboard-cache-state")
};

let syncPollTimer = null;
let dashboardLoadCounter = 0;
let dashboardAbortController = null;

function isDashboardVisible() {
  return !document.getElementById("dashboard-view")?.classList.contains("d-none");
}

function formatLastSync(timestamp) {
  if (!timestamp) return "Last sync: never";
  return `Last sync: ${new Date(timestamp).toLocaleString()}`;
}

function renderSyncState(timestamp, status = {}) {
  if (!UI.lastSync || !UI.syncButton) return;

  if (status.running) {
    const progress = status.totalPages
      ? ` (${status.page || 0}/${status.totalPages})`
      : "";

    UI.lastSync.textContent = `${status.message || "Syncing..."}${progress}`;
    UI.syncButton.disabled = true;
    UI.syncButton.innerHTML = '<i class="mdi mdi-loading mdi-spin"></i> Syncing';
    return;
  }

  UI.lastSync.textContent = formatLastSync(timestamp);
  UI.syncButton.disabled = false;
  UI.syncButton.innerHTML = '<i class="mdi mdi-sync"></i> Sync';
}

function renderDashboardCacheState(cache = {}) {
  if (!UI.dashboardCacheState) return;

  const cachedAt = Number(cache.cachedAt || 0);
  if (!cachedAt) {
    UI.dashboardCacheState.textContent = "";
    return;
  }

  const prefix = cache.hit ? "Loaded from dashboard cache" : "Dashboard cache refreshed";
  UI.dashboardCacheState.textContent = `${prefix} · ${new Date(cachedAt).toLocaleTimeString()}`;
}

async function refreshSyncState() {
  const data = await fetchJSON("/api/last-sync", { cache: "no-store" });
  renderSyncState(data.timestamp, data.status);
  return data;
}

function stopSyncPolling() {
  if (!syncPollTimer) return;
  clearTimeout(syncPollTimer);
  syncPollTimer = null;
}

async function pollSyncUntilFinished() {
  stopSyncPolling();

  try {
    const data = await refreshSyncState();

    if (data.status?.running) {
      syncPollTimer = setTimeout(pollSyncUntilFinished, 1500);
      return;
    }

    if (data.status?.error) {
      showToast(data.status.message || "Sync failed", "error");
      return;
    }

    showToast(data.status?.message || "Sync completed", "success");
    if (isDashboardVisible()) await reloadDashboardData({ skipSyncRefresh: true });
  } catch (error) {
    console.error("Could not read sync status:", error);
    syncPollTimer = setTimeout(pollSyncUntilFinished, 3000);
  }
}

function initSyncControls() {
  if (!UI.syncButton) return;

  UI.syncButton.addEventListener("click", async () => {
    UI.syncButton.disabled = true;

    try {
      await fetchJSON("/api/sync", {
        method: "POST",
        cache: "no-store"
      });
      showToast("Sync started", "info");
    } catch (error) {
      if (error.status !== 409) {
        showToast(error.message, "error");
        await refreshSyncState().catch(() => {});
        return;
      }

      showToast("A sync is already running", "info");
    }

    pollSyncUntilFinished();
  });

  refreshSyncState()
    .then(data => {
      if (data.status?.running) pollSyncUntilFinished();
    })
    .catch(error => console.error("Could not load sync status:", error));
}

function renderDashboard(data) {
  renderSummary(data.summary);
  renderAlbums(data.topAlbums);
  renderTopSongs(data.topTracks);
  renderTopArtists(data.topArtists);
  renderDailyChart(data.playsPerDay);
  renderListeningClock(data.listeningClock);
  renderDashboardCacheState(data.cache);
}

async function reloadDashboardData({ skipSyncRefresh = false } = {}) {
  const loadId = ++dashboardLoadCounter;
  dashboardAbortController?.abort();
  dashboardAbortController = new AbortController();
  UI.loading.style.display = "flex";

  try {
    const query = buildQuery({ tzOffset: new Date().getTimezoneOffset() });
    const data = await fetchJSON(`/api/dashboard${query}`, {
      cache: "no-store",
      signal: dashboardAbortController.signal
    });

    if (loadId !== dashboardLoadCounter) return;
    renderDashboard(data);

    if (!skipSyncRefresh) await refreshSyncState();
  } catch (error) {
    if (error.name === "AbortError") return;

    console.error("Error loading dashboard:", error);
    showToast(error.message || "Error loading dashboard", "error");
  } finally {
    if (loadId === dashboardLoadCounter) UI.loading.style.display = "none";
  }
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `sync-toast ${type}`;
  toast.textContent = message;

  document.getElementById("toast-container")?.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

function closeSidebarOnMobile() {
  if (window.innerWidth <= 768) {
    UI.sidebar?.classList.remove("open");
    UI.sidebarOverlay?.classList.remove("active");
  }
}

function initSidebar() {
  UI.sidebarOpenButton?.addEventListener("click", () => {
    UI.sidebar?.classList.add("open");
    UI.sidebarOverlay?.classList.add("active");
  });

  UI.sidebarOverlay?.addEventListener("click", () => {
    UI.sidebar?.classList.remove("open");
    UI.sidebarOverlay.classList.remove("active");
  });
}

window.addEventListener("resize", () => {
  if (window.innerWidth > 768) {
    UI.sidebar?.classList.remove("open");
    UI.sidebarOverlay?.classList.remove("active");
  }
});

function toggleView(viewName) {
  localStorage.setItem("activeView", viewName);

  UI.sidebarButtons.forEach(button => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });

  UI.sections.forEach(section => {
    section.classList.toggle("d-none", section.id !== `${viewName}-view`);
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
    case "account":
      loadAccount();
      break;
  }

  closeSidebarOnMobile();
}

UI.sidebarButtons.forEach(button => {
  button.addEventListener("click", () => toggleView(button.dataset.view));
});

initFilters(() => {
  if (isDashboardVisible()) reloadDashboardData();
});

document.addEventListener("DOMContentLoaded", () => {
  initSidebar();
  initSharePage();
  initSyncControls();

  const savedView = localStorage.getItem("activeView") || "dashboard";
  toggleView(savedView);
});

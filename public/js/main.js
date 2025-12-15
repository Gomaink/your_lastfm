import { initFilters } from "./filters.js";
import { loadSummary } from "./summary.js";
import { loadAlbums } from "./albums.js";
import { loadChart } from "./charts.js";

function reload() {
  loadSummary();
  loadAlbums();

  loadChart({
    url: "/api/top-artists",
    canvasId: "artists",
    labelKey: "artist",
    valueKey: "plays",
    label: "Escutado"
  });

  loadChart({
    url: "/api/top-tracks",
    canvasId: "tracks",
    labelKey: "track",
    valueKey: "plays",
    label: "Escutou"
  });

  loadChart({
    url: "/api/plays-per-day",
    canvasId: "daily",
    labelKey: "day",
    valueKey: "plays",
    label: "Plays por dia"
  });
}

initFilters(() => {
  reload();
});

reload();

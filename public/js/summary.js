import { fetchJSON } from "./api.js";
import { buildQuery } from "./filters.js";

function renderTrend(elementId, metric, label, note) {
  const element = document.getElementById(elementId);
  if (!element) return;

  element.className = "metric-trend";

  if (!metric || !label) {
    element.innerHTML = `<i class="mdi mdi-history"></i> ${note || "All available history"}`;
    return;
  }

  const direction = metric.direction || "same";
  const icon = direction === "up"
    ? "mdi-arrow-up"
    : direction === "down"
      ? "mdi-arrow-down"
      : "mdi-minus";
  const value = metric.percent === null
    ? "New"
    : `${Math.abs(Number(metric.percent) || 0).toLocaleString(undefined, {
        maximumFractionDigits: 1
      })}%`;

  element.classList.add(direction);
  element.innerHTML = `<i class="mdi ${icon}"></i> ${value} vs ${label}`;
}

export function renderSummary(data = {}) {
  document.getElementById("hours").textContent = Number(data.totalMinutes || 0).toLocaleString();
  document.getElementById("plays").textContent = Number(data.totalPlays || 0).toLocaleString();
  document.getElementById("avg").textContent = Number(data.avgPerDay || 0).toLocaleString(undefined, {
    maximumFractionDigits: 1
  });

  renderTrend(
    "hours-trend",
    data.comparison?.totalMinutes,
    data.comparison?.label,
    data.comparisonNote
  );
  renderTrend(
    "plays-trend",
    data.comparison?.totalPlays,
    data.comparison?.label,
    data.comparisonNote
  );
  renderTrend(
    "avg-trend",
    data.comparison?.avgPerDay,
    data.comparison?.label,
    data.comparisonNote
  );
}

export async function loadSummary() {
  const data = await fetchJSON("/api/summary" + buildQuery());
  renderSummary(data);
}

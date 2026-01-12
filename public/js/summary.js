import { fetchJSON } from "./api.js";
import { buildQuery } from "./filters.js";

export async function loadSummary() {
  const data = await fetchJSON("/api/summary" + buildQuery());

  document.getElementById("hours").textContent = `${data.totalMinutes}`;
  document.getElementById("plays").textContent = data.totalPlays;
  document.getElementById("avg").textContent = data.avgPerDay;
}

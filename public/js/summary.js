import { fetchJSON } from "./api.js";

export async function loadSummary() {
  const data = await fetchJSON("/api/summary");

  document.getElementById("hours").textContent = `${data.totalHours}h`;
  document.getElementById("plays").textContent = data.totalPlays;
  document.getElementById("avg").textContent = data.avgPerDay;
}

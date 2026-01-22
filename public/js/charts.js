import { fetchJSON } from "./api.js";
import { buildQuery } from "./filters.js";

const state = {
  charts: {}
};

export async function loadChart({ url, canvasId, labelKey, valueKey, label }) {
  const queryString = buildQuery();
  const data = await fetchJSON(`${url}${queryString}`); 

  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
  }

  state.charts[canvasId] = new Chart(
    document.getElementById(canvasId),
    {
      type: "bar",
      data: {
        labels: data.map(d => d[labelKey]),
        datasets: [{
            label,
            data: data.map(d => d[valueKey]),
            backgroundColor: "#ff7302",
            borderRadius: 6,
            maxBarThickness: 50
          }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    }
  );
}
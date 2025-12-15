import { state } from "./state.js";
import { fetchJSON } from "./api.js";

export async function loadChart({ url, canvasId, labelKey, valueKey, label }) {
  const data = await fetchJSON(url);

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
            backgroundColor: "#1DB954",
            borderRadius: 6,
            maxBarThickness: 50
          }]
      }
    }
  );
}

import { fetchJSON } from "./api.js";
import { buildQuery } from "./filters.js";

const state = {
  charts: {}
};

// server buckets hours by the viewer's current UTC offset; formatting in UTC prints them unchanged
const hourFormat = new Intl.DateTimeFormat(undefined, { timeStyle: "short", timeZone: "UTC" });
const formatHour = hour => hourFormat.format(Date.UTC(2000, 0, 1, hour));
const formatHourRange = hour => `${formatHour(hour)}–${formatHour((hour + 1) % 24)}`;

function replaceChart(canvasId, configuration) {
  if (state.charts[canvasId]) state.charts[canvasId].destroy();

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  state.charts[canvasId] = new Chart(canvas, configuration);
}

function commonOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: "index"
    },
    plugins: {
      legend: {
        labels: { color: "#b3b3b3" }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: "#8a8a8a", maxRotation: 0 }
      },
      y: {
        beginAtZero: true,
        grid: { color: "rgba(255, 255, 255, 0.06)" },
        ticks: { color: "#8a8a8a", precision: 0 }
      }
    }
  };
}

export function renderDailyChart(data = []) {
  const options = commonOptions();
  options.scales.x.ticks.maxTicksLimit = 12;

  replaceChart("daily", {
    type: "bar",
    data: {
      labels: data.map(item => item.day),
      datasets: [{
        label: "Plays per day",
        data: data.map(item => item.plays),
        backgroundColor: "rgba(255, 115, 2, 0.78)",
        borderRadius: 6,
        maxBarThickness: 50
      }]
    },
    options
  });
}

export function renderListeningClock(data = {}) {
  const hours = Array.isArray(data.hours) ? data.hours : [];
  const peakHour = Number.isInteger(data.peakHour) ? data.peakHour : null;
  const options = commonOptions();
  options.scales.x.ticks.maxTicksLimit = 12;
  options.plugins.legend.display = false;
  options.plugins.tooltip = {
    callbacks: {
      title(items) {
        return formatHourRange(hours[items[0].dataIndex].hour);
      },
      label(item) {
        return `${Number(item.raw || 0).toLocaleString()} plays`;
      }
    }
  };

  replaceChart("listening-clock", {
    type: "bar",
    data: {
      labels: hours.map(item => formatHour(item.hour)),
      datasets: [{
        data: hours.map(item => item.plays),
        backgroundColor: hours.map(item => (
          item.hour === peakHour ? "#ff7302" : "rgba(255, 115, 2, 0.3)"
        )),
        borderRadius: 6,
        maxBarThickness: 36
      }]
    },
    options
  });

  const peakElement = document.getElementById("peak-listening-hour");
  if (!peakElement) return;

  peakElement.textContent = peakHour === null
    ? "No listening data for this period"
    : `Peak: ${formatHourRange(peakHour)} local time · ${Number(data.peakPlays || 0).toLocaleString()} plays`;
}

export async function loadChart({ url, canvasId, labelKey, valueKey, label }) {
  const data = await fetchJSON(`${url}${buildQuery()}`);

  if (canvasId === "daily") {
    renderDailyChart(data);
    return;
  }

  replaceChart(canvasId, {
    type: "bar",
    data: {
      labels: data.map(item => item[labelKey]),
      datasets: [{
        label,
        data: data.map(item => item[valueKey]),
        backgroundColor: "#ff7302",
        borderRadius: 6,
        maxBarThickness: 50
      }]
    },
    options: commonOptions()
  });
}

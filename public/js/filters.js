let activeRange = "";

export function buildQuery() {
  const params = new URLSearchParams();

  if (activeRange) {
    params.append("range", activeRange);
    return "?" + params.toString();
  }

  const year = document.getElementById("year").value;
  const month = document.getElementById("month").value;

  if (year) params.append("year", year);
  if (month) params.append("month", month);

  return params.toString() ? "?" + params.toString() : "";
}

export function initFilters(onChange) {
  const yearSelect = document.getElementById("year");
  const monthSelect = document.getElementById("month");
  const currentYear = new Date().getFullYear();

  yearSelect.innerHTML = `<option value="">Todos os anos</option>`;
  for (let y = currentYear; y >= currentYear - 10; y--) {
    yearSelect.innerHTML += `<option value="${y}">${y}</option>`;
  }

  function handleManualChange() {
    activeRange = "";
    document.querySelectorAll(".range-pill")
      .forEach(b => b.classList.remove("active"));

    onChange();
  }

  yearSelect.addEventListener("change", handleManualChange);
  monthSelect.addEventListener("change", handleManualChange);

  document.querySelectorAll(".range-pill").forEach(btn => {
    btn.addEventListener("click", () => {

      document.querySelectorAll(".range-pill")
        .forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      activeRange = btn.dataset.range;

      yearSelect.value = "";
      monthSelect.value = "";

      onChange();
    });
  });
}

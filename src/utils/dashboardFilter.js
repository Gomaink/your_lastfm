const { getDateRange } = require("./dateRange");
const { getActiveFilter } = require("./filters");

const ROLLING_LABELS = {
  day: "previous 24 hours",
  week: "previous 7 days",
  month: "previous month",
  year: "previous year"
};

function toSqlFilter(from, to) {
  return {
    where: "played_at >= ? AND played_at <= ?",
    params: [
      Math.floor(from.getTime() / 1000),
      Math.floor(to.getTime() / 1000)
    ]
  };
}

function shiftStartBack(from, unit) {
  const previousFrom = new Date(from);

  if (unit === "day") previousFrom.setUTCDate(previousFrom.getUTCDate() - 1);
  if (unit === "week") previousFrom.setUTCDate(previousFrom.getUTCDate() - 7);
  if (unit === "month") previousFrom.setUTCMonth(previousFrom.getUTCMonth() - 1);
  if (unit === "year") previousFrom.setUTCFullYear(previousFrom.getUTCFullYear() - 1);

  return previousFrom;
}

function getTimezoneOffset(query = {}) {
  const raw = query.tzOffset;
  if (raw === undefined || raw === null || raw === "") return 0;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < -840 || parsed > 840) {
    const error = new Error("Invalid timezone offset");
    error.statusCode = 400;
    throw error;
  }

  return parsed;
}

function getDashboardFilterContext(query = {}, referenceDate = new Date()) {
  const validatedFilter = getActiveFilter(query);
  const range = String(query.range || "").trim();
  const year = String(query.year || "").trim();
  const month = String(query.month || "").trim();
  const timezoneOffset = getTimezoneOffset(query);
  let current = validatedFilter;
  let previous = null;
  let comparisonLabel = null;
  let comparisonNote = month && !year
    ? "All matching months across your history"
    : "All available history";

  if (range) {
    const { from, to } = getDateRange(range, null, null, referenceDate);
    current = toSqlFilter(from, to);
    previous = toSqlFilter(shiftStartBack(from, range), new Date(from.getTime() - 1));
    comparisonLabel = ROLLING_LABELS[range];
    comparisonNote = null;
  } else if (year) {
    const { from, to } = getDateRange(null, year, month || null, referenceDate);
    const unit = month ? "month" : "year";
    current = toSqlFilter(from, to);
    previous = toSqlFilter(shiftStartBack(from, unit), new Date(from.getTime() - 1));
    comparisonLabel = month ? "previous month" : "previous year";
    comparisonNote = null;
  }

  const cacheKey = [
    `range=${range}`,
    `year=${year}`,
    `month=${month}`,
    `tzOffset=${timezoneOffset}`
  ].join("&");

  return {
    current,
    previous,
    comparisonLabel,
    comparisonNote,
    timezoneOffset,
    cacheKey
  };
}

module.exports = { getDashboardFilterContext, getTimezoneOffset };

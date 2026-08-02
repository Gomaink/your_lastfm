const { getDateRange } = require("./dateRange");

const ALLOWED_RANGES = new Set(["day", "week", "month", "year"]);

function invalidFilter(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function parseMonth(month) {
  if (month === undefined || month === null || month === "") return null;

  const rawMonth = String(month);
  if (!/^(?:0?[1-9]|1[0-2])$/.test(rawMonth)) invalidFilter("Invalid month filter");
  return Number(rawMonth);
}

function parseYear(year) {
  if (year === undefined || year === null || year === "") return null;

  const parsed = Number.parseInt(year, 10);
  if (!/^\d{4}$/.test(String(year)) || parsed < 1970 || parsed > 9999) {
    invalidFilter("Invalid year filter");
  }
  return parsed;
}

const getActiveFilter = (query = {}) => {
  const rawRange = String(query.range || "").trim();
  const parsedYear = parseYear(query.year);
  const parsedMonth = parseMonth(query.month);

  if (rawRange) {
    if (!ALLOWED_RANGES.has(rawRange)) invalidFilter("Invalid range filter");

    const { from, to } = getDateRange(rawRange);
    return {
      where: "played_at >= ? AND played_at <= ?",
      params: [
        Math.floor(from.getTime() / 1000),
        Math.floor(to.getTime() / 1000)
      ]
    };
  }

  if (parsedYear !== null) {
    const { from, to } = getDateRange(null, parsedYear, parsedMonth);
    return {
      where: "played_at >= ? AND played_at <= ?",
      params: [
        Math.floor(from.getTime() / 1000),
        Math.floor(to.getTime() / 1000)
      ]
    };
  }

  if (parsedMonth !== null) {
    return {
      where: "strftime('%m', played_at, 'unixepoch') = ?",
      params: [String(parsedMonth).padStart(2, "0")]
    };
  }

  return { where: null, params: [] };
};

module.exports = { getActiveFilter };

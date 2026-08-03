const DAY_MS = 24 * 60 * 60 * 1000;

function createRangeError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function datePartsFromString(value, label) {
  const text = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw createRangeError(`${label} must use YYYY-MM-DD`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const startMs = Date.UTC(year, month - 1, day);
  const date = new Date(startMs);

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw createRangeError(`${label} is not a valid date`);
  }

  return { text, startMs };
}

function formatUtcDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function getDefaultDateRange(now = Date.now()) {
  const current = new Date(now);
  const todayStart = Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate()
  );

  return {
    from: formatUtcDate(todayStart - 29 * DAY_MS),
    to: formatUtcDate(todayStart)
  };
}

function parseLeaderboardRange(query = {}, options = {}) {
  const now = Number(options.now) || Date.now();
  const maxDays = Math.max(1, Number(options.maxDays) || 366);
  const defaults = getDefaultDateRange(now);
  const fromDate = datePartsFromString(query.from || defaults.from, "from");
  const toDate = datePartsFromString(query.to || defaults.to, "to");

  if (fromDate.startMs > toDate.startMs) {
    throw createRangeError("from must be before or equal to to");
  }

  const current = new Date(now);
  const todayStart = Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate()
  );

  if (toDate.startMs > todayStart) {
    throw createRangeError("to cannot be in the future");
  }

  const days = Math.floor((toDate.startMs - fromDate.startMs) / DAY_MS) + 1;
  if (days > maxDays) {
    throw createRangeError(`Leaderboard ranges are limited to ${maxDays} days`);
  }

  return {
    from: fromDate.text,
    to: toDate.text,
    fromTimestamp: Math.floor(fromDate.startMs / 1000),
    toTimestamp: Math.floor((toDate.startMs + DAY_MS - 1) / 1000),
    days
  };
}

module.exports = {
  DAY_MS,
  formatUtcDate,
  getDefaultDateRange,
  parseLeaderboardRange
};

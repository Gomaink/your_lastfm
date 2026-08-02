function getDateRange(range, year, month, referenceDate = new Date()) {
  const now = new Date(referenceDate);

  if (range) {
    const from = new Date(now);

    switch (range) {
      case "day":
        from.setUTCDate(from.getUTCDate() - 1);
        break;
      case "week":
        from.setUTCDate(from.getUTCDate() - 7);
        break;
      case "month":
        from.setUTCMonth(from.getUTCMonth() - 1);
        break;
      case "year":
        from.setUTCFullYear(from.getUTCFullYear() - 1);
        break;
      default:
        return { from: null, to: null };
    }

    return { from, to: now };
  }

  const parsedYear = Number.parseInt(year, 10);
  if (!Number.isInteger(parsedYear) || parsedYear < 1970 || parsedYear > 9999) {
    return { from: null, to: null };
  }

  const parsedMonth = month === undefined || month === null || month === ""
    ? null
    : Number.parseInt(month, 10);

  if (parsedMonth !== null && (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12)) {
    return { from: null, to: null };
  }

  const from = parsedMonth === null
    ? new Date(Date.UTC(parsedYear, 0, 1))
    : new Date(Date.UTC(parsedYear, parsedMonth - 1, 1));

  const to = parsedMonth === null
    ? new Date(Date.UTC(parsedYear + 1, 0, 1) - 1)
    : new Date(Date.UTC(parsedYear, parsedMonth, 1) - 1);

  return { from, to };
}

function fillMissingDates(rows, range, year, month) {
  const { from, to } = getDateRange(range, year, month);
  if (!from || !to) return rows;

  const result = new Map();
  const current = new Date(Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate()
  ));
  const lastDay = new Date(Date.UTC(
    to.getUTCFullYear(),
    to.getUTCMonth(),
    to.getUTCDate()
  ));

  while (current <= lastDay) {
    const day = current.toISOString().slice(0, 10);
    result.set(day, { day, plays: 0 });
    current.setUTCDate(current.getUTCDate() + 1);
  }

  for (const row of rows) {
    if (result.has(row.day)) result.set(row.day, row);
  }

  return Array.from(result.values());
}

module.exports = { getDateRange, fillMissingDates };

function calculateChange(current, previous) {
  const currentValue = Number(current) || 0;
  const previousValue = Number(previous) || 0;

  if (previousValue === 0) {
    return {
      previous: previousValue,
      percent: currentValue === 0 ? 0 : null,
      direction: currentValue === 0 ? "same" : "up"
    };
  }

  const percent = Math.round(((currentValue - previousValue) / previousValue) * 1000) / 10;
  return {
    previous: previousValue,
    percent,
    direction: percent > 0 ? "up" : percent < 0 ? "down" : "same"
  };
}

function normalizeSummary(row) {
  const totalPlays = Number(row?.totalPlays || 0);
  const totalMinutes = Math.round(Number(row?.totalSeconds || 0) / 60);
  const days = Number(row?.days || 0);

  return {
    totalPlays,
    totalMinutes,
    avgPerDay: days ? Math.round((totalPlays / days) * 10) / 10 : 0
  };
}

module.exports = { calculateChange, normalizeSummary };

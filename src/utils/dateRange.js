function buildRangeFilter(range) {
  if (!range) return null;

  const now = new Date();
  let from = new Date();

  switch (range) {
    case "day":
      // Últimas 24 horas
      from.setDate(now.getDate() - 1);
      break;
    case "week":
      // Últimos 7 dias
      from.setDate(now.getDate() - 7);
      break;
    case "month":
      // Últimos 30/31 dias (Um mês atrás, mantendo o dia do mês)
      from.setMonth(now.getMonth() - 1); 
      break;
    case "year":
      // Últimos 365 dias (Um ano atrás)
      from.setFullYear(now.getFullYear() - 1);
      break;
    default:
      return null;
  }

  const fromUnix = Math.floor(from.getTime() / 1000);
  return {
    where: "played_at >= ?",
    params: [fromUnix]
  };
}

module.exports = { buildRangeFilter };
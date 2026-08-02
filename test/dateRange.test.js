const test = require("node:test");
const assert = require("node:assert/strict");

const { getDateRange, fillMissingDates } = require("../src/utils/dateRange");
const { getActiveFilter } = require("../src/utils/filters");

test("builds an indexed UTC range for a month", () => {
  const { from, to } = getDateRange(null, "2026", "2");

  assert.equal(from.toISOString(), "2026-02-01T00:00:00.000Z");
  assert.equal(to.toISOString(), "2026-02-28T23:59:59.999Z");

  const filter = getActiveFilter({ year: "2026", month: "2" });
  assert.equal(filter.where, "played_at >= ? AND played_at <= ?");
  assert.deepEqual(filter.params, [
    Math.floor(from.getTime() / 1000),
    Math.floor(to.getTime() / 1000)
  ]);
});

test("rejects invalid year and month filters", () => {
  assert.throws(
    () => getActiveFilter({ year: "abc", month: "2" }),
    error => error.statusCode === 400
  );
  assert.throws(
    () => getActiveFilter({ year: "2026", month: "13" }),
    error => error.statusCode === 400
  );
  assert.throws(
    () => getActiveFilter({ range: "forever" }),
    error => error.statusCode === 400
  );
});

test("supports a month filter across all years", () => {
  assert.deepEqual(getActiveFilter({ month: "2" }), {
    where: "strftime('%m', played_at, 'unixepoch') = ?",
    params: ["02"]
  });
});

test("fills missing dates without local timezone drift", () => {
  const result = fillMissingDates(
    [{ day: "2024-02-29", plays: 3 }],
    null,
    "2024",
    "2"
  );

  assert.equal(result.length, 29);
  assert.deepEqual(result[0], { day: "2024-02-01", plays: 0 });
  assert.deepEqual(result.at(-1), { day: "2024-02-29", plays: 3 });
});

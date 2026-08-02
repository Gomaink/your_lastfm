const test = require("node:test");
const assert = require("node:assert/strict");

const { getDashboardFilterContext, getTimezoneOffset } = require("../src/utils/dashboardFilter");

test("builds the previous equivalent rolling window", () => {
  const context = getDashboardFilterContext(
    { range: "week", tzOffset: "180" },
    new Date("2026-08-02T22:00:00.000Z")
  );

  assert.deepEqual(context.current.params, [1785103200, 1785708000]);
  assert.deepEqual(context.previous.params, [1784498400, 1785103199]);
  assert.equal(context.comparisonLabel, "previous 7 days");
  assert.equal(context.timezoneOffset, 180);
});

test("compares a selected month with the previous calendar month", () => {
  const context = getDashboardFilterContext({ year: "2026", month: "3" });

  assert.deepEqual(context.current.params, [1772323200, 1775001599]);
  assert.deepEqual(context.previous.params, [1769904000, 1772323199]);
  assert.equal(context.comparisonLabel, "previous month");
});

test("does not invent a previous period for all-time or month-only filters", () => {
  assert.equal(getDashboardFilterContext({}).previous, null);
  assert.equal(getDashboardFilterContext({ month: "2" }).previous, null);
});

test("validates browser timezone offsets", () => {
  assert.equal(getTimezoneOffset({ tzOffset: "-330" }), -330);
  assert.throws(
    () => getTimezoneOffset({ tzOffset: "9999" }),
    error => error.statusCode === 400
  );
});

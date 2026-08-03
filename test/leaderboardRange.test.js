const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getDefaultDateRange,
  parseLeaderboardRange
} = require("../src/utils/leaderboardRange");

const FIXED_NOW = Date.UTC(2026, 7, 2, 12, 0, 0);

test("builds a 30-day default leaderboard range", () => {
  assert.deepEqual(getDefaultDateRange(FIXED_NOW), {
    from: "2026-07-04",
    to: "2026-08-02"
  });

  const range = parseLeaderboardRange({}, { now: FIXED_NOW, maxDays: 366 });
  assert.equal(range.days, 30);
  assert.equal(range.fromTimestamp, Date.UTC(2026, 6, 4) / 1000);
  assert.equal(range.toTimestamp, Math.floor((Date.UTC(2026, 7, 3) - 1) / 1000));
});

test("accepts an inclusive custom range", () => {
  const range = parseLeaderboardRange({
    from: "2026-07-01",
    to: "2026-07-07"
  }, { now: FIXED_NOW, maxDays: 366 });

  assert.equal(range.days, 7);
  assert.equal(range.from, "2026-07-01");
  assert.equal(range.to, "2026-07-07");
});

test("rejects invalid, future, reversed, and oversized ranges", () => {
  assert.throws(
    () => parseLeaderboardRange({ from: "2026-02-30", to: "2026-03-01" }, { now: FIXED_NOW }),
    /not a valid date/
  );
  assert.throws(
    () => parseLeaderboardRange({ from: "2026-08-03", to: "2026-08-03" }, { now: FIXED_NOW }),
    /future/
  );
  assert.throws(
    () => parseLeaderboardRange({ from: "2026-08-01", to: "2026-07-01" }, { now: FIXED_NOW }),
    /before or equal/
  );
  assert.throws(
    () => parseLeaderboardRange({ from: "2025-01-01", to: "2026-08-02" }, {
      now: FIXED_NOW,
      maxDays: 366
    }),
    /limited to 366 days/
  );
});

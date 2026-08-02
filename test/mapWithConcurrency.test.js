const test = require("node:test");
const assert = require("node:assert/strict");

const { mapWithConcurrency } = require("../src/utils/mapWithConcurrency");

test("preserves result order and respects the concurrency limit", async () => {
  let active = 0;
  let maximumActive = 0;

  const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async value => {
    active++;
    maximumActive = Math.max(maximumActive, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return value * 2;
  });

  assert.deepEqual(result, [2, 4, 6, 8, 10]);
  assert.equal(maximumActive, 2);
});

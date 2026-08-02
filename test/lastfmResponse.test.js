const test = require("node:test");
const assert = require("node:assert/strict");

const { assertLastFmResponse } = require("../src/utils/lastfmResponse");

test("accepts successful Last.fm responses", () => {
  const data = { recenttracks: { track: [] } };
  assert.equal(assertLastFmResponse(data), data);
});

test("marks rate-limit errors as retryable", () => {
  assert.throws(
    () => assertLastFmResponse({ error: 29, message: "Rate limit exceeded" }),
    error => {
      assert.equal(error.name, "LastFmApiError");
      assert.equal(error.statusCode, 502);
      assert.equal(error.response.status, 429);
      return true;
    }
  );
});

test("does not mark permanent Last.fm errors as retryable", () => {
  assert.throws(
    () => assertLastFmResponse({ error: 6, message: "Invalid parameters" }),
    error => {
      assert.equal(error.statusCode, 502);
      assert.equal(error.response, undefined);
      return true;
    }
  );
});

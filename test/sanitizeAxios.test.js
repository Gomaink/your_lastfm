const test = require("node:test");
const assert = require("node:assert/strict");

const { sanitizeError } = require("../src/utils/sanitizeAxios");

test("keeps useful Error fields and redacts API keys", () => {
  const error = new Error("Failed: api_key=secret&format=json");
  error.config = {
    url: "https://example.test/?api_key=secret&format=json",
    params: { api_key: "secret", method: "test" }
  };

  const sanitized = sanitizeError(error);

  assert.equal(sanitized.name, "Error");
  assert.match(sanitized.message, /\*\*\*REDACTED\*\*\*/);
  assert.doesNotMatch(sanitized.message, /secret/);
  assert.equal(sanitized.config.params.api_key, "***REDACTED***");
  assert.doesNotMatch(sanitized.config.url, /secret/);
});

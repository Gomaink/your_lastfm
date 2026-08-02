const DEFAULT_RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const DEFAULT_RETRY_CODES = new Set([
  "ECONNABORTED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENETUNREACH",
  "ETIMEDOUT"
]);

function getRetryAfterMs(error) {
  const value = error.response?.headers?.["retry-after"];
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

async function fetchWithRetry(fn, retries = 4, delay = 750) {
  try {
    return await fn();
  } catch (err) {
    const status = err.response?.status;
    const code = err.code;
    const isTemporaryError = DEFAULT_RETRY_STATUSES.has(status) || DEFAULT_RETRY_CODES.has(code);

    if (retries > 0 && isTemporaryError) {
      const retryAfter = getRetryAfterMs(err);
      const waitMs = Math.min(retryAfter ?? delay, 60000);
      const errorType = code || `HTTP ${status}`;

      console.warn(
        `⚠️ Temporary request error (${errorType}). Retrying in ${Math.ceil(waitMs / 1000)}s... (${retries} retries left)`
      );

      await new Promise(resolve => setTimeout(resolve, waitMs));
      return fetchWithRetry(fn, retries - 1, Math.min(delay * 2, 15000));
    }

    throw err;
  }
}

module.exports = { fetchWithRetry };

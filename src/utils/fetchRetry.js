async function fetchWithRetry(fn, retries = 6, delay = 1000) {
  try {
    return await fn();
  } catch (err) {
    const status = err.response?.status;
    const code = err.code;
    const isTemporaryError = (status === 500 || status === 502 || status === 503) || code === 'ECONNABORTED';

    if (retries > 0 && isTemporaryError) {
      const delaySeconds = Math.round(delay / 1000);
      const errorType = code === 'ECONNABORTED' ? 'timeout' : `error (${status})`;
      console.warn(
        `⚠️ Last.fm temporary ${errorType}. Retrying in ${delaySeconds}s... (${retries} retries left)`
      );
      await new Promise(r => setTimeout(r, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2);
    }

    throw err;
  }
}

module.exports = { fetchWithRetry };
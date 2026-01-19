async function fetchWithRetry(fn, retries = 6, delay = 1000) {
  try {
    return await fn();
  } catch (err) {
    const status = err.response?.status;

    if (retries > 0 && (status === 500 || status === 502 || status === 503)) {
      const delaySeconds = Math.round(delay / 1000);
      console.warn(
        `⚠️ Last.fm temporary error (${status}). Retrying in ${delaySeconds}s... (${retries} retries left)`
      );
      await new Promise(r => setTimeout(r, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2);
    }

    throw err;
  }
}

module.exports = { fetchWithRetry };
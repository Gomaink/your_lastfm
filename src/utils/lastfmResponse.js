const TEMPORARY_LASTFM_ERRORS = new Set([11, 16, 29]);

function assertLastFmResponse(data) {
  if (!data?.error) return data;

  const lastFmCode = Number(data.error);
  const error = new Error(`[Last.fm] ${data.message || "Request failed"}`);
  error.name = "LastFmApiError";
  error.lastFmCode = lastFmCode;
  error.statusCode = 502;

  if (TEMPORARY_LASTFM_ERRORS.has(lastFmCode)) {
    error.response = {
      status: lastFmCode === 29 ? 429 : 503,
      headers: {}
    };
  }

  throw error;
}

module.exports = { assertLastFmResponse };

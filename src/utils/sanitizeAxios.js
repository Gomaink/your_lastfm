function redactApiKey(value) {
  return String(value || "").replace(/api_key=[^&\s]*/gi, "api_key=***REDACTED***");
}

function sanitizeAxiosConfig(config) {
  if (!config) return config;

  const sanitized = { ...config };

  if (config.params) {
    sanitized.params = {
      ...config.params,
      ...(config.params.api_key ? { api_key: "***REDACTED***" } : {})
    };
  }

  if (config.url) sanitized.url = redactApiKey(config.url);
  return sanitized;
}

function sanitizeError(error) {
  if (!error) return error;

  const sanitized = {
    name: error.name || "Error",
    message: redactApiKey(error.message || String(error)),
    code: error.code,
    status: error.status || error.statusCode,
    stack: error.stack ? redactApiKey(error.stack) : undefined
  };

  if (error.config) sanitized.config = sanitizeAxiosConfig(error.config);

  if (error.response) {
    sanitized.response = {
      status: error.response.status,
      statusText: error.response.statusText,
      data: error.response.data,
      headers: error.response.headers,
      config: sanitizeAxiosConfig(error.response.config)
    };
  }

  return sanitized;
}

module.exports = { sanitizeAxiosConfig, sanitizeError };

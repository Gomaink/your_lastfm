function sanitizeAxiosConfig(config) {
  if (!config) return config;

  // Redact API key from params
  if (config.params?.api_key) {
    config = {
      ...config,
      params: {
        ...config.params,
        api_key: "***REDACTED***"
      }
    };
  }

  // Redact API key from URL if present
  if (config.url) {
    config.url = config.url.replace(
      /api_key=[^&]*/g,
      'api_key=***REDACTED***'
    );
  }

  return config;
}

function sanitizeError(error) {
  if (!error) return error;

  const sanitized = { ...error };

  // Redact from error message
  if (sanitized.message) {
    sanitized.message = sanitized.message.replace(
      /api_key=[^&\s]*/g,
      'api_key=***REDACTED***'
    );
  }

  // Redact from config
  if (sanitized.config) {
    sanitized.config = sanitizeAxiosConfig(sanitized.config);
  }

  // Redact from response
  if (sanitized.response?.config) {
    sanitized.response.config = sanitizeAxiosConfig(sanitized.response.config);
  }

  return sanitized;
}

module.exports = { sanitizeAxiosConfig, sanitizeError };
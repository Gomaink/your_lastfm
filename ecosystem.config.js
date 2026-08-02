module.exports = {
  apps: [
    {
      name: "web-api",
      script: "src/api.js",
      autorestart: true,
      max_memory_restart: process.env.API_MAX_MEMORY || "512M",
      kill_timeout: 10000
    },
    {
      name: "sync-cron",
      script: "src/cron.js",
      autorestart: true,
      max_memory_restart: process.env.CRON_MAX_MEMORY || "256M",
      kill_timeout: 30000
    }
  ]
};

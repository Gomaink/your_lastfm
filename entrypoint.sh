#!/bin/sh

mkdir -p /app/data
[ ! -f /app/data/stats.db ] && touch /app/data/stats.db

echo "🔄 Running initial synchronization..."
node src/index.js

echo "🚀 Starting services (API + CRON)..."
pm2 start src/api.js --name "web-api"
pm2-runtime start src/cron.js --name "sync-cron"
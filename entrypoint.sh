#!/bin/sh
set -e

mkdir -p /app/data

echo "🔍 Checking database state..."
node src/initial-sync.js

echo "🚀 Starting services (API + CRON)..."
pm2 start src/api.js --name "web-api"
exec pm2-runtime start src/cron.js --name "sync-cron"

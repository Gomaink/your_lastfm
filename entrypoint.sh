#!/bin/sh

mkdir -p /app/data
[ ! -f /app/data/stats.db ] && touch /app/data/stats.db

echo "🔄 Step 1: Syncing scrobbles (index.js)..."
node src/index.js

echo "🚀 Step 2: Starting API in background (api.js)..."

pm2-runtime start src/api.js --name "my-api"
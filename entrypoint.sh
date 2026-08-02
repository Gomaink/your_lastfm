#!/bin/sh
set -eu

mkdir -p /app/data/covers/albums /app/data/image-cache

echo "🔍 Initializing database..."
node -e "require('./src/db').close()"

echo "🚀 Starting API and background synchronization..."
exec pm2-runtime ecosystem.config.js

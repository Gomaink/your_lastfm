#!/bin/sh

mkdir -p /app/data

if [ ! -f /app/data/stats.db ]; then
    touch /app/data/stats.db
    echo "🗄️ Arquivo stats.db criado com sucesso."
fi

echo "🔄 Iniciando sincronização de scrobbles..."
node src/index.js

echo "🚀 Iniciando API Web..."
exec node src/api.js
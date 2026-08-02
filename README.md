# YourLastFM

YourLastFM is a self-hosted Node.js dashboard that synchronizes your Last.fm scrobbles into SQLite, displays listening statistics, compares your taste with friends, and generates shareable recap images.

## Features

- Incremental Last.fm synchronization with a configurable overlap window.
- Automatic first full sync when the database is empty.
- Cross-process sync lock, progress reporting, retries, and a daily integrity check.
- Dashboard with top artists, albums, tracks, daily activity, account statistics, and recent scrobbles.
- Last.fm friends comparison with common artists, albums, and tracks, including resilient artwork and avatar fallbacks.
- Standard and Instagram Story recap images generated on the server.
- Automatic album/artist image lookup, persistent image cache, and manual album-cover uploads.
- CSV import and streaming CSV export.
- Persistent SQLite database and uploaded covers through the `data` volume.

## Requirements

- Docker and Docker Compose, or Node.js 22 with the native dependencies required by `canvas` and `better-sqlite3`.
- A Last.fm API key.

Create an API account at the Last.fm API website and copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

At minimum, configure:

```env
LASTFM_API_KEY=your_lastfm_api_key
LASTFM_USERNAME=your_lastfm_username
```

## Run with Docker Compose

```bash
docker compose up -d --build
```

Open:

```text
http://localhost:1533
```

The API starts immediately. Synchronization runs in a separate managed process, so a large initial history import does not keep the web interface offline.

Useful commands:

```bash
# Follow both API and synchronization logs
docker compose logs -f

# Rebuild after updating the source
docker compose up -d --build

# Stop the application without deleting ./data
docker compose down
```

Do not delete the local `data` directory unless you intentionally want to remove the SQLite database, uploaded covers, and downloaded share-image cache.

## Run without Docker

```bash
npm ci
npm start
```

Run the scheduler in another terminal:

```bash
npm run start:cron
```

Manual synchronization commands:

```bash
npm run sync
npm run sync:full
npm run sync:initial
```

## Configuration

The defaults are documented in `.env.example`.

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `1533` |
| `SYNC_CRON` | Incremental sync schedule | `*/5 * * * *` |
| `INTEGRITY_CRON` | Last.fm/local count check | `0 3 * * *` |
| `SYNC_OVERLAP_SECONDS` | Re-fetch window used to safely catch late scrobbles | `86400` |
| `LASTFM_REQUEST_DELAY_MS` | Delay between Last.fm history pages | `250` |
| `LASTFM_REQUEST_TIMEOUT_MS` | Last.fm request timeout | `15000` |
| `EXTERNAL_REQUEST_CONCURRENCY` | Concurrent metadata/image lookups | `4` |
| `FRIENDS_CACHE_TTL_MS` | In-memory cache lifetime for the Last.fm friends list | `300000` |
| `IMAGE_FAILURE_CACHE_MS` | Time before retrying an image lookup that returned nothing | `600000` |
| `METADATA_FAILURE_CACHE_MS` | Time before retrying missing track metadata | `600000` |
| `SHARE_IMAGE_CONCURRENCY` | Concurrent recap image loads | `4` |
| `SHARE_MAX_CONCURRENT` | Maximum simultaneous recap renders | `2` |
| `SHARE_IMAGE_MAX_BYTES` | Maximum downloaded image size | `10485760` |
| `CORS_ORIGIN` | Optional comma-separated external origins | empty |

## Data and backups

Persistent files are stored under `./data`:

```text
data/
├── stats.db
├── covers/
└── image-cache/
```

A basic backup can be made while the application is stopped:

```bash
docker compose down
cp -a data data-backup
```

SQLite uses WAL mode. When making a live filesystem-level backup, include `stats.db`, `stats.db-wal`, and `stats.db-shm`, or use SQLite's backup tooling.

## Validation

```bash
npm run check
npm test
npm audit
```

## License

MIT. See [LICENSE](LICENSE).

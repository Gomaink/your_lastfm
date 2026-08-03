# YourLastFM

YourLastFM is a self-hosted Node.js dashboard that synchronizes your Last.fm scrobbles into SQLite, displays listening statistics, compares your taste with friends, builds custom group leaderboards, and generates shareable recap images.

## Features

- Incremental Last.fm synchronization with a configurable overlap window.
- Automatic first full sync when the database is empty.
- Cross-process sync lock, resumable sync windows, progress reporting, retries, and a daily integrity check.
- Dashboard with top artists, albums, tracks, daily activity, previous-period trends, a local-time Listening Clock, account statistics, and recent scrobbles.
- Direct Last.fm links for artists, albums, and tracks.
- Persistent SQLite dashboard cache invalidated after syncs, imports, and manual cover changes.
- Last.fm friends comparison with common artists, albums, and tracks, including resilient artwork and avatar fallbacks.
- Custom local leaderboard groups with public Last.fm users, exact date ranges, member standings, combined artist/album/track charts, and top-track drill-downs.
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

Use the published image:

```bash
docker compose pull
docker compose up -d
```

Or build the current source locally:

```bash
docker compose up -d --build
```

Open:

```text
http://localhost:1533
```

The API starts immediately. Synchronization runs in a separate managed process, so a large initial history import does not keep the web interface offline. If a Last.fm page keeps failing after all retries, the original `from`/`to` window is persisted and retried on the next run instead of advancing past the missing page.

Useful commands:

```bash
# Follow both API and synchronization logs
docker compose logs -f

# Rebuild after updating the source
docker compose up -d --build

# Stop the application without deleting ./data
docker compose down
```

The Docker image rebuilds `canvas` from source during every platform build. This avoids ARM64 prebuilt-library incompatibilities on Raspberry Pi 5 and other systems using 16 KB or 64 KB memory pages.

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
| `INTEGRITY_MISSING_THRESHOLD` | Missing scrobbles required before the integrity check starts a full repair sync | `1` |
| `SYNC_OVERLAP_SECONDS` | Re-fetch window used to safely catch late scrobbles | `86400` |
| `LASTFM_REQUEST_DELAY_MS` | Delay between Last.fm history pages | `250` |
| `LASTFM_REQUEST_TIMEOUT_MS` | Last.fm request timeout | `15000` |
| `DASHBOARD_CACHE_TTL_MS` | Persistent dashboard cache lifetime in milliseconds; `0` disables time-based expiry | `300000` |
| `STATIC_ASSET_CACHE_SECONDS` | Browser cache lifetime for local JavaScript, CSS, and images | `300` |
| `LEADERBOARD_CACHE_TTL_MS` | Persistent lifetime for generated leaderboard results; `0` disables time-based expiry | `900000` |
| `LEADERBOARD_PROFILE_TTL_MS` | Lifetime of cached Last.fm user profiles | `86400000` |
| `LEADERBOARD_ALBUM_TTL_MS` | Lifetime of cached album track lists | `2592000000` |
| `LEADERBOARD_REQUEST_CONCURRENCY` | Concurrent Last.fm requests while building group charts | `4` |
| `LEADERBOARD_MAX_GROUPS` | Maximum local leaderboard groups | `50` |
| `LEADERBOARD_MAX_MEMBERS` | Maximum Last.fm users in one group | `20` |
| `LEADERBOARD_MAX_RANGE_DAYS` | Maximum inclusive leaderboard date range | `366` |
| `EXTERNAL_REQUEST_CONCURRENCY` | Concurrent metadata/image lookups | `4` |
| `FRIENDS_CACHE_TTL_MS` | In-memory cache lifetime for the Last.fm friends list | `300000` |
| `IMAGE_FAILURE_CACHE_MS` | Time before retrying an image lookup that returned nothing | `600000` |
| `METADATA_FAILURE_CACHE_MS` | Time before retrying missing track metadata | `600000` |
| `SHARE_IMAGE_CONCURRENCY` | Concurrent recap image loads | `4` |
| `SHARE_MAX_CONCURRENT` | Maximum simultaneous recap renders | `2` |
| `SHARE_IMAGE_MAX_BYTES` | Maximum downloaded image size | `10485760` |
| `CORS_ORIGIN` | Optional comma-separated external origins | empty |

## Dashboard caching

The browser loads the main Dashboard through a single `/api/dashboard` request. The generated response is stored in SQLite, so reopening the Dashboard or returning to a previously used filter does not repeat the expensive aggregation and artwork lookups.

The cache is invalidated automatically when:

- a synchronization completes;
- a CSV import adds scrobbles;
- a manual album cover is changed.

Rolling periods compare against the immediately preceding equivalent window. The Listening Clock uses the timezone offset reported by the browser.

## Custom leaderboards

Open **Leaderboards** from the sidebar, create a group, and add at least two public Last.fm usernames. The username configured in `LASTFM_USERNAME` can be added with the **Add me** button.

Each group supports:

- 7, 30, 90, and 365-day presets;
- an inclusive custom date range;
- artist, album, and track rankings;
- member standings and per-item contribution counts;
- artist and album drill-downs for the group's most-played tracks;
- direct links to the corresponding Last.fm pages.

Groups and their caches are stored locally in `stats.db`; no separate account system or external YourLastFM service is involved. Last.fm requests are concurrency-limited, retried, and cached. If one member temporarily fails, the remaining data is still displayed as a partial result. Use **Refresh** to bypass the current chart cache.

## Data and backups

Persistent files are stored under `./data`:

```text
data/
├── stats.db        # scrobbles, settings, groups, and API caches
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

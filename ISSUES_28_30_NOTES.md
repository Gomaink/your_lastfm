# Issues #28 and #30 review

## Issue #28 — Incremental syncs missing scrobbles

The previous refactor already addressed most of the report:

- incremental requests use a fixed `to` timestamp, preventing pagination from shifting while new scrobbles arrive;
- a configurable overlap window re-fetches recent history;
- temporary HTTP 500/502/503/504 errors and Last.fm temporary API errors are retried;
- the scheduled integrity check compares the Last.fm `user.getInfo.playcount` with the local row count.

This revision closes the remaining failure mode. When a sync exhausts all retries after some pages have already been inserted, the exact `{ mode, from, to }` window is now saved in SQLite. The next scheduled sync resumes that same bounded window instead of calculating a newer `from` value from the partially updated database and potentially advancing past failed pages.

The integrity check threshold was also changed from a hard-coded difference greater than 25 to the configurable `INTEGRITY_MISSING_THRESHOLD`, with a default of 1. After a repair sync, the remaining difference is logged.

### Suggested issue comment

```text
Thanks for the detailed report — this is fixed in v1.1.3.

Incremental synchronization now uses a fixed `from`/`to` window, retries temporary Last.fm failures, and persists an unfinished window in SQLite. If a page still fails after all retries, the next scheduled run resumes the same bounded window instead of advancing from the newest partially imported scrobble.

There is also a scheduled integrity check based on `user.getInfo.playcount`. When the local database is behind, it starts a full repair sync. The missing-count threshold is configurable through `INTEGRITY_MISSING_THRESHOLD` and defaults to 1.

Please update to v1.1.3 and let me know if you can still reproduce any drift.
```

## Issue #30 — node-canvas on aarch64 / Raspberry Pi 5

The image already included the native build dependencies, but it did not explicitly prevent npm from selecting a prebuilt `canvas` binary. The Docker build now always runs:

```bash
npm rebuild canvas --build-from-source
```

The builder also includes `pkg-config`, the runtime includes `libpangocairo-1.0-0`, and the build performs `require('canvas')` as a smoke test. Because the release workflow builds both `linux/amd64` and `linux/arm64`, each platform now compiles and validates its own native module.

### Suggested issue comment

```text
Thanks for tracking this down and sharing the solution — this is fixed in v1.1.3.

The Dockerfile now installs the complete native toolchain and always runs `npm rebuild canvas --build-from-source`. It also loads `canvas` during the image build as a smoke test. The release workflow builds both `linux/amd64` and `linux/arm64`, so the ARM64 image is linked against the target image's Cairo libraries rather than relying on an incompatible prebuilt binary.

After updating, you can use the published image normally. For a local rebuild, run:

    docker compose build --no-cache
    docker compose up -d

Thanks again for the diagnosis.
```

## Files changed

- `src/sync.js`
- `src/utils/syncWindow.js`
- `src/integrity-check.js`
- `test/syncWindow.test.js`
- `Dockerfile`
- `.env.example`
- `README.md`
- `.github/workflows/docker-build.yml` (included in the complete package)

## Validation

- `npm run check`: passed
- `npm test`: 18/18 passed
- `npm audit --offline --omit=dev`: 0 vulnerabilities
- Compose and GitHub Actions YAML parsing: passed
- Docker image build: not executed because Docker is unavailable in this environment

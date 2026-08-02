# YourLastFM v1.2.0

## Dashboard trends

- Added comparison indicators for minutes listened, songs played, and daily average.
- Rolling filters compare against the immediately preceding equivalent period.
- Selected months and years compare against the previous calendar month or year.
- All-time and month-only-across-years views avoid misleading comparisons.

## Listening Clock

- Added a 24-hour listening activity chart.
- The chart uses the browser's local timezone.
- The busiest listening hour is highlighted and summarized above the chart.

## Last.fm links

- Top artists, albums, and tracks now link directly to their corresponding Last.fm pages.
- Links open in a separate tab without replacing the dashboard.

## Performance and caching

- Added a single cached `/api/dashboard` endpoint instead of five independent dashboard requests.
- Dashboard responses are cached persistently in SQLite and deduplicated while being generated.
- Cache entries are invalidated after synchronization, CSV import, or manual album-cover changes.
- External artwork and duration lookups share one global concurrency limit during dashboard generation.
- Static JavaScript, CSS, and image assets use configurable five-minute browser caching.
- Obsolete dashboard requests are cancelled when the user changes filters quickly.

## Configuration

```env
DASHBOARD_CACHE_TTL_MS=300000
STATIC_ASSET_CACHE_SECONDS=300
```

## Docker

```bash
docker pull gomaink/your-lastfm:1.2.0
```

Supported architectures:

- `linux/amd64`
- `linux/arm64`

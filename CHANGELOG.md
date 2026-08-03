# Changelog

All notable changes to YourLastFM are documented in this file.

## [1.3.0] - 2026-08-02

### Added

- Local custom leaderboard groups made from public Last.fm usernames.
- Preset and custom date ranges for artist, album, and track rankings.
- Per-member scrobble standings and combined group charts.
- Artist and album drill-down views showing the group's most-played tracks.
- Persistent SQLite caches for user profiles, charts, results, and album track lists.
- Configurable group, member, date-range, cache, and request-concurrency limits.

### Changed

- Last.fm leaderboard requests now use an identifiable application user agent.
- Leaderboard requests are deduplicated, concurrency-limited, retried, and served from stale cache after temporary failures.
- Reopening the Leaderboards page reuses the current state instead of immediately repeating all group requests.

### Fixed

- Preserved partial leaderboard results when one group member temporarily fails.
- Prevented invalid saved ranking types and unavailable date presets from breaking the interface.
- Kept the group modal save label correct when switching between create and edit modes.

## [1.2.0] - 2026-08-02

### Added

- Previous-period trends for dashboard summary metrics.
- Listening Clock chart with browser-local hour aggregation.
- Direct Last.fm links for artists, albums, and tracks.
- Persistent SQLite dashboard response cache.
- Configurable static-asset caching.

### Changed

- Dashboard data now loads through one combined API request.
- Artwork and duration enrichment now shares a single concurrency-limited queue.
- Changing dashboard filters cancels obsolete requests.
- Docker Compose can use the published image while retaining local build support.

### Fixed

- Prevented older, slower dashboard responses from overwriting newer filter selections.
- Invalidated dashboard cache after sync, CSV imports, and manual cover uploads.

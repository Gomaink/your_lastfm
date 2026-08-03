# YourLastFM v1.3.0

## Custom leaderboards

- Create local groups with two or more public Last.fm usernames.
- Add the account configured in `LASTFM_USERNAME` with one click.
- Edit or delete groups without leaving the Leaderboards page.
- Group definitions are stored in the existing SQLite database and remain inside the self-hosted instance.

## Flexible rankings

- Compare the last 7, 30, 90, or 365 days.
- Select an inclusive custom date range.
- Rank artists, albums, or tracks.
- See the total group scrobbles, participating members, current leader, and each member's contribution.
- Open Last.fm artist, album, track, and user pages directly from the results.

## Artist and album details

- Select an artist to see the group's most-played tracks by that artist.
- Select an album to see the group's most-played tracks from its Last.fm track list.
- Artwork uses the same resilient local image proxy and caches as the rest of YourLastFM.

## Reliability and performance

- Public user profiles are validated before a group is saved.
- Profile, chart, combined-result, and album-track-list data are cached persistently in SQLite.
- Concurrent requests are limited and identical in-flight requests are deduplicated.
- Temporary Last.fm failures can fall back to stale cached data.
- A single unavailable member produces a marked partial result instead of failing the whole group.
- Manual Refresh bypasses the active cache.

## Configuration

```env
LEADERBOARD_CACHE_TTL_MS=900000
LEADERBOARD_PROFILE_TTL_MS=86400000
LEADERBOARD_ALBUM_TTL_MS=2592000000
LEADERBOARD_REQUEST_CONCURRENCY=4
LEADERBOARD_MAX_GROUPS=50
LEADERBOARD_MAX_MEMBERS=20
LEADERBOARD_MAX_RANGE_DAYS=366
```

Set `LEADERBOARD_CACHE_TTL_MS=0` to keep generated chart results until they are manually refreshed or the group definition changes.

## Docker

```bash
docker pull gomaink/your-lastfm:1.3.0
```

Supported architectures:

- `linux/amd64`
- `linux/arm64`

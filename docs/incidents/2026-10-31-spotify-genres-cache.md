# Empty API responses overwrote cached Spotify genres

| | |
|---|---|
| Date | 2026-10-31 |
| Severity | Low (cosmetic gap on the public dashboard; no data loss outside a cache, no outage) |
| Status | Partially resolved |
| Fix | [PR #74](https://github.com/mattDev0/devops-control-center/pull/74) |

## Summary
The Spotify analytics service stopped displaying genres for top artists on the public guest dashboard. When Spotify returned an empty genre list for an artist, the service wrote that empty list to SQLite, overwriting previously cached genres and marking the artist as known so the backfill job never retried them. I updated the cache logic to ignore empty lists, filtered empty rows from backfill eligibility, and added a cache fallback when the live Spotify API omits genres.

## Impact
Visitors viewing the public dashboard saw empty genre labels beneath top artists. Listening history, play tracking, deduplication, and other dashboard panels were unaffected. There was no downtime and no data loss outside the local SQLite cache.

## Timeline
- 2026-09-01: Added the Spotify analytics service in commit 8de2dfc, caching artist genres in SQLite table `artist_genres`.
- 2026-10-31 (time unknown): Noticed while reviewing the public guest view that top artists showed no genres. When this started is unknown.
- 2026-10-31 13:57 UTC: Merged fix in [PR #74](https://github.com/mattDev0/devops-control-center/pull/74) (commit 8387a13).
- 2026-10-31 14:09 UTC: Production deployment [run 41207881300](https://github.com/mattDev0/devops-control-center/actions/runs/41207881300) succeeded.
- 2026-10-31 14:37 UTC: Live verification showed partial recovery; 16 of 50 all-time artists showed genres, but the four-week top five remained empty.
- 2026-10-31 16:30 UTC: Production log review over two hours showed 0 genre lookup failures across 3 polling cycles, confirming Spotify returned no genres for those artists.

## Root cause
Two distinct issues reinforced each other:

1. When Spotify returned an artist without genres, `cache_genres` wrote that empty slice with `INSERT OR REPLACE`, overwriting valid cached genres:
```rust
// Before: empty genre slices replaced existing data
pub fn cache_genres(db: &Db, artist_id: &str, genres: &[String]) -> rusqlite::Result<()> {
    let conn = db.lock().expect("db mutex");
    conn.execute(
        "INSERT INTO artist_genres (artist_id, genres, fetched_at)
         VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(artist_id) DO UPDATE SET genres = excluded.genres, fetched_at = excluded.fetched_at",
        params![artist_id, genres.join(",")],
    )?;
    Ok(())
}
```

2. The backfill job used `known_genre_artists` (`SELECT artist_id FROM artist_genres`) to decide which artists to skip. An artist with an empty genre row counted as known, so the backfill job never requested genres for them again. The bad data could never repair itself.

## Fix
In [PR #74](https://github.com/mattDev0/devops-control-center/pull/74) (which also included an unrelated one-line phone header layout fix), I implemented four changes:

1. Guarded `cache_genres` in [apps/spotify-service/src/db.rs](../../apps/spotify-service/src/db.rs) with an early return if the genre slice is empty:
```rust
// After: never overwrite cached data with an empty slice
pub fn cache_genres(db: &Db, artist_id: &str, genres: &[String]) -> rusqlite::Result<()> {
    if genres.is_empty() {
        return Ok(());
    }
    // ...
```

2. Changed `known_genre_artists` to query `WHERE genres <> ''`, skipping only artists with valid cached data.

3. Added `artist_genre_map` and a `fill_missing_genres` helper in [apps/spotify-service/src/main.rs](../../apps/spotify-service/src/main.rs). When Spotify omits genres in its live response, the API fills them from the cache.

4. Updated [apps/frontend/src/components/spotify/TopList.jsx](../../apps/frontend/src/components/spotify/TopList.jsx) so artists without genres hide the genre line instead of rendering a placeholder.

## Verification
- Unit tests: Added tests in `apps/spotify-service/src/db.rs` verifying that empty lists do not overwrite cached rows, empty rows are omitted from `known_genre_artists`, and `artist_genre_map` parses rows correctly. Added tests in `apps/spotify-service/src/main.rs` for `fill_missing_genres`.
- Frontend test: Added `apps/frontend/src/__tests__/TopList.test.jsx` verifying the UI hides genre lines when none exist.
- Deployment: Deploy [run 41207881300](https://github.com/mattDev0/devops-control-center/actions/runs/41207881300) succeeded at 14:09 UTC.
- Live check: At 14:37 UTC, the cache fallback worked for 16 of 50 all-time (`long_term`) top artists, but the four-week top five remained empty 29 minutes after deploy.
- Log investigation: Production logs showed 0 "genre lookup failed" messages over 2 hours across 3 successful polls. The Spotify `/artists?ids` lookup succeeded but returned no genres for those artists. The remaining gap is on Spotify's side and cannot be fixed from this cache. I decided against adding a second genre source for this panel; the UI simply displays the artist name.

## What I learned
- Never allow an empty upstream response to overwrite valid cached data.
- In repair jobs, "already processed" must check for useful data (`WHERE genres <> ''`) rather than row existence, or corrupted records cannot heal.
- Verify live after every deploy: tests passed, but the live check showed recovery was partial and proved the remaining issue was upstream.

## Open items
- Genres for the four-week top artists depend on Spotify returning them; not fixable from this cache.

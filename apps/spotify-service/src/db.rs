use rusqlite::{params, Connection};
use std::sync::{Arc, Mutex};

use crate::models::{Bucket, DiscoveryStats, GenreSlice, Overview, Play};

pub type Db = Arc<Mutex<Connection>>;

pub fn open(path: &str) -> rusqlite::Result<Db> {
    let conn = Connection::open(path)?;
    // WAL keeps the poller's writes from blocking dashboard reads.
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS plays (
            track_id    TEXT NOT NULL,
            track_name  TEXT NOT NULL,
            artist_id   TEXT NOT NULL,
            artist_name TEXT NOT NULL,
            album_art   TEXT,
            duration_ms INTEGER NOT NULL,
            played_at   TEXT NOT NULL,
            PRIMARY KEY (track_id, played_at)
         );
         CREATE INDEX IF NOT EXISTS idx_plays_played_at ON plays(played_at);
         CREATE INDEX IF NOT EXISTS idx_plays_artist    ON plays(artist_id);

         CREATE TABLE IF NOT EXISTS artist_genres (
            artist_id  TEXT PRIMARY KEY,
            genres     TEXT NOT NULL,
            fetched_at TEXT NOT NULL
         );",
    )?;
    Ok(Arc::new(Mutex::new(conn)))
}

/// Returns how many rows were new. The recently-played endpoint returns
/// overlapping windows, so most rows on most polls are already known.
pub fn insert_plays(db: &Db, plays: &[Play]) -> rusqlite::Result<usize> {
    let mut conn = db.lock().expect("db mutex");
    let tx = conn.transaction()?;
    let mut inserted = 0usize;
    {
        let mut stmt = tx.prepare(
            "INSERT OR IGNORE INTO plays
             (track_id, track_name, artist_id, artist_name, album_art, duration_ms, played_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )?;
        for p in plays {
            inserted += stmt.execute(params![
                p.track_id, p.track_name, p.artist_id, p.artist_name,
                p.album_art, p.duration_ms, p.played_at
            ])?;
        }
    }
    tx.commit()?;
    Ok(inserted)
}

pub fn overview(db: &Db) -> rusqlite::Result<Overview> {
    let conn = db.lock().expect("db mutex");
    conn.query_row(
        "SELECT MIN(played_at),
                COUNT(*),
                COALESCE(SUM(duration_ms), 0) / 60000.0,
                COUNT(DISTINCT track_id),
                COUNT(DISTINCT artist_id)
         FROM plays",
        [],
        |r| {
            Ok(Overview {
                tracked_since: r.get(0)?,
                total_plays: r.get(1)?,
                total_minutes: r.get(2)?,
                distinct_tracks: r.get(3)?,
                distinct_artists: r.get(4)?,
            })
        },
    )
}

/// Spotify timestamps are UTC. "When do I listen?" only means anything in the
/// listener's own time, so bucket against a configured offset. A fixed offset
/// is correct for zones without DST (WAT, for instance); somewhere with DST
/// would need a real timezone database.
fn local(column: &str) -> String {
    let hours: f64 = std::env::var("SPOTIFY_UTC_OFFSET_HOURS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0.0);
    format!("datetime({column}, '{hours:+} hours')")
}

/// Plays bucketed by local hour of day, 00..23.
pub fn by_hour(db: &Db) -> rusqlite::Result<Vec<Bucket>> {
    let expr = format!("strftime('%H', {})", local("played_at"));
    bucketed(db, &expr, 24, |i| format!("{i:02}"))
}

/// Plays bucketed by local weekday. SQLite's %w is 0=Sunday.
pub fn by_weekday(db: &Db) -> rusqlite::Result<Vec<Bucket>> {
    const DAYS: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let expr = format!("strftime('%w', {})", local("played_at"));
    bucketed(db, &expr, 7, |i| DAYS[i].to_string())
}

fn bucketed(
    db: &Db,
    expr: &str,
    slots: usize,
    label: impl Fn(usize) -> String,
) -> rusqlite::Result<Vec<Bucket>> {
    let conn = db.lock().expect("db mutex");
    let sql = format!(
        "SELECT CAST({expr} AS INTEGER) AS slot,
                COUNT(*),
                COALESCE(SUM(duration_ms), 0) / 60000.0
         FROM plays GROUP BY slot"
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut counts = vec![(0i64, 0f64); slots];
    let rows = stmt.query_map([], |r| {
        Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, f64>(2)?))
    })?;
    for row in rows {
        let (slot, plays, minutes) = row?;
        if let Some(entry) = counts.get_mut(slot as usize) {
            *entry = (plays, minutes);
        }
    }
    // Emit every slot, including empty ones, so the chart keeps a stable axis.
    Ok(counts
        .into_iter()
        .enumerate()
        .map(|(i, (plays, minutes))| Bucket { label: label(i), plays, minutes })
        .collect())
}

pub fn by_month(db: &Db) -> rusqlite::Result<Vec<Bucket>> {
    let conn = db.lock().expect("db mutex");
    let sql = format!(
        "SELECT strftime('%Y-%m', {}),
                COUNT(*),
                COALESCE(SUM(duration_ms), 0) / 60000.0
         FROM plays GROUP BY 1 ORDER BY 1",
        local("played_at")
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |r| {
        Ok(Bucket { label: r.get(0)?, plays: r.get(1)?, minutes: r.get(2)? })
    })?;
    rows.collect()
}

pub fn discovery(db: &Db) -> rusqlite::Result<DiscoveryStats> {
    let conn = db.lock().expect("db mutex");
    conn.query_row(
        "SELECT COUNT(DISTINCT track_id), COUNT(*) FROM plays",
        [],
        |r| {
            let distinct: i64 = r.get(0)?;
            let total: i64 = r.get(1)?;
            Ok(DiscoveryStats {
                distinct_tracks: distinct,
                total_plays: total,
                repeat_plays: total - distinct,
                discovery_ratio: if total > 0 { distinct as f64 / total as f64 } else { 0.0 },
            })
        },
    )
}

pub fn recent(db: &Db, limit: i64) -> rusqlite::Result<Vec<Play>> {
    let conn = db.lock().expect("db mutex");
    let mut stmt = conn.prepare(
        "SELECT track_id, track_name, artist_id, artist_name, album_art, duration_ms, played_at
         FROM plays ORDER BY played_at DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit], |r| {
        Ok(Play {
            track_id: r.get(0)?, track_name: r.get(1)?, artist_id: r.get(2)?,
            artist_name: r.get(3)?, album_art: r.get(4)?, duration_ms: r.get(5)?,
            played_at: r.get(6)?,
        })
    })?;
    rows.collect()
}

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

pub fn known_genre_artists(db: &Db) -> rusqlite::Result<Vec<String>> {
    let conn = db.lock().expect("db mutex");
    let mut stmt = conn.prepare("SELECT artist_id FROM artist_genres")?;
    let rows = stmt.query_map([], |r| r.get(0))?;
    rows.collect()
}

/// Genre distribution weighted by play count, joining stored plays to the
/// cached artist genres.
pub fn genre_breakdown(db: &Db, limit: i64) -> rusqlite::Result<Vec<GenreSlice>> {
    let conn = db.lock().expect("db mutex");
    let mut stmt = conn.prepare(
        "SELECT g.genres, COUNT(*) FROM plays p
         JOIN artist_genres g ON g.artist_id = p.artist_id
         GROUP BY p.artist_id",
    )?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?;

    let mut tally: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    for row in rows {
        let (genres, plays) = row?;
        for genre in genres.split(',').filter(|g| !g.is_empty()) {
            *tally.entry(genre.to_string()).or_insert(0) += plays;
        }
    }
    let mut out: Vec<GenreSlice> = tally
        .into_iter()
        .map(|(genre, count)| GenreSlice { genre, count })
        .collect();
    out.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.genre.cmp(&b.genre)));
    out.truncate(limit as usize);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Play;

    fn play(track: &str, at: &str) -> Play {
        Play {
            track_id: track.to_string(),
            track_name: format!("Track {track}"),
            artist_id: "artist1".to_string(),
            artist_name: "Artist One".to_string(),
            album_art: None,
            duration_ms: 180_000,
            played_at: at.to_string(),
        }
    }

    fn memdb() -> Db {
        open(":memory:").expect("open in-memory db")
    }

    /// The recently-played endpoint returns overlapping windows on every poll,
    /// so re-inserting the same play must not double count it.
    #[test]
    fn reinserting_the_same_play_is_ignored() {
        let db = memdb();
        let plays = vec![play("t1", "2026-09-01T10:00:00Z")];

        assert_eq!(insert_plays(&db, &plays).unwrap(), 1);
        assert_eq!(insert_plays(&db, &plays).unwrap(), 0, "second insert should be a no-op");
        assert_eq!(overview(&db).unwrap().total_plays, 1);
    }

    /// Same track at a different time is a genuinely separate play.
    #[test]
    fn same_track_at_a_new_time_counts_again() {
        let db = memdb();
        insert_plays(&db, &[play("t1", "2026-09-01T10:00:00Z")]).unwrap();
        insert_plays(&db, &[play("t1", "2026-09-01T11:00:00Z")]).unwrap();

        let o = overview(&db).unwrap();
        assert_eq!(o.total_plays, 2);
        assert_eq!(o.distinct_tracks, 1);
    }

    #[test]
    fn discovery_separates_repeats_from_distinct_tracks() {
        let db = memdb();
        insert_plays(&db, &[
            play("t1", "2026-09-01T10:00:00Z"),
            play("t1", "2026-09-01T11:00:00Z"),
            play("t2", "2026-09-01T12:00:00Z"),
        ]).unwrap();

        let d = discovery(&db).unwrap();
        assert_eq!(d.total_plays, 3);
        assert_eq!(d.distinct_tracks, 2);
        assert_eq!(d.repeat_plays, 1);
    }

    /// Empty slots must still be emitted so the chart keeps a stable axis.
    #[test]
    fn hour_buckets_cover_the_whole_day() {
        let db = memdb();
        insert_plays(&db, &[play("t1", "2026-09-01T10:00:00Z")]).unwrap();

        let buckets = by_hour(&db).unwrap();
        assert_eq!(buckets.len(), 24);
        assert_eq!(buckets.iter().map(|b| b.plays).sum::<i64>(), 1);
    }

    #[test]
    fn weekday_buckets_cover_the_whole_week() {
        let db = memdb();
        assert_eq!(by_weekday(&db).unwrap().len(), 7);
    }

    #[test]
    fn genre_breakdown_weights_by_play_count() {
        let db = memdb();
        insert_plays(&db, &[
            play("t1", "2026-09-01T10:00:00Z"),
            play("t2", "2026-09-01T11:00:00Z"),
        ]).unwrap();
        cache_genres(&db, "artist1", &["indie folk".into(), "folk".into()]).unwrap();

        let genres = genre_breakdown(&db, 10).unwrap();
        assert_eq!(genres.len(), 2);
        assert!(genres.iter().all(|g| g.count == 2), "both genres carry the artist's two plays");
    }
}

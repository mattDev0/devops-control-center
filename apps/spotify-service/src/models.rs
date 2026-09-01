use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    #[serde(default)]
    pub scope: String,
    #[serde(default)]
    pub expires_in: u64,
}

/// One play, as stored. `played_at` is the Spotify timestamp in RFC3339 UTC and
/// forms the dedupe key together with the track: the recently-played endpoint
/// returns overlapping windows on every poll.
#[derive(Debug, Clone, Serialize)]
pub struct Play {
    pub track_id: String,
    pub track_name: String,
    pub artist_id: String,
    pub artist_name: String,
    pub album_art: Option<String>,
    pub duration_ms: i64,
    pub played_at: String,
}

#[derive(Debug, Serialize)]
pub struct TopArtist {
    pub id: String,
    pub name: String,
    pub image: Option<String>,
    pub genres: Vec<String>,
    pub popularity: i64,
}

#[derive(Debug, Serialize)]
pub struct TopTrack {
    pub id: String,
    pub name: String,
    pub artist: String,
    pub album_art: Option<String>,
    pub popularity: i64,
}

#[derive(Debug, Serialize)]
pub struct GenreSlice {
    pub genre: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct Bucket {
    pub label: String,
    pub plays: i64,
    pub minutes: f64,
}

#[derive(Debug, Serialize)]
pub struct DiscoveryStats {
    pub distinct_tracks: i64,
    pub total_plays: i64,
    pub repeat_plays: i64,
    pub discovery_ratio: f64,
}

#[derive(Debug, Serialize)]
pub struct Overview {
    pub tracked_since: Option<String>,
    pub total_plays: i64,
    pub total_minutes: f64,
    pub distinct_tracks: i64,
    pub distinct_artists: i64,
}

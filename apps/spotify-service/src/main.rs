use axum::{
    extract::{Path, Query, State},
    http::{Request, StatusCode},
    middleware::{self, Next},
    response::Response,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;
use std::{
    collections::{HashMap, HashSet},
    net::SocketAddr,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::RwLock;

mod db;
mod models;
mod spotify;

use db::Db;
use spotify::Spotify;

const POLL_INTERVAL: Duration = Duration::from_secs(20 * 60);
const GENRE_BATCH: usize = 50;
const TOP_CACHE_TTL: Duration = Duration::from_secs(10 * 60);
const TOP_CACHE_MAX_STALE: Duration = Duration::from_secs(24 * 60 * 60);
type TopCacheKey = (String, String, u32);
type TopCache = Arc<RwLock<HashMap<TopCacheKey, (serde_json::Value, Instant)>>>;

#[derive(Clone)]
struct AppState {
    db: Db,
    spotify: Arc<Spotify>,
    service_key: String,
    top_cache: TopCache,
}

/// A blank key would match a request with no key at all, so refuse to start without one.
fn require_service_key(value: Option<String>) -> String {
    match value {
        Some(key) if !key.trim().is_empty() => key,
        _ => panic!("SPOTIFY_SERVICE_KEY must be set and non-empty"),
    }
}

async fn auth(
    State(state): State<AppState>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let presented = req
        .headers()
        .get("X-Service-Key")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();
    // Constant-time compare so a wrong key leaks nothing through timing.
    if !state.service_key.is_empty()
        && presented.len() == state.service_key.len()
        && presented
            .bytes()
            .zip(state.service_key.bytes())
            .fold(0u8, |acc, (a, b)| acc | (a ^ b))
            == 0
    {
        return Ok(next.run(req).await);
    }
    Err(StatusCode::UNAUTHORIZED)
}

fn map_err(e: String) -> (StatusCode, Json<serde_json::Value>) {
    tracing::error!(error = %e, "spotify request failed");
    (StatusCode::BAD_GATEWAY, Json(json!({ "error": e })))
}

fn db_err(e: rusqlite::Error) -> (StatusCode, Json<serde_json::Value>) {
    tracing::error!(error = %e, "database query failed");
    (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
}

#[derive(Deserialize)]
struct RangeQuery {
    #[serde(default = "default_range")]
    range: String,
    #[serde(default = "default_limit")]
    limit: u32,
}
fn default_range() -> String { "medium_term".to_string() }
fn default_limit() -> u32 { 20 }

/// Spotify rejects anything outside these three, so validate rather than
/// forwarding whatever arrives in the query string.
fn valid_range(range: &str) -> Option<&'static str> {
    match range {
        "short_term" => Some("short_term"),
        "medium_term" => Some("medium_term"),
        "long_term" => Some("long_term"),
        _ => None,
    }
}

/// Spotify can omit genres from top artists, so fall back to the cached lookup.
fn fill_missing_genres(artists: &mut [models::TopArtist], cached: &HashMap<String, Vec<String>>) {
    for artist in artists.iter_mut().filter(|a| a.genres.is_empty()) {
        if let Some(genres) = cached.get(&artist.id) {
            artist.genres = genres.clone();
        }
    }
}

async fn top(
    State(state): State<AppState>,
    Path(kind): Path<String>,
    Query(q): Query<RangeQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let range = valid_range(&q.range).ok_or_else(|| {
        (StatusCode::BAD_REQUEST, Json(json!({ "error": "range must be short_term, medium_term or long_term" })))
    })?;
    let limit = q.limit.clamp(1, 50);

    if kind != "artists" && kind != "tracks" {
        return Err((StatusCode::BAD_REQUEST, Json(json!({ "error": "kind must be artists or tracks" }))));
    }

    let key = (kind.clone(), range.to_string(), limit);
    if let Some((cached_value, cached_at)) = state.top_cache.read().await.get(&key) {
        if cached_at.elapsed() < TOP_CACHE_TTL {
            return Ok(Json(cached_value.clone()));
        }
    }

    let res = match kind.as_str() {
        "artists" => match state.spotify.top_artists(range, limit).await {
            Ok(mut artists) => {
                // Opportunistically warm the genre cache from data we already have.
                for a in &artists {
                    let _ = db::cache_genres(&state.db, &a.id, &a.genres);
                }
                let cached = db::artist_genre_map(&state.db).unwrap_or_default();
                fill_missing_genres(&mut artists, &cached);
                Ok(json!(artists))
            }
            Err(e) => Err(map_err(e)),
        },
        "tracks" => match state.spotify.top_tracks(range, limit).await {
            Ok(tracks) => Ok(json!(tracks)),
            Err(e) => Err(map_err(e)),
        },
        _ => unreachable!(),
    };

    match res {
        Ok(value) => {
            state.top_cache.write().await.insert(key, (value.clone(), Instant::now()));
            Ok(Json(value))
        }
        Err(err) => {
            if let Some((stale_value, cached_at)) = state.top_cache.read().await.get(&key) {
                if cached_at.elapsed() <= TOP_CACHE_MAX_STALE {
                    tracing::warn!(
                        kind = %kind,
                        range = %range,
                        limit = %limit,
                        staleness = ?cached_at.elapsed(),
                        "serving stale top data after spotify fetch failure"
                    );
                    return Ok(Json(stale_value.clone()));
                }
            }
            Err(err)
        }
    }
}

async fn overview(State(s): State<AppState>) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    Ok(Json(json!(db::overview(&s.db).map_err(db_err)?)))
}
async fn hourly(State(s): State<AppState>) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    Ok(Json(json!(db::by_hour(&s.db).map_err(db_err)?)))
}
async fn weekday(State(s): State<AppState>) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    Ok(Json(json!(db::by_weekday(&s.db).map_err(db_err)?)))
}
async fn monthly(State(s): State<AppState>) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    Ok(Json(json!(db::by_month(&s.db).map_err(db_err)?)))
}
async fn discovery(State(s): State<AppState>) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    Ok(Json(json!(db::discovery(&s.db).map_err(db_err)?)))
}
async fn genres(State(s): State<AppState>) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    Ok(Json(json!(db::genre_breakdown(&s.db, 12).map_err(db_err)?)))
}
async fn recent(State(s): State<AppState>) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    Ok(Json(json!(db::recent(&s.db, 30).map_err(db_err)?)))
}

async fn livez() -> Json<serde_json::Value> {
    Json(json!({ "status": "alive" }))
}

async fn health(State(s): State<AppState>) -> Json<serde_json::Value> {
    let (plays, since) = match db::overview(&s.db) {
        Ok(o) => (o.total_plays, o.tracked_since),
        Err(_) => (0, None),
    };
    Json(json!({ "status": "healthy", "tracked_plays": plays, "tracked_since": since }))
}

/// Poll recently-played and store anything new. Spotify only exposes the last
/// 50 plays, so this is the only way to accumulate history.
async fn poll_once(state: &AppState) {
    match state.spotify.recently_played(50).await {
        Ok(plays) if plays.is_empty() => tracing::debug!("no recent plays returned"),
        Ok(plays) => match db::insert_plays(&state.db, &plays) {
            Ok(new) => {
                tracing::info!(fetched = plays.len(), new, "recently-played polled");
                backfill_genres(state, &plays).await;
            }
            Err(e) => tracing::error!(error = %e, "failed to store plays"),
        },
        Err(e) => tracing::warn!(error = %e, "recently-played poll failed"),
    }
}

/// Look up genres for artists we have not seen before. Genres are effectively
/// static, so one lookup per artist is enough.
async fn backfill_genres(state: &AppState, plays: &[models::Play]) {
    let known: HashSet<String> = db::known_genre_artists(&state.db).unwrap_or_default().into_iter().collect();
    let missing: Vec<String> = plays
        .iter()
        .map(|p| p.artist_id.clone())
        .filter(|id| !id.is_empty() && !known.contains(id))
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    for chunk in missing.chunks(GENRE_BATCH) {
        match state.spotify.artist_genres(chunk).await {
            Ok(results) => {
                for (id, genres) in results {
                    let _ = db::cache_genres(&state.db, &id, &genres);
                }
            }
            Err(e) => tracing::warn!(error = %e, "genre lookup failed"),
        }
    }
}

fn router(state: AppState) -> Router {
    Router::new()
        .route("/overview", get(overview))
        .route("/top/{kind}", get(top))
        .route("/genres", get(genres))
        .route("/recent", get(recent))
        .route("/history/hourly", get(hourly))
        .route("/history/weekday", get(weekday))
        .route("/history/monthly", get(monthly))
        .route("/discovery", get(discovery))
        .route_layer(middleware::from_fn_with_state(state.clone(), auth))
        .route("/health", get(health))
        .route("/livez", get(livez))
        .with_state(state)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let db_path = std::env::var("SPOTIFY_DB_PATH").unwrap_or_else(|_| "/data/spotify.db".to_string());
    let db = db::open(&db_path).expect("failed to open the play database");

    let state = AppState {
        db,
        spotify: Arc::new(Spotify::new(
            std::env::var("SPOTIFY_CLIENT_ID").expect("SPOTIFY_CLIENT_ID must be set"),
            std::env::var("SPOTIFY_CLIENT_SECRET").expect("SPOTIFY_CLIENT_SECRET must be set"),
            std::env::var("SPOTIFY_REFRESH_TOKEN").expect("SPOTIFY_REFRESH_TOKEN must be set"),
        )),
        service_key: require_service_key(std::env::var("SPOTIFY_SERVICE_KEY").ok()),
        top_cache: Arc::new(RwLock::new(HashMap::new())),
    };

    let poller = state.clone();
    tokio::spawn(async move {
        loop {
            poll_once(&poller).await;
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    });

    let app = router(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3002));
    tracing::info!(%addr, db = %db_path, "spotify service listening");
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind 3002");
    axum::serve(listener, app).await.expect("server error");
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::Request;
    use tower::ServiceExt;

    fn hermetic_failing_spotify() -> Arc<Spotify> {
        Arc::new(Spotify::with_endpoints(
            String::new(),
            String::new(),
            String::new(),
            "http://127.0.0.1:1/v1".to_string(),
            "http://127.0.0.1:1/token".to_string(),
        ))
    }

    async fn spawn_mock_spotify() -> (Arc<Spotify>, tokio::task::JoinHandle<()>) {
        let mock_app = Router::new()
            .route(
                "/token",
                axum::routing::post(|| async {
                    Json(json!({
                        "access_token": "mock_token",
                        "token_type": "Bearer",
                        "expires_in": 3600,
                        "scope": "user-top-read"
                    }))
                }),
            )
            .route(
                "/v1/me/top/artists",
                axum::routing::get(|| async {
                    Json(json!({
                        "items": [
                            {
                                "id": "fresh_artist",
                                "name": "Fresh Artist",
                                "images": [{"url": "http://img.test"}],
                                "genres": ["rock"],
                                "popularity": 90
                            }
                        ]
                    }))
                }),
            );

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = tokio::spawn(async move {
            let _ = axum::serve(listener, mock_app).await;
        });

        let spotify = Arc::new(Spotify::with_endpoints(
            "client_id".to_string(),
            "client_secret".to_string(),
            "refresh_token".to_string(),
            format!("http://{addr}/v1"),
            format!("http://{addr}/token"),
        ));

        (spotify, handle)
    }

    /// Builds the real router, so a route that axum rejects (such as the
    /// pre-0.8 `/:param` syntax, which panics) fails here rather than at startup.
    #[tokio::test]
    async fn test_router_matches_path_parameters() {
        let app = router(AppState {
            db: db::open(":memory:").unwrap(),
            spotify: hermetic_failing_spotify(),
            service_key: "key".to_string(),
            top_cache: Arc::new(RwLock::new(HashMap::new())),
        });

        let req = Request::builder()
            // An invalid range is rejected before any Spotify API call.
            .uri("/top/artists?range=bogus")
            .header("X-Service-Key", "key")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        // 400 comes from the handler, so the path matched (unmatched is 404).
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn fill_missing_genres_fills_empty_and_preserves_existing() {
        let mut artists = vec![
            models::TopArtist {
                id: "a1".to_string(),
                name: "Artist One".to_string(),
                image: None,
                genres: vec![],
                popularity: 50,
            },
            models::TopArtist {
                id: "a2".to_string(),
                name: "Artist Two".to_string(),
                image: None,
                genres: vec!["existing".to_string()],
                popularity: 60,
            },
        ];

        let mut cached = HashMap::new();
        cached.insert("a1".to_string(), vec!["cached_genre".to_string()]);
        cached.insert("a2".to_string(), vec!["different_genre".to_string()]);

        fill_missing_genres(&mut artists, &cached);

        assert_eq!(artists[0].genres, vec!["cached_genre".to_string()]);
        assert_eq!(artists[1].genres, vec!["existing".to_string()]);
    }

    #[test]
    fn require_service_key_accepts_non_empty() {
        assert_eq!(require_service_key(Some("k".into())), "k");
    }

    #[test]
    #[should_panic(expected = "SPOTIFY_SERVICE_KEY must be set and non-empty")]
    fn require_service_key_panics_on_none() {
        require_service_key(None);
    }

    #[test]
    #[should_panic(expected = "SPOTIFY_SERVICE_KEY must be set and non-empty")]
    fn require_service_key_panics_on_empty() {
        require_service_key(Some(String::new()));
    }

    #[test]
    #[should_panic(expected = "SPOTIFY_SERVICE_KEY must be set and non-empty")]
    fn require_service_key_panics_on_whitespace() {
        require_service_key(Some("  ".into()));
    }

    #[tokio::test]
    async fn test_blank_configured_key_rejects_unauthenticated_request() {
        let app = router(AppState {
            db: db::open(":memory:").unwrap(),
            spotify: hermetic_failing_spotify(),
            service_key: String::new(),
            top_cache: Arc::new(RwLock::new(HashMap::new())),
        });

        let req = Request::builder()
            .uri("/top/artists?range=bogus")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn top_serves_fresh_cache_entry_without_calling_spotify() {
        let expected = json!([{"id": "fresh_cached", "name": "Cached Artist"}]);
        let top_cache = Arc::new(RwLock::new(HashMap::new()));
        top_cache.write().await.insert(
            ("artists".to_string(), "short_term".to_string(), 5),
            (expected.clone(), Instant::now()),
        );

        let app = router(AppState {
            db: db::open(":memory:").unwrap(),
            spotify: hermetic_failing_spotify(),
            service_key: "key".to_string(),
            top_cache,
        });

        let req = Request::builder()
            .uri("/top/artists?range=short_term&limit=5")
            .header("X-Service-Key", "key")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body_bytes = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(body, expected);
    }

    #[tokio::test]
    async fn top_bypasses_expired_cache_entry() {
        let (spotify, handle) = spawn_mock_spotify().await;
        let stale = json!([{"id": "stale_cached", "name": "Stale Artist"}]);
        let top_cache = Arc::new(RwLock::new(HashMap::new()));
        top_cache.write().await.insert(
            ("artists".to_string(), "short_term".to_string(), 5),
            (stale, Instant::now() - TOP_CACHE_TTL - Duration::from_secs(1)),
        );

        let app = router(AppState {
            db: db::open(":memory:").unwrap(),
            spotify,
            service_key: "key".to_string(),
            top_cache,
        });

        let req = Request::builder()
            .uri("/top/artists?range=short_term&limit=5")
            .header("X-Service-Key", "key")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body_bytes = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(body[0]["name"], "Fresh Artist");
        handle.abort();
    }

    #[tokio::test]
    async fn top_serves_stale_cache_on_spotify_failure() {
        let stale = json!([{"id": "stale_1", "name": "Stale Artist", "genres": ["jazz"], "popularity": 60}]);
        let top_cache = Arc::new(RwLock::new(HashMap::new()));
        top_cache.write().await.insert(
            ("artists".to_string(), "short_term".to_string(), 5),
            (stale.clone(), Instant::now() - TOP_CACHE_TTL - Duration::from_secs(60)),
        );

        let app = router(AppState {
            db: db::open(":memory:").unwrap(),
            spotify: hermetic_failing_spotify(),
            service_key: "key".to_string(),
            top_cache,
        });

        let req = Request::builder()
            .uri("/top/artists?range=short_term&limit=5")
            .header("X-Service-Key", "key")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body_bytes = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(body, stale);
    }

    #[tokio::test]
    async fn top_rejects_stale_cache_older_than_24_hours_on_failure() {
        let stale = json!([{"id": "stale_old", "name": "Ancient Artist", "genres": ["blues"], "popularity": 40}]);
        let top_cache = Arc::new(RwLock::new(HashMap::new()));
        // 25 hours old (> 24 hour limit)
        top_cache.write().await.insert(
            ("artists".to_string(), "short_term".to_string(), 5),
            (stale, Instant::now() - Duration::from_secs(25 * 3600)),
        );

        let app = router(AppState {
            db: db::open(":memory:").unwrap(),
            spotify: hermetic_failing_spotify(),
            service_key: "key".to_string(),
            top_cache,
        });

        let req = Request::builder()
            .uri("/top/artists?range=short_term&limit=5")
            .header("X-Service-Key", "key")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::BAD_GATEWAY);
    }

    #[tokio::test]
    async fn top_returns_bad_gateway_when_no_cache_and_spotify_fails() {
        let top_cache = Arc::new(RwLock::new(HashMap::new()));

        let app = router(AppState {
            db: db::open(":memory:").unwrap(),
            spotify: hermetic_failing_spotify(),
            service_key: "key".to_string(),
            top_cache,
        });

        let req = Request::builder()
            .uri("/top/artists?range=short_term&limit=5")
            .header("X-Service-Key", "key")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::BAD_GATEWAY);
    }
}

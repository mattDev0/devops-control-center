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
use std::{collections::HashSet, net::SocketAddr, sync::Arc, time::Duration};

mod db;
mod models;
mod spotify;

use db::Db;
use spotify::Spotify;

const POLL_INTERVAL: Duration = Duration::from_secs(20 * 60);
const GENRE_BATCH: usize = 50;

#[derive(Clone)]
struct AppState {
    db: Db,
    spotify: Arc<Spotify>,
    service_key: String,
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
    if presented.len() == state.service_key.len()
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

async fn top(
    State(state): State<AppState>,
    Path(kind): Path<String>,
    Query(q): Query<RangeQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let range = valid_range(&q.range).ok_or_else(|| {
        (StatusCode::BAD_REQUEST, Json(json!({ "error": "range must be short_term, medium_term or long_term" })))
    })?;
    let limit = q.limit.clamp(1, 50);

    match kind.as_str() {
        "artists" => {
            let artists = state.spotify.top_artists(range, limit).await.map_err(map_err)?;
            // Opportunistically warm the genre cache from data we already have.
            for a in &artists {
                let _ = db::cache_genres(&state.db, &a.id, &a.genres);
            }
            Ok(Json(json!(artists)))
        }
        "tracks" => Ok(Json(json!(
            state.spotify.top_tracks(range, limit).await.map_err(map_err)?
        ))),
        _ => Err((StatusCode::BAD_REQUEST, Json(json!({ "error": "kind must be artists or tracks" })))),
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
        service_key: std::env::var("SPOTIFY_SERVICE_KEY").expect("SPOTIFY_SERVICE_KEY must be set"),
    };

    let poller = state.clone();
    tokio::spawn(async move {
        loop {
            poll_once(&poller).await;
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    });

    let app = Router::new()
        .route("/overview", get(overview))
        .route("/top/:kind", get(top))
        .route("/genres", get(genres))
        .route("/recent", get(recent))
        .route("/history/hourly", get(hourly))
        .route("/history/weekday", get(weekday))
        .route("/history/monthly", get(monthly))
        .route("/discovery", get(discovery))
        .route_layer(middleware::from_fn_with_state(state.clone(), auth))
        .route("/health", get(health))
        .route("/livez", get(livez))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3002));
    tracing::info!(%addr, db = %db_path, "spotify service listening");
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind 3002");
    axum::serve(listener, app).await.expect("server error");
}

use base64::Engine;
use reqwest::Client;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

use crate::models::{Play, TokenResponse, TopArtist, TopTrack};

const API: &str = "https://api.spotify.com/v1";
const AUTH: &str = "https://accounts.spotify.com/api/token";
const TOKEN_MARGIN: Duration = Duration::from_secs(60);

pub struct Spotify {
    client: Client,
    client_id: String,
    client_secret: String,
    refresh_token: String,
    cached: RwLock<Option<(String, Instant)>>,
}

impl Spotify {
    pub fn new(client_id: String, client_secret: String, refresh_token: String) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(15))
                .build()
                .unwrap_or_default(),
            client_id,
            client_secret,
            refresh_token,
            cached: RwLock::new(None),
        }
    }

    /// Access tokens last an hour; hold one rather than trading the refresh
    /// token on every request.
    async fn access_token(&self) -> Result<String, String> {
        if let Some((token, expires_at)) = self.cached.read().await.clone() {
            if expires_at.saturating_duration_since(Instant::now()) > TOKEN_MARGIN {
                return Ok(token);
            }
        }

        let basic = base64::prelude::BASE64_STANDARD
            .encode(format!("{}:{}", self.client_id, self.client_secret));
        let resp = self
            .client
            .post(AUTH)
            .header("Authorization", format!("Basic {basic}"))
            .form(&[
                ("grant_type", "refresh_token"),
                ("refresh_token", self.refresh_token.as_str()),
            ])
            .send()
            .await
            .map_err(|e| format!("token request failed: {e}"))?;

        let status = resp.status();
        let body = resp.text().await.map_err(|e| format!("token body: {e}"))?;
        let parsed: TokenResponse = serde_json::from_str(&body)
            .map_err(|_| format!("token exchange rejected ({status}): {}", truncate(&body)))?;

        // Surface the granted scopes once per refresh. A silently narrowed
        // scope is what previously turned the portfolio's Spotify panel into a
        // permanent "Offline", so make it visible in the logs.
        tracing::info!(scope = %parsed.scope, "spotify access token refreshed");

        let lifetime = if parsed.expires_in == 0 { 3600 } else { parsed.expires_in };
        *self.cached.write().await =
            Some((parsed.access_token.clone(), Instant::now() + Duration::from_secs(lifetime)));
        Ok(parsed.access_token)
    }

    async fn get(&self, path: &str) -> Result<serde_json::Value, String> {
        let token = self.access_token().await?;
        let resp = self
            .client
            .get(format!("{API}/{path}"))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("GET {path} failed: {e}"))?;

        let status = resp.status();
        if status == reqwest::StatusCode::NO_CONTENT {
            return Ok(serde_json::Value::Null);
        }
        let body = resp.text().await.map_err(|e| format!("body of {path}: {e}"))?;
        if !status.is_success() {
            return Err(format!("GET {path} -> {status}: {}", truncate(&body)));
        }
        serde_json::from_str(&body).map_err(|e| format!("parse {path}: {e}"))
    }

    pub async fn recently_played(&self, limit: u32) -> Result<Vec<Play>, String> {
        let json = self.get(&format!("me/player/recently-played?limit={limit}")).await?;
        let items = json["items"].as_array().cloned().unwrap_or_default();
        Ok(items
            .iter()
            .filter_map(|item| {
                let track = &item["track"];
                let artist = &track["artists"][0];
                Some(Play {
                    track_id: track["id"].as_str()?.to_string(),
                    track_name: track["name"].as_str().unwrap_or("Unknown").to_string(),
                    artist_id: artist["id"].as_str().unwrap_or("").to_string(),
                    artist_name: artist["name"].as_str().unwrap_or("Unknown").to_string(),
                    album_art: track["album"]["images"][0]["url"].as_str().map(str::to_string),
                    duration_ms: track["duration_ms"].as_i64().unwrap_or(0),
                    played_at: item["played_at"].as_str()?.to_string(),
                })
            })
            .collect())
    }

    pub async fn top_artists(&self, range: &str, limit: u32) -> Result<Vec<TopArtist>, String> {
        let json = self
            .get(&format!("me/top/artists?time_range={range}&limit={limit}"))
            .await?;
        Ok(json["items"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .iter()
            .filter_map(|a| {
                Some(TopArtist {
                    id: a["id"].as_str()?.to_string(),
                    name: a["name"].as_str().unwrap_or("Unknown").to_string(),
                    image: a["images"][0]["url"].as_str().map(str::to_string),
                    genres: a["genres"]
                        .as_array()
                        .map(|g| g.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
                        .unwrap_or_default(),
                    popularity: a["popularity"].as_i64().unwrap_or(0),
                })
            })
            .collect())
    }

    pub async fn top_tracks(&self, range: &str, limit: u32) -> Result<Vec<TopTrack>, String> {
        let json = self
            .get(&format!("me/top/tracks?time_range={range}&limit={limit}"))
            .await?;
        Ok(json["items"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .iter()
            .filter_map(|t| {
                Some(TopTrack {
                    id: t["id"].as_str()?.to_string(),
                    name: t["name"].as_str().unwrap_or("Unknown").to_string(),
                    artist: t["artists"][0]["name"].as_str().unwrap_or("Unknown").to_string(),
                    album_art: t["album"]["images"][0]["url"].as_str().map(str::to_string),
                    popularity: t["popularity"].as_i64().unwrap_or(0),
                })
            })
            .collect())
    }

    /// Genres for up to 50 artists per call, which is the endpoint's limit.
    pub async fn artist_genres(&self, ids: &[String]) -> Result<Vec<(String, Vec<String>)>, String> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let json = self.get(&format!("artists?ids={}", ids.join(","))).await?;
        Ok(json["artists"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .iter()
            .filter_map(|a| {
                let id = a["id"].as_str()?.to_string();
                let genres = a["genres"]
                    .as_array()
                    .map(|g| g.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
                    .unwrap_or_default();
                Some((id, genres))
            })
            .collect())
    }
}

fn truncate(s: &str) -> String {
    let t = s.trim();
    match t.char_indices().nth(160) {
        Some((i, _)) => format!("{}...", &t[..i]),
        None => t.to_string(),
    }
}

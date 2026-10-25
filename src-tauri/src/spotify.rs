//! Importación de playlists de Spotify sin cuenta ni API oficial.
//!
//! Se usa la página de *embed* pública, que renderiza la playlist en el HTML
//! (`__NEXT_DATA__`) con título, portada y hasta 100 canciones. No hace falta
//! token: el endpoint `get_access_token` devuelve 403 desde 2025.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use futures_util::{stream, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::innertube;

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                  (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const EMBED: &str = "https://open.spotify.com/embed/playlist/";
/// Tope que devuelve el embed de Spotify en una sola página.
const EMBED_LIMIT: usize = 100;
/// Umbral para aceptar una coincidencia de YouTube Music.
const ACCEPT: f32 = 0.55;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportTrack {
    pub title: String,
    pub artist: String,
    #[serde(default)]
    pub album: Option<String>,
    #[serde(default)]
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedPlaylist {
    pub name: String,
    pub cover: Option<String>,
    pub total: usize,
    pub truncated: bool,
    pub tracks: Vec<ImportTrack>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportMatch {
    pub original: ImportTrack,
    pub track: Option<innertube::Track>,
    pub score: f32,
}

/// Acepta enlaces web, URIs de Spotify o el id pelado.
pub fn playlist_id(source: &str) -> Result<String, String> {
    let source = source.trim();
    if source.is_empty() {
        return Err("Pega el enlace de una playlist de Spotify".into());
    }

    let raw = if let Some(rest) = source.strip_prefix("spotify:playlist:") {
        rest.to_string()
    } else if let Some(pos) = source.find("/playlist/") {
        source[pos + "/playlist/".len()..]
            .split(['?', '#', '/'])
            .next()
            .unwrap_or_default()
            .to_string()
    } else {
        source.to_string()
    };

    let id = raw.trim().trim_end_matches('/').to_string();
    let valid = (12..=64).contains(&id.len()) && id.chars().all(|c| c.is_ascii_alphanumeric());
    if !valid {
        return Err(
            "Ese enlace no parece una playlist. Copia «open.spotify.com/playlist/…» o exporta el CSV."
                .into(),
        );
    }

    Ok(id)
}

fn next_data(html: &str) -> Option<&str> {
    const MARKER: &str = "<script id=\"__NEXT_DATA__\" type=\"application/json\">";
    let start = html.find(MARKER)? + MARKER.len();
    let rest = &html[start..];
    let end = rest.find("</script>")?;
    Some(rest[..end].trim())
}

fn track_from_item(item: &Value) -> Option<ImportTrack> {
    let title = item
        .get("title")
        .and_then(Value::as_str)
        .or_else(|| item.get("name").and_then(Value::as_str))?
        .trim()
        .to_string();
    if title.is_empty() {
        return None;
    }

    // Anuncios, episodios y filas vacías del embed no sirven.
    if let Some(kind) = item.get("entityType").and_then(Value::as_str) {
        if kind != "track" {
            return None;
        }
    }
    if item.get("isPlayable").and_then(Value::as_bool) == Some(false) {
        return None;
    }

    let artist = item
        .get("subtitle")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Desconocido")
        .to_string();

    Some(ImportTrack {
        title,
        artist,
        album: None,
        duration_ms: item.get("duration").and_then(Value::as_u64),
    })
}

pub async fn playlist(client: &reqwest::Client, source: &str) -> Result<ImportedPlaylist, String> {
    let id = playlist_id(source)?;

    let res = client
        .get(format!("{EMBED}{id}"))
        .header("User-Agent", UA)
        .header("Accept-Language", "es-ES,es;q=0.9")
        .send()
        .await
        .map_err(|e| format!("No se pudo abrir Spotify: {e}"))?;

    if !res.status().is_success() {
        return Err(format!(
            "Spotify respondió HTTP {}. Prueba con el enlace público o sube el CSV.",
            res.status()
        ));
    }

    let html = res
        .text()
        .await
        .map_err(|e| format!("Respuesta de Spotify ilegible: {e}"))?;

    let data: Value = next_data(&html)
        .ok_or_else(|| "Spotify cambió el formato de la página: usa el CSV de Exportify.".to_string())?
        .parse()
        .map_err(|e| format!("No se pudo leer la playlist: {e}"))?;

    let page_props = &data["props"]["pageProps"];
    if page_props["status"].as_u64().unwrap_or(0) >= 400 {
        return Err(
            "No se encontró esa playlist. Comprueba que sea pública (las privadas no se pueden importar)."
                .into(),
        );
    }

    let entity = &page_props["state"]["data"]["entity"];
    let raw_tracks = entity["trackList"]
        .as_array()
        .ok_or_else(|| "Esa playlist no tiene canciones visibles o es privada.".to_string())?;

    let tracks: Vec<ImportTrack> = raw_tracks.iter().filter_map(track_from_item).collect();
    if tracks.is_empty() {
        return Err("La playlist no tiene canciones que se puedan importar.".into());
    }

    let name = entity["name"]
        .as_str()
        .or_else(|| entity["title"].as_str())
        .unwrap_or("Playlist de Spotify")
        .trim()
        .to_string();

    let cover = entity["coverArt"]["sources"]
        .as_array()
        .and_then(|sources| sources.first())
        .and_then(|s| s["url"].as_str())
        .map(str::to_string);

    Ok(ImportedPlaylist {
        name,
        cover,
        total: tracks.len(),
        truncated: raw_tracks.len() >= EMBED_LIMIT,
        tracks,
    })
}

/// Título sin «(feat. …)» ni sufijos de edición, para reintentar la búsqueda.
fn query_title(title: &str) -> String {
    let mut out = String::new();
    let mut depth = 0i32;
    for ch in title.chars() {
        match ch {
            '(' | '[' => depth += 1,
            ')' | ']' => depth = (depth - 1).max(0),
            _ if depth > 0 => {}
            _ => out.push(ch),
        }
    }

    let trimmed = out
        .split(" - ")
        .next()
        .unwrap_or_default()
        .trim()
        .to_string();
    if trimmed.is_empty() {
        title.trim().to_string()
    } else {
        trimmed
    }
}

fn score(original: &ImportTrack, candidate: &innertube::Track) -> f32 {
    let title = innertube::text_score(
        &innertube::normalize(&original.title),
        &innertube::normalize(&candidate.title),
    );
    if title < 0.2 {
        return 0.0;
    }

    let artist = innertube::artist_score(&original.artist, &candidate.artist);

    match (original.duration_ms, candidate.duration_sec) {
        (Some(ms), secs) if secs > 0 => {
            let diff = ((ms / 1000) as i64 - secs as i64).abs();
            let duration = if diff <= 3 {
                1.0
            } else if diff <= 10 {
                0.6
            } else {
                0.0
            };
            0.55 * title + 0.3 * artist + 0.15 * duration
        }
        _ => 0.65 * title + 0.35 * artist,
    }
}

async fn best_match(
    client: &reqwest::Client,
    original: &ImportTrack,
    query: &str,
) -> Option<(f32, innertube::Track)> {
    let found = innertube::search(client, query).await.ok()?;
    let mut best: Option<(f32, innertube::Track)> = None;
    for track in found {
        let value = score(original, &track);
        if best.as_ref().map_or(true, |(top, _)| value > *top) {
            best = Some((value, track));
        }
    }
    best
}

async fn match_one(client: &reqwest::Client, original: ImportTrack) -> ImportMatch {
    let query = format!("{} {}", original.title, original.artist);
    let mut best = best_match(client, &original, query.trim()).await;

    // Si no convence, se reintenta solo con el título limpio.
    if best.as_ref().map(|(s, _)| *s).unwrap_or(0.0) < ACCEPT {
        let retry = query_title(&original.title);
        if !retry.is_empty() && retry != query.trim() {
            if let Some(candidate) = best_match(client, &original, &retry).await {
                if candidate.0 > best.as_ref().map(|(s, _)| *s).unwrap_or(0.0) {
                    best = Some(candidate);
                }
            }
        }
    }

    match best {
        Some((score, track)) if score >= ACCEPT => ImportMatch {
            original,
            track: Some(track),
            score,
        },
        _ => ImportMatch {
            original,
            track: None,
            score: best.map(|(s, _)| s).unwrap_or(0.0),
        },
    }
}

/// Busca cada canción en YouTube Music (3 en paralelo) y avisa del progreso.
pub async fn match_tracks(
    client: &reqwest::Client,
    tracks: Vec<ImportTrack>,
    app: &AppHandle,
) -> Vec<ImportMatch> {
    let total = tracks.len();
    if total == 0 {
        return Vec::new();
    }

    let done = Arc::new(AtomicUsize::new(0));
    let client = client.clone();
    let app = app.clone();

    let mut results: Vec<(usize, ImportMatch)> = stream::iter(tracks.into_iter().enumerate())
        .map(move |(index, original)| {
            let client = client.clone();
            let app = app.clone();
            let done = done.clone();
            async move {
                let item = match_one(&client, original).await;
                let count = done.fetch_add(1, Ordering::Relaxed) + 1;
                let _ = app.emit(
                    "import-progress",
                    json!({ "done": count, "total": total }),
                );
                (index, item)
            }
        })
        .buffer_unordered(3)
        .collect()
        .await;

    results.sort_by_key(|(index, _)| *index);
    results.into_iter().map(|(_, item)| item).collect()
}

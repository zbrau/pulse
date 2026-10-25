//! Proxy HTTP local con soporte de `Range`.
//!
//! El `<audio>` del WebView no puede leer googlevideo directamente (CORS + el
//! `Range` que necesita para el seek), así que se sirve el stream desde
//! 127.0.0.1 pasando la petición de rango tal cual.

use std::collections::{HashMap, HashSet};
use std::io::SeekFrom;
use std::path::PathBuf;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use futures_util::StreamExt;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio::sync::Mutex;
use tokio_util::io::ReaderStream;

use crate::downloads;
use crate::ytdlp::{self, Resolved};

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                  (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

pub struct AppState {
    pub client: reqwest::Client,
    pub ytdlp: Option<PathBuf>,
    pub base_url: String,
    pub downloads: PathBuf,
    pub downloading: std::sync::Mutex<HashSet<String>>,
    cache: Mutex<HashMap<String, Resolved>>,
}

impl AppState {
    pub fn new(
        client: reqwest::Client,
        ytdlp: Option<PathBuf>,
        base_url: String,
        downloads: PathBuf,
    ) -> Self {
        Self {
            client,
            ytdlp,
            base_url,
            downloads,
            downloading: std::sync::Mutex::new(HashSet::new()),
            cache: Mutex::new(HashMap::new()),
        }
    }

    /// Archivo ya descargado para escuchar sin conexión.
    pub fn offline_path(&self, id: &str) -> Option<PathBuf> {
        downloads::find_file(&self.downloads, id)
    }

    async fn cached(&self, id: &str) -> Option<Resolved> {
        let cache = self.cache.lock().await;
        cache
            .get(id)
            .filter(|r| r.expires_at > ytdlp::now_secs() + 60)
            .cloned()
    }

    async fn invalidate(&self, id: &str) {
        self.cache.lock().await.remove(id);
    }

    /// Resuelve (y cachea) la URL de audio del vídeo.
    pub async fn resolve(&self, id: &str) -> Result<Resolved, String> {
        if let Some(hit) = self.cached(id).await {
            return Ok(hit);
        }

        let exe = self
            .ytdlp
            .clone()
            .ok_or("yt-dlp no está disponible en esta instalación.")?;

        let video_id = id.to_string();
        let resolved =
            tokio::task::spawn_blocking(move || ytdlp::resolve(&exe, &video_id))
                .await
                .map_err(|e| format!("Tarea de yt-dlp interrumpida: {e}"))??;

        self.cache
            .lock()
            .await
            .insert(id.to_string(), resolved.clone());
        Ok(resolved)
    }

    pub fn stream_url(&self, id: &str) -> String {
        format!("{}/stream/{id}", self.base_url)
    }
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/stream/{id}", get(stream).options(stream_options))
        .route("/offline/{id}", get(offline).options(stream_options))
        .with_state(state)
}

/// El `<audio>` se sirve desde otro origen (`tauri.localhost` o Vite), y Web
/// Audio exige CORS limpio para poder analizar la señal con un `AnalyserNode`.
fn allow_cors(builder: axum::http::response::Builder) -> axum::http::response::Builder {
    builder
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(
            header::ACCESS_CONTROL_EXPOSE_HEADERS,
            "Content-Length, Content-Range, Accept-Ranges, Content-Type, ETag",
        )
        .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "Range, Content-Type")
}

async fn stream_options() -> Response {
    allow_cors(
        Response::builder()
            .status(StatusCode::NO_CONTENT)
            .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, OPTIONS")
            .header(header::ACCESS_CONTROL_MAX_AGE, "86400"),
    )
    .body(Body::empty())
    .unwrap_or_else(|_| StatusCode::NO_CONTENT.into_response())
}

fn copy_header(
    builder: axum::http::response::Builder,
    source: &reqwest::header::HeaderMap,
    name: header::HeaderName,
) -> axum::http::response::Builder {
    match source.get(&name) {
        Some(value) => builder.header(name, value),
        None => builder,
    }
}

async fn stream(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    match proxy(&state, &id, &headers).await {
        Ok(response) => response,
        Err(message) => (
            StatusCode::BAD_GATEWAY,
            [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
            message,
        )
            .into_response(),
    }
}

/// Interpreta `bytes=inicio-fin` (también `bytes=inicio-` y sufijos).
fn parse_range(value: &str, total: u64) -> Option<(u64, u64)> {
    let spec = value.trim().strip_prefix("bytes=")?;
    let (start, end) = spec.split_once('-')?;

    if start.trim().is_empty() {
        let length = end.trim().parse::<u64>().ok()?;
        if length == 0 || total == 0 {
            return None;
        }
        return Some((total.saturating_sub(length), total - 1));
    }

    let start = start.trim().parse::<u64>().ok()?;
    if start >= total {
        return None;
    }

    let end = if end.trim().is_empty() {
        total - 1
    } else {
        end.trim().parse::<u64>().ok()?.min(total - 1)
    };

    if end < start {
        return None;
    }

    Some((start, end))
}

/// Sirve un archivo ya descargado con el mismo contrato que `/stream`.
async fn offline(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    let Some(path) = state.offline_path(&id) else {
        return (
            StatusCode::NOT_FOUND,
            [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
            "descarga no encontrada",
        )
            .into_response();
    };

    let total = match tokio::fs::metadata(&path).await {
        Ok(meta) => meta.len(),
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
                format!("no se pudo leer la descarga: {err}"),
            )
                .into_response();
        }
    };

    let range = headers
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok());

    let (status, start, end) = match range {
        Some(value) => match parse_range(value, total) {
            Some((start, end)) => (StatusCode::PARTIAL_CONTENT, start, end),
            None => {
                return allow_cors(
                    Response::builder()
                        .status(StatusCode::RANGE_NOT_SATISFIABLE)
                        .header(header::CONTENT_RANGE, format!("bytes */{total}")),
                )
                .body(Body::empty())
                .unwrap_or_else(|_| StatusCode::RANGE_NOT_SATISFIABLE.into_response());
            }
        },
        None => (StatusCode::OK, 0, total.saturating_sub(1)),
    };

    let length = if total == 0 { 0 } else { end - start + 1 };

    let mut file = match tokio::fs::File::open(&path).await {
        Ok(file) => file,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
                format!("no se pudo abrir la descarga: {err}"),
            )
                .into_response();
        }
    };

    if start > 0 && file.seek(SeekFrom::Start(start)).await.is_err() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
            "no se pudo posicionar el archivo",
        )
            .into_response();
    }

    let body = Body::from_stream(ReaderStream::new(file.take(length)));

    let mut builder = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, downloads::mime_for(&path))
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, length.to_string());

    if status == StatusCode::PARTIAL_CONTENT {
        builder = builder.header(
            header::CONTENT_RANGE,
            format!("bytes {start}-{end}/{total}"),
        );
    }

    allow_cors(builder)
        .body(body)
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

async fn proxy(
    state: &AppState,
    id: &str,
    headers: &HeaderMap,
) -> Result<Response, String> {
    let range = headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);

    let mut last_error = String::from("no se pudo resolver el audio");

    // Dos intentos: si googlevideo devuelve 403/410 (URL caducada) se
    // invalida la caché y se vuelve a resolver con yt-dlp.
    for attempt in 0..2u8 {
        let resolved = state.resolve(id).await?;

        let mut request = state
            .client
            .get(resolved.url.as_str())
            .header(header::USER_AGENT, UA);

        if let Some(range) = &range {
            request = request.header(header::RANGE, range);
        }

        let upstream = match request.send().await {
            Ok(response) => response,
            Err(err) => {
                last_error = format!("googlevideo: {err}");
                if attempt == 0 {
                    state.invalidate(id).await;
                    continue;
                }
                return Err(last_error);
            }
        };

        let status = upstream.status();

        if matches!(status.as_u16(), 403 | 404 | 410) && attempt == 0 {
            last_error = format!("googlevideo respondió {status}");
            state.invalidate(id).await;
            continue;
        }

        if !status.is_success() {
            return Err(format!("googlevideo respondió {status}"));
        }

        let mut builder = Response::builder().status(upstream.status());
        for name in [
            header::CONTENT_TYPE,
            header::CONTENT_LENGTH,
            header::CONTENT_RANGE,
            header::ACCEPT_RANGES,
            header::CACHE_CONTROL,
            header::ETAG,
            header::LAST_MODIFIED,
        ] {
            builder = copy_header(builder, upstream.headers(), name);
        }

        if upstream.headers().get(header::CONTENT_TYPE).is_none() {
            builder = builder.header(header::CONTENT_TYPE, resolved.mime.as_str());
        }

        let body = Body::from_stream(upstream.bytes_stream().map(|chunk| {
            chunk.map_err(|e| std::io::Error::other(e.to_string()))
        }));

        return allow_cors(builder)
            .body(body)
            .map_err(|e| format!("respuesta inválida: {e}"));
    }

    Err(last_error)
}

//! Pulse - backend de catálogo (InnerTube) y audio (yt-dlp + proxy local).

mod downloads;
mod innertube;
mod lyrics;
mod proxy;
mod spotify;
mod ytdlp;

use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use proxy::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamInfo {
    url: String,
    mime_type: String,
    expires_at: u64,
    /// El audio sale del disco, no de googlevideo.
    offline: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    proxy: String,
    ytdlp: bool,
}

#[tauri::command]
async fn search_tracks(
    state: State<'_, Arc<AppState>>,
    query: String,
) -> Result<Vec<innertube::Track>, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    innertube::search(&state.client, &query).await
}

#[tauri::command]
async fn search_artists(
    state: State<'_, Arc<AppState>>,
    query: String,
) -> Result<Vec<innertube::ArtistRef>, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    innertube::search_artists(&state.client, &query).await
}

#[tauri::command]
async fn artist_details(
    state: State<'_, Arc<AppState>>,
    artist_id: String,
) -> Result<innertube::ArtistDetails, String> {
    let artist_id = artist_id.trim();
    if artist_id.is_empty() {
        return Err("Falta el id del artista".into());
    }
    innertube::artist_details(&state.client, artist_id).await
}

#[tauri::command]
async fn album_details(
    state: State<'_, Arc<AppState>>,
    album_id: String,
) -> Result<innertube::AlbumDetails, String> {
    let album_id = album_id.trim();
    if album_id.is_empty() {
        return Err("Falta el id del álbum".into());
    }
    innertube::album_details(&state.client, album_id).await
}

#[tauri::command]
async fn resolve_stream(
    state: State<'_, Arc<AppState>>,
    video_id: String,
) -> Result<StreamInfo, String> {
    if video_id.trim().is_empty() {
        return Err("Falta el id del vídeo".into());
    }

    // Offline primero: si está descargada, no hace falta red ni yt-dlp.
    if let Some(path) = state.offline_path(&video_id) {
        return Ok(StreamInfo {
            url: format!("{}/offline/{video_id}", state.base_url),
            mime_type: downloads::mime_for(&path).to_string(),
            expires_at: u64::MAX,
            offline: true,
        });
    }

    let resolved = state.resolve(&video_id).await?;

    Ok(StreamInfo {
        url: state.stream_url(&video_id),
        mime_type: resolved.mime,
        expires_at: resolved.expires_at,
        offline: false,
    })
}

#[tauri::command]
async fn get_lyrics(
    state: State<'_, Arc<AppState>>,
    video_id: String,
    title: String,
    artist: String,
    album: Option<String>,
    duration_sec: Option<u32>,
) -> Result<lyrics::Lyrics, String> {
    Ok(
        lyrics::fetch(
            &state.client,
            &video_id,
            &title,
            &artist,
            album.as_deref(),
            duration_sec,
        )
        .await,
    )
}

#[tauri::command]
async fn search_lyrics(
    state: State<'_, Arc<AppState>>,
    query: String,
) -> Result<Option<lyrics::Lyrics>, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(None);
    }
    Ok(lyrics::search(&state.client, &query).await)
}

/// Lee una playlist pública de Spotify (enlace, URI o id).
#[tauri::command]
async fn spotify_playlist(
    state: State<'_, Arc<AppState>>,
    source: String,
) -> Result<spotify::ImportedPlaylist, String> {
    spotify::playlist(&state.client, &source).await
}

/// Empareja canciones importadas con YouTube Music (emite `import-progress`).
#[tauri::command]
async fn match_import(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    tracks: Vec<spotify::ImportTrack>,
) -> Result<Vec<spotify::ImportMatch>, String> {
    if tracks.len() > 500 {
        return Err("Máximo 500 canciones por importación".into());
    }
    Ok(spotify::match_tracks(&state.client, tracks, &app).await)
}

#[tauri::command]
fn app_info(state: State<'_, Arc<AppState>>) -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        proxy: state.base_url.clone(),
        ytdlp: state.ytdlp.is_some(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let client = reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(10))
                .pool_idle_timeout(Duration::from_secs(90))
                .build()?;

            // Puerto efímero en loopback: evita choques y no expone nada fuera.
            let listener = std::net::TcpListener::bind(("127.0.0.1", 0))?;
            listener.set_nonblocking(true)?;
            let port = listener.local_addr()?.port();
            let base_url = format!("http://127.0.0.1:{port}");

            let ytdlp = match ytdlp::locate(app.handle()) {
                Ok(path) => Some(path),
                Err(err) => {
                    eprintln!("[pulse] {err}");
                    None
                }
            };

            let downloads = downloads::default_dir(app.handle());
            downloads::ensure_dir(&downloads);

            let state = Arc::new(AppState::new(client, ytdlp, base_url, downloads));
            app.manage(state.clone());

            tauri::async_runtime::spawn(async move {
                match tokio::net::TcpListener::from_std(listener) {
                    Ok(listener) => {
                        if let Err(err) = axum::serve(listener, proxy::router(state)).await {
                            eprintln!("[pulse] proxy detenido: {err}");
                        }
                    }
                    Err(err) => eprintln!("[pulse] no se pudo abrir el proxy: {err}"),
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search_tracks,
            search_artists,
            artist_details,
            album_details,
            resolve_stream,
            get_lyrics,
            search_lyrics,
            spotify_playlist,
            match_import,
            app_info,
            downloads::download_track,
            downloads::list_downloads,
            downloads::delete_download,
            downloads::downloads_info,
            downloads::reveal_downloads
        ])
        .run(tauri::generate_context!())
        .expect("error al arrancar Pulse");
}

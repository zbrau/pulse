//! Descargas offline con yt-dlp.
//!
//! Los archivos se guardan en `<app_data>/downloads/<video_id>.<ext>` junto a un
//! JSON con los metadatos. El proxy local los sirve con `Range`, así que el
//! reproductor, el ecualizador y el visualizador funcionan igual que en línea.

use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::proxy::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadEntry {
    pub id: String,
    pub title: String,
    pub artist: String,
    #[serde(default)]
    pub album: Option<String>,
    #[serde(default)]
    pub thumbnail: String,
    #[serde(default)]
    pub duration_sec: u32,
    pub file: String,
    pub size_bytes: u64,
    pub quality: String,
    pub created_at: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadRequest {
    pub id: String,
    pub title: String,
    pub artist: String,
    #[serde(default)]
    pub album: Option<String>,
    #[serde(default)]
    pub thumbnail: String,
    #[serde(default)]
    pub duration_sec: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    id: String,
    percent: f32,
    total_bytes: u64,
    downloaded_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadFailure {
    id: String,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadsInfo {
    pub dir: String,
    pub count: usize,
    pub total_bytes: u64,
    pub free_bytes: u64,
}

/// Carpetas válidas para una descarga (nada de rutas ni separadores).
fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Selector de formato de yt-dlp. Sin ffmpeg no se recodifica: se elige la
/// mejor pista disponible por debajo del bitrate indicado.
fn format_for(quality: &str) -> &'static str {
    match quality {
        "high" => {
            "bestaudio[ext=m4a][abr<=160]/bestaudio[ext=m4a]/bestaudio[abr<=160]/bestaudio"
        }
        "medium" => {
            "bestaudio[ext=m4a][abr<=128]/bestaudio[ext=m4a]/bestaudio[abr<=128]/bestaudio"
        }
        "low" => {
            "bestaudio[ext=m4a][abr<=96]/bestaudio[ext=m4a]/bestaudio[abr<=96]/bestaudio"
        }
        _ => "bestaudio[ext=m4a]/bestaudio",
    }
}

pub fn mime_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "m4a" | "mp4" => "audio/mp4",
        "webm" => "audio/webm",
        "mp3" => "audio/mpeg",
        "opus" => "audio/ogg",
        "ogg" | "oga" => "audio/ogg",
        "aac" => "audio/aac",
        "flac" => "audio/flac",
        "wav" => "audio/wav",
        _ => "application/octet-stream",
    }
}

/// Busca el archivo descargado de un vídeo (sin escanear subcarpetas).
pub fn find_file(dir: &Path, id: &str) -> Option<PathBuf> {
    if !safe_id(id) {
        return None;
    }
    let prefix = format!("{id}.");
    let entries = std::fs::read_dir(dir).ok()?;
    entries
        .flatten()
        .map(|entry| entry.path())
        .find(|path| {
            if !path.is_file() {
                return false;
            }
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default();
            name.starts_with(&prefix)
                && !name.ends_with(".json")
                && !name.ends_with(".part")
                && !name.ends_with(".ytdl")
        })
}

fn meta_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.json"))
}

fn read_entry(dir: &Path, id: &str) -> Option<DownloadEntry> {
    let raw = std::fs::read_to_string(meta_path(dir, id)).ok()?;
    let mut entry: DownloadEntry = serde_json::from_str(&raw).ok()?;
    let file = find_file(dir, id)?;
    entry.file = file.file_name()?.to_string_lossy().to_string();
    entry.size_bytes = std::fs::metadata(&file).ok()?.len();
    Some(entry)
}

fn entry_for_file(dir: &Path, request: &DownloadRequest, quality: &str) -> Option<DownloadEntry> {
    let file = find_file(dir, &request.id)?;
    let size_bytes = std::fs::metadata(&file).ok()?.len();
    Some(DownloadEntry {
        id: request.id.clone(),
        title: request.title.clone(),
        artist: request.artist.clone(),
        album: request.album.clone(),
        thumbnail: request.thumbnail.clone(),
        duration_sec: request.duration_sec,
        file: file.file_name()?.to_string_lossy().to_string(),
        size_bytes,
        quality: quality.to_string(),
        created_at: crate::ytdlp::now_secs(),
    })
}

fn cleanup_partials(dir: &Path, id: &str) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let prefix = format!("{id}.");
    for path in entries.flatten().map(|e| e.path()) {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();
        if name.starts_with(&prefix) && (name.ends_with(".part") || name.ends_with(".ytdl")) {
            let _ = std::fs::remove_file(path);
        }
    }
}

/// Bloquea el hilo: se ejecuta dentro de `spawn_blocking`.
fn run_download(
    app: &AppHandle,
    state: &AppState,
    request: DownloadRequest,
    quality: String,
) -> Result<DownloadEntry, String> {
    if !safe_id(&request.id) {
        return Err("Identificador de vídeo inválido".into());
    }

    if let Some(entry) = read_entry(&state.downloads, &request.id) {
        return Ok(entry);
    }

    // Si el archivo existe pero falta el JSON (o quedó a medias), se regenera.
    if let Some(entry) = entry_for_file(&state.downloads, &request, &quality) {
        let _ = std::fs::write(
            meta_path(&state.downloads, &request.id),
            serde_json::to_string_pretty(&entry).unwrap_or_default(),
        );
        return Ok(entry);
    }

    let exe = state
        .ytdlp
        .clone()
        .ok_or("yt-dlp no está disponible en esta instalación.")?;

    cleanup_partials(&state.downloads, &request.id);

    let output_template = state
        .downloads
        .join(format!("{}.%(ext)s", request.id))
        .to_string_lossy()
        .to_string();
    let target = format!(
        "https://music.youtube.com/watch?v={}",
        request.id
    );

    let mut cmd = Command::new(&exe);
    cmd.args([
        "--no-warnings",
        "--no-playlist",
        "--no-call-home",
        "--no-colors",
        "--newline",
        "--progress",
        "--progress-template",
        "download:PULSE %(progress._percent_str)s %(progress.total_bytes_estimate)s",
        "-f",
        format_for(&quality),
        "-o",
        &output_template,
        &target,
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("No se pudo ejecutar yt-dlp: {e}"))?;

    // stderr se drena en otro hilo para que el pipe no se llene y bloquee.
    let stderr_buf = Arc::new(StdMutex::new(String::new()));
    let stderr_handle = {
        let stderr = child.stderr.take();
        let buf = stderr_buf.clone();
        std::thread::spawn(move || {
            if let Some(mut stream) = stderr {
                let mut text = String::new();
                let _ = stream.read_to_string(&mut text);
                if let Ok(mut slot) = buf.lock() {
                    *slot = text;
                }
            }
        })
    };

    if let Some(stdout) = child.stdout.take() {
        let mut last_emit = Instant::now() - Duration::from_secs(1);
        let mut last_percent = -1.0_f32;

        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Some(rest) = line.trim().strip_prefix("PULSE") else {
                continue;
            };
            let Some(percent_at) = rest.find('%') else {
                continue;
            };
            let percent = rest[..percent_at]
                .trim()
                .parse::<f32>()
                .unwrap_or(0.0)
                .clamp(0.0, 100.0);
            let total_bytes = rest[percent_at + 1..]
                .trim()
                .parse::<f64>()
                .unwrap_or(0.0)
                .max(0.0) as u64;

            let enough_change = (percent - last_percent).abs() >= 1.0;
            if !enough_change && last_emit.elapsed() < Duration::from_millis(320) {
                continue;
            }

            last_percent = percent;
            last_emit = Instant::now();
            let _ = app.emit(
                "download-progress",
                DownloadProgress {
                    id: request.id.clone(),
                    percent,
                    total_bytes,
                    downloaded_bytes: (total_bytes as f64 * (percent as f64 / 100.0)) as u64,
                },
            );
        }
    }

    let status = child
        .wait()
        .map_err(|e| format!("yt-dlp terminó de forma inesperada: {e}"))?;
    let _ = stderr_handle.join();

    if !status.success() {
        cleanup_partials(&state.downloads, &request.id);
        let stderr = stderr_buf
            .lock()
            .map(|text| text.clone())
            .unwrap_or_default();
        let detail = stderr
            .lines()
            .rev()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("sin detalle")
            .trim()
            .to_string();
        return Err(format!("La descarga falló: {detail}"));
    }

    let file = find_file(&state.downloads, &request.id)
        .ok_or("yt-dlp terminó pero no encuentro el archivo descargado")?;
    let size_bytes = std::fs::metadata(&file).map(|m| m.len()).unwrap_or(0);

    let entry = DownloadEntry {
        id: request.id.clone(),
        title: request.title.clone(),
        artist: request.artist.clone(),
        album: request.album.clone(),
        thumbnail: request.thumbnail.clone(),
        duration_sec: request.duration_sec,
        file: file
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
        size_bytes,
        quality,
        created_at: crate::ytdlp::now_secs(),
    };

    let _ = std::fs::write(
        meta_path(&state.downloads, &entry.id),
        serde_json::to_string_pretty(&entry).unwrap_or_default(),
    );

    let _ = app.emit(
        "download-progress",
        DownloadProgress {
            id: entry.id.clone(),
            percent: 100.0,
            total_bytes: size_bytes,
            downloaded_bytes: size_bytes,
        },
    );
    let _ = app.emit("download-done", entry.clone());

    Ok(entry)
}

#[tauri::command]
pub async fn download_track(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    track: DownloadRequest,
    quality: String,
) -> Result<DownloadEntry, String> {
    if !safe_id(&track.id) {
        return Err("Identificador de vídeo inválido".into());
    }

    {
        let mut active = state
            .downloading
            .lock()
            .map_err(|_| "Estado de descargas bloqueado".to_string())?;
        if !active.insert(track.id.clone()) {
            return Err("Esta canción ya se está descargando".into());
        }
    }

    let state = state.inner().clone();
    let worker = state.clone();
    let id = track.id.clone();
    let app_errors = app.clone();
    let result = tokio::task::spawn_blocking(move || run_download(&app, &worker, track, quality))
        .await
        .map_err(|e| format!("Tarea de descarga interrumpida: {e}"))?;

    if let Ok(mut active) = state.downloading.lock() {
        active.remove(&id);
    }

    if let Err(message) = &result {
        let _ = app_errors.emit(
            "download-error",
            DownloadFailure {
                id,
                message: message.clone(),
            },
        );
    }

    result
}

fn collect(dir: &Path) -> Vec<DownloadEntry> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };

    let mut downloads: Vec<DownloadEntry> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|e| e.to_str()) == Some("json"))
        .filter_map(|path| {
            let id = path.file_stem()?.to_string_lossy().to_string();
            read_entry(dir, &id)
        })
        .collect();

    downloads.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    downloads
}

#[tauri::command]
pub fn list_downloads(state: State<'_, Arc<AppState>>) -> Vec<DownloadEntry> {
    collect(&state.downloads)
}

#[tauri::command]
pub fn delete_download(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    if !safe_id(&id) {
        return Err("Identificador inválido".into());
    }
    let Some(file) = find_file(&state.downloads, &id) else {
        let _ = std::fs::remove_file(meta_path(&state.downloads, &id));
        return Ok(());
    };

    std::fs::remove_file(&file)
        .map_err(|e| format!("No se pudo borrar el archivo (¿está sonando?): {e}"))?;
    let _ = std::fs::remove_file(meta_path(&state.downloads, &id));
    cleanup_partials(&state.downloads, &id);
    Ok(())
}

#[tauri::command]
pub fn downloads_info(state: State<'_, Arc<AppState>>) -> DownloadsInfo {
    let downloads = collect(&state.downloads);
    DownloadsInfo {
        dir: state.downloads.to_string_lossy().to_string(),
        count: downloads.len(),
        total_bytes: downloads.iter().map(|d| d.size_bytes).sum(),
        free_bytes: fs2::available_space(&state.downloads).unwrap_or(0),
    }
}

#[tauri::command]
pub fn reveal_downloads(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let dir = state.downloads.clone();
    if !dir.is_dir() {
        return Err("La carpeta de descargas todavía no existe".into());
    }

    #[cfg(windows)]
    {
        Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("No se pudo abrir la carpeta: {e}"))
    }

    #[cfg(not(windows))]
    {
        let opener = if cfg!(target_os = "macos") {
            "open"
        } else {
            "xdg-open"
        };
        Command::new(opener)
            .arg(&dir)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("No se pudo abrir la carpeta: {e}"))
    }
}

/// Carpeta de descargas por defecto, tolerante a errores del sistema.
pub fn default_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("downloads"))
        .unwrap_or_else(|_| std::env::temp_dir().join("pulse-downloads"))
}

pub fn ensure_dir(dir: &Path) {
    if let Err(err) = std::fs::create_dir_all(dir) {
        eprintln!("[pulse] no se pudo crear {}: {err}", dir.display());
    }
}

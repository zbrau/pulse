//! Resolución de audio con el binario yt-dlp (sidecar).
//!
//! InnerTube no entrega streams sin PoToken/cookies, así que yt-dlp es quien
//! negocia la URL real de googlevideo. El resultado se cachea hasta que expira.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

#[derive(Debug, Clone)]
pub struct Resolved {
    pub url: String,
    pub mime: String,
    pub expires_at: u64,
}

pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Busca yt-dlp: variable de entorno → recursos del bundle → carpeta del proyecto.
pub fn locate(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;

    if let Ok(custom) = std::env::var("PULSE_YTDLP") {
        let path = PathBuf::from(custom);
        if path.is_file() {
            return Ok(path);
        }
    }

    if let Ok(dir) = app.path().resource_dir() {
        for candidate in [
            dir.join("binaries").join("yt-dlp.exe"),
            dir.join("yt-dlp.exe"),
        ] {
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }

    let dev = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join("yt-dlp.exe");
    if dev.is_file() {
        return Ok(dev);
    }

    Err("No encuentro yt-dlp.exe (sidecar). Reinstala Pulse o define PULSE_YTDLP."
        .to_string())
}

fn expire_from_url(url: &str) -> Option<u64> {
    let query = url.split_once('?')?.1;
    query
        .split('&')
        .find_map(|pair| pair.strip_prefix("expire="))
        .and_then(|value| value.split('&').next())
        .and_then(|value| value.parse::<u64>().ok())
}

/// Bloquea el hilo: se llama dentro de `spawn_blocking`.
pub fn resolve(exe: &Path, video_id: &str) -> Result<Resolved, String> {
    let target = format!("https://music.youtube.com/watch?v={video_id}");

    let mut cmd = Command::new(exe);
    cmd.args([
        "--no-warnings",
        "--no-playlist",
        "--no-progress",
        "--no-call-home",
        "-f",
        "bestaudio[ext=m4a]/bestaudio",
        "-j",
        &target,
    ]);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("No se pudo ejecutar yt-dlp: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr
            .lines()
            .rev()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("sin detalle");
        return Err(format!("yt-dlp falló: {detail}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json = stdout
        .lines()
        .rev()
        .find_map(|line| serde_json::from_str::<Value>(line.trim()).ok())
        .ok_or_else(|| "yt-dlp no devolvió información del formato".to_string())?;

    let url = json
        .get("url")
        .and_then(Value::as_str)
        .ok_or_else(|| "yt-dlp no devolvió una URL de audio".to_string())?
        .to_string();

    let mime = json
        .get("mime_type")
        .and_then(Value::as_str)
        .unwrap_or("audio/mp4")
        .to_string();

    let expires_at = expire_from_url(&url).unwrap_or_else(|| now_secs() + 3 * 3600);

    Ok(Resolved {
        url,
        mime,
        expires_at,
    })
}

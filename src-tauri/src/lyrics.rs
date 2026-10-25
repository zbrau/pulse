//! Letras: lrclib (sincronizadas, LRC) con InnerTube como respaldo.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::innertube;

const LRCLIB: &str = "https://lrclib.net/api";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricLine {
    /// Milisegundos desde el inicio de la canción.
    pub time: u64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lyrics {
    pub synced: Option<Vec<LyricLine>>,
    pub plain: Option<String>,
    pub instrumental: bool,
    /// "lrclib" | "youtube" | "none"
    pub source: String,
    pub title: Option<String>,
    pub artist: Option<String>,
}

impl Lyrics {
    fn empty() -> Self {
        Self {
            synced: None,
            plain: None,
            instrumental: false,
            source: "none".into(),
            title: None,
            artist: None,
        }
    }

    fn is_empty(&self) -> bool {
        self.synced.is_none() && self.plain.is_none() && !self.instrumental
    }
}

/// Convierte una marca `[mm:ss.xx]` (o `[hh:mm:ss]`) a milisegundos.
fn parse_stamp(tag: &str) -> Option<u64> {
    let tag = tag.trim();
    if tag.is_empty() || !tag.contains(':') {
        return None;
    }

    let mut parts = tag.split(':').collect::<Vec<_>>();
    if parts.len() > 3 {
        return None;
    }

    let seconds_part = parts.pop()?;
    let (secs, frac) = match seconds_part.split_once(['.', ':']) {
        Some((s, f)) => (s, Some(f)),
        None => (seconds_part, None),
    };

    let mut total: u64 = 0;
    // lo que queda son minutos y, opcionalmente, horas
    for (i, part) in parts.iter().rev().enumerate() {
        let value: u64 = part.trim().parse().ok()?;
        total += value * if i == 0 { 60 } else { 3600 };
    }

    let secs: u64 = secs.trim().parse().ok()?;
    total += secs;

    let frac_ms = match frac {
        Some(f) => {
            let digits: String = f.chars().filter(char::is_ascii_digit).collect();
            if digits.is_empty() {
                0
            } else {
                let value: u64 = digits.parse().ok()?;
                let scale = 10u64.checked_pow(digits.len() as u32)?;
                value * 1000 / scale
            }
        }
        None => 0,
    };

    Some(total * 1000 + frac_ms)
}

fn parse_lrc(lrc: &str) -> Option<Vec<LyricLine>> {
    let mut out: Vec<LyricLine> = Vec::new();

    for raw in lrc.lines() {
        let mut rest = raw;
        let mut stamps: Vec<u64> = Vec::new();

        loop {
            let trimmed = rest.trim_start();
            if !trimmed.starts_with('[') {
                break;
            }
            let Some(end) = trimmed.find(']') else { break };
            let tag = &trimmed[1..end];
            if let Some(ms) = parse_stamp(tag) {
                stamps.push(ms);
            }
            rest = &trimmed[end + 1..];
        }

        if stamps.is_empty() {
            continue;
        }

        let text = rest.trim().to_string();
        for time in stamps {
            out.push(LyricLine {
                time,
                text: text.clone(),
            });
        }
    }

    out.sort_by_key(|l| l.time);
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

fn text_of(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Quita `(feat. …)`, `[Remastered]`, `- Radio Edit`… que InnerTube añade al
/// título y que lrclib no usa para buscar.
fn clean_title(title: &str) -> String {
    let mut out = String::with_capacity(title.len());
    let mut depth = 0usize;
    let mut kept = String::new();

    for ch in title.chars() {
        match ch {
            '(' | '[' => {
                depth += 1;
            }
            ')' | ']' => {
                depth = depth.saturating_sub(1);
            }
            _ => {
                if depth == 0 {
                    kept.push(ch);
                }
            }
        }
    }

    out.push_str(&kept);

    // Sufijos del tipo "- Remastered 2011" o "feat. X" fuera de paréntesis.
    let lowered = out.to_lowercase();
    for marker in [" - remaster", " - live", " - radio edit", " feat. ", " ft. "] {
        if let Some(idx) = lowered.find(marker) {
            out.truncate(idx);
            break;
        }
    }

    out.trim().trim_end_matches('-').trim().to_string()
}

/// InnerTube localiza las conjunciones ("Daft Punk y Julian Casablancas"), pero
/// lrclib espera el nombre real del artista.
fn clean_artist(artist: &str) -> String {
    let mut out = artist.to_string();
    for (from, to) in [
        (" y ", " & "),
        (" and ", " & "),
        (" e ", " & "),
        (" feat. ", " & "),
        (" ft. ", " & "),
    ] {
        out = out.replace(from, to);
    }

    // Algunos resultados traen el país pegado al nombre: "Daft Punk, FR".
    out.trim().trim_end_matches(',').trim().to_string()
}

fn from_lrclib(body: &Value) -> Lyrics {
    let synced = body
        .get("syncedLyrics")
        .and_then(Value::as_str)
        .and_then(parse_lrc);

    let plain = body
        .get("plainLyrics")
        .and_then(Value::as_str)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let instrumental = body
        .get("instrumental")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    Lyrics {
        instrumental: instrumental || (synced.is_none() && plain.is_none()),
        synced,
        plain,
        source: "lrclib".into(),
        title: text_of(body, "trackName"),
        artist: text_of(body, "artistName"),
    }
}

/// Puntúa un resultado para quedarse con la versión más parecida.
fn score(result: &Value, title: &str, duration: Option<u32>) -> i64 {
    let normalize = |s: &str| {
        s.to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { ' ' })
            .collect::<String>()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    };

    let target = normalize(title);
    let found = normalize(result.get("trackName").and_then(Value::as_str).unwrap_or(""));

    let mut points: i64 = 0;
    if !target.is_empty() && found == target {
        points += 100;
    } else if !target.is_empty() && (found.contains(&target) || target.contains(&found)) {
        points += 55;
    }
    if result
        .get("syncedLyrics")
        .and_then(Value::as_str)
        .is_some_and(|s| !s.is_empty())
    {
        points += 30;
    }
    if let (Some(want), Some(has)) = (
        duration,
        result.get("duration").and_then(Value::as_f64),
    ) {
        points -= (want as f64 - has).abs().min(100.0) as i64 / 4;
    }
    points
}

/// Coincidencia exacta por metadatos (`/api/get`): la más fiable cuando hay
/// álbum y duración. Si lrclib no la tiene, devuelve `None` y se busca a mano.
async fn lrclib_get(
    client: &reqwest::Client,
    title: &str,
    artist: &str,
    album: Option<&str>,
    duration: Option<u32>,
) -> Option<Lyrics> {
    if title.is_empty() || artist.is_empty() {
        return None;
    }

    let title_owned = title.to_string();
    let artist_owned = artist.to_string();
    let album_owned = album.unwrap_or_default().to_string();
    let duration_owned = duration
        .filter(|d| *d > 0)
        .map(|d| d.to_string())
        .unwrap_or_default();

    let mut params: Vec<(&str, &str)> = vec![
        ("artist_name", artist_owned.as_str()),
        ("track_name", title_owned.as_str()),
    ];
    if !album_owned.is_empty() {
        params.push(("album_name", album_owned.as_str()));
    }
    if !duration_owned.is_empty() {
        params.push(("duration", duration_owned.as_str()));
    }

    let res = client
        .get(format!("{LRCLIB}/get"))
        .query(&params)
        .header("Accept", "application/json")
        .send()
        .await
        .ok()?;

    if !res.status().is_success() {
        return None;
    }

    let body = res.json::<Value>().await.ok()?;
    let lyrics = from_lrclib(&body);
    if lyrics.is_empty() {
        None
    } else {
        Some(lyrics)
    }
}

/// Búsqueda libre, de la consulta más específica a la más general: con
/// "artista + título" y, si no hay nada, sólo con el título.
async fn lrclib_search(
    client: &reqwest::Client,
    title: &str,
    artist: &str,
    duration: Option<u32>,
) -> Option<Lyrics> {
    let mut queries: Vec<String> = Vec::new();
    if !artist.is_empty() && !title.is_empty() {
        queries.push(format!("{artist} {title}"));
    }
    if !title.is_empty() {
        queries.push(title.to_string());
    }

    for query in queries {
        let res = client
            .get(format!("{LRCLIB}/search"))
            .query(&[("q", query.as_str())])
            .header("Accept", "application/json")
            .send()
            .await
            .ok()?;

        if !res.status().is_success() {
            continue;
        }

        let Ok(results) = res.json::<Vec<Value>>().await else {
            continue;
        };
        if results.is_empty() {
            continue;
        }

        let best = results
            .into_iter()
            .max_by_key(|r| score(r, title, duration))?;

        let lyrics = from_lrclib(&best);
        if !lyrics.is_empty() {
            return Some(lyrics);
        }
    }

    None
}

pub async fn fetch(
    client: &reqwest::Client,
    video_id: &str,
    title: &str,
    artist: &str,
    album: Option<&str>,
    duration: Option<u32>,
) -> Lyrics {
    let clean_t = clean_title(title);
    let clean_a = clean_artist(artist);

    // lrclib en paralelo con el intento de InnerTube: gana el que dé letra
    // sincronizada, que es lo que la UI necesita para seguir la canción.
    let yt = innertube::lyrics(client, video_id);
    let lr = async {
        if let Some(lyrics) = lrclib_get(client, &clean_t, &clean_a, album, duration).await {
            return Some(lyrics);
        }
        lrclib_search(client, &clean_t, &clean_a, duration).await
    };
    let (yt, lr) = tokio::join!(yt, lr);

    if let Some(lyrics) = lr {
        if lyrics.synced.is_some() {
            return lyrics;
        }
        // sin sincronizar: si InnerTube dio texto, lo preferimos tal cual
        if let Some(plain) = yt {
            return Lyrics {
                synced: None,
                plain: Some(plain),
                instrumental: false,
                source: "youtube".into(),
                title: Some(title.to_string()),
                artist: Some(artist.to_string()),
            };
        }
        return lyrics;
    }

    if let Some(plain) = yt {
        return Lyrics {
            synced: None,
            plain: Some(plain),
            instrumental: false,
            source: "youtube".into(),
            title: Some(title.to_string()),
            artist: Some(artist.to_string()),
        };
    }

    let _ = album;
    Lyrics::empty()
}

/// Búsqueda manual de letras (sin canción sonando).
pub async fn search(client: &reqwest::Client, query: &str) -> Option<Lyrics> {
    let res = client
        .get(format!("{LRCLIB}/search"))
        .query(&[("q", query)])
        .header("Accept", "application/json")
        .send()
        .await
        .ok()?;

    if !res.status().is_success() {
        return None;
    }

    let results = res.json::<Vec<Value>>().await.ok()?;
    let best = results
        .iter()
        .find(|r| {
            r.get("syncedLyrics")
                .and_then(Value::as_str)
                .is_some_and(|s| !s.is_empty())
        })
        .or_else(|| results.first())?;

    let lyrics = from_lrclib(best);
    if lyrics.is_empty() {
        None
    } else {
        Some(lyrics)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parsea_lrc_con_varias_marcas() {
        let lrc = "[00:12.34]primera\n[00:15.5][00:30.00]repetida\nsin marca\n";
        let lines = parse_lrc(lrc).expect("debería parsear");
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0].time, 12_340);
        assert_eq!(lines[0].text, "primera");
        assert_eq!(lines[1].time, 15_500);
        assert_eq!(lines[2].time, 30_000);
        assert_eq!(lines[2].text, "repetida");
    }

    #[test]
    fn limpia_metadatos_de_innertube() {
        assert_eq!(
            clean_title("Instant Crush (feat. Julian Casablancas)"),
            "Instant Crush"
        );
        assert_eq!(clean_title("Song [Remastered 2011]"), "Song");
        assert_eq!(clean_title("Song - Remastered 2011"), "Song");
        assert_eq!(clean_title("Song feat. Otro"), "Song");
        assert_eq!(
            clean_artist("Daft Punk y Julian Casablancas"),
            "Daft Punk & Julian Casablancas"
        );
        assert_eq!(clean_artist("Daft Punk and Pharrell"), "Daft Punk & Pharrell");
    }
}

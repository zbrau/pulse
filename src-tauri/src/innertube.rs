//! Cliente mínimo de InnerTube (la API interna de YouTube Music).
//!
//! Sólo se usa para catálogo: búsqueda de canciones, artistas, álbumes y
//! metadatos. El audio se resuelve con yt-dlp porque InnerTube exige
//! PoToken/cookies para servir streams (ver README).

use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const KEY: &str = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30";
const BASE: &str = "https://music.youtube.com/youtubei/v1";

/// Filtro de InnerTube: sólo canciones.
const SONGS_PARAMS: &str = "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D";
/// Filtro de InnerTube: sólo artistas.
const ARTISTS_PARAMS: &str = "EgWKAQIgAWoKEAkQBRAKEAMQBA%3D%3D";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub duration_sec: u32,
    pub duration_formatted: String,
    pub thumbnail: String,
    /// Canal del artista (para abrir su perfil sin volver a buscarlo).
    pub artist_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistRef {
    pub id: String,
    pub name: String,
    pub subscribers: Option<String>,
    pub thumbnail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumRef {
    pub id: String,
    pub title: String,
    pub subtitle: String,
    pub thumbnail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistDetails {
    pub id: String,
    pub name: String,
    pub banner: String,
    pub subscribers: Option<String>,
    pub monthly_listeners: Option<String>,
    pub description: String,
    pub tracks: Vec<Track>,
    pub albums: Vec<AlbumRef>,
    pub related: Vec<ArtistRef>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumDetails {
    pub id: String,
    pub title: String,
    pub subtitle: String,
    pub description: Option<String>,
    pub thumbnail: String,
    pub tracks: Vec<Track>,
}

fn context() -> Value {
    json!({
        "client": {
            "clientName": "WEB_REMIX",
            "clientVersion": "1.20241001.01.00",
            "hl": "es",
            "gl": "ES"
        }
    })
}

pub async fn post(client: &reqwest::Client, path: &str, body: Value) -> Result<Value, String> {
    let request = client
        .post(format!("{BASE}/{path}?key={KEY}&prettyPrint=false"))
        .header("Content-Type", "application/json")
        .header("Origin", "https://music.youtube.com")
        .header("Referer", "https://music.youtube.com/")
        .header("X-Goog-Api-Format-Version", "2")
        .json(&body)
        .send();

    let res = tokio::time::timeout(std::time::Duration::from_secs(30), request)
        .await
        .map_err(|_| format!("InnerTube {path}: tiempo de espera agotado"))?
        .map_err(|e| format!("InnerTube {path}: {e}"))?;

    let status = res.status();
    if !status.is_success() {
        return Err(format!("InnerTube {path}: HTTP {status}"));
    }

    res.json::<Value>()
        .await
        .map_err(|e| format!("InnerTube {path}: respuesta ilegible ({e})"))
}

/// Recorre el árbol JSON acumulando todos los valores de una clave.
fn collect<'a>(node: &'a Value, key: &str, out: &mut Vec<&'a Value>) {
    match node {
        Value::Object(map) => {
            if let Some(v) = map.get(key) {
                out.push(v);
            }
            for v in map.values() {
                collect(v, key, out);
            }
        }
        Value::Array(items) => {
            for v in items {
                collect(v, key, out);
            }
        }
        _ => {}
    }
}

fn get_all<'a>(node: &'a Value, key: &str) -> Vec<&'a Value> {
    let mut out = Vec::new();
    collect(node, key, &mut out);
    out
}

/// Concatena los `runs[].text` de un nodo de texto de InnerTube.
fn runs_text(node: &Value) -> String {
    node.get("runs")
        .and_then(Value::as_array)
        .map(|runs| {
            runs.iter()
                .filter_map(|r| r.get("text").and_then(Value::as_str))
                .collect::<String>()
        })
        .unwrap_or_default()
}

fn non_empty(text: String) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn parse_clock(text: &str) -> Option<u32> {
    let parts: Vec<&str> = text.trim().split(':').collect();
    match parts.len() {
        2 => {
            let m: u32 = parts[0].parse().ok()?;
            let s: u32 = parts[1].parse().ok()?;
            Some(m * 60 + s)
        }
        3 => {
            let h: u32 = parts[0].parse().ok()?;
            let m: u32 = parts[1].parse().ok()?;
            let s: u32 = parts[2].parse().ok()?;
            Some(h * 3600 + m * 60 + s)
        }
        _ => None,
    }
}

fn format_clock(secs: u32) -> String {
    let h = secs / 3600;
    let m = (secs % 3600) / 60;
    let s = secs % 60;
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m}:{s:02}")
    }
}

fn find_video_id(item: &Value) -> Option<String> {
    for ep in get_all(item, "watchEndpoint") {
        if let Some(id) = ep.get("videoId").and_then(Value::as_str) {
            return Some(id.to_string());
        }
    }
    None
}

/// Id del vídeo que suena al pulsar la fila (algunos ítems lo traen en
/// `playlistItemData` y no en `watchEndpoint`).
fn find_item_video_id(item: &Value) -> Option<String> {
    find_video_id(item).or_else(|| {
        item.get("playlistItemData")
            .and_then(|p| p.get("videoId"))
            .and_then(Value::as_str)
            .map(str::to_string)
    })
}

fn find_thumbnail(item: &Value) -> String {
    for grid in get_all(item, "thumbnails") {
        if let Some(list) = grid.as_array() {
            if let Some(url) = list
                .last()
                .and_then(|t| t.get("url"))
                .and_then(Value::as_str)
            {
                return url.to_string();
            }
        }
    }
    String::new()
}

fn run_browse_id(run: &Value) -> Option<&str> {
    run.get("navigationEndpoint")?
        .get("browseEndpoint")?
        .get("browseId")?
        .as_str()
}

fn is_noise(text: &str) -> bool {
    matches!(text, "•" | "·" | "y" | "&" | "," | "-" | "|")
}

fn is_counter(text: &str) -> bool {
    text.contains("reproducciones") || text.contains("visualizaciones")
}

/// Etiquetas de columna («Canción», «Álbum»…) que no son nombres de artista.
fn is_row_label(text: &str) -> bool {
    matches!(
        text,
        "Canción"
            | "Canciones"
            | "Song"
            | "Songs"
            | "Álbum"
            | "Album"
            | "Álbumes"
            | "Artista"
            | "Artist"
            | "Vídeo"
            | "Video"
            | "Episodio"
            | "Episode"
            | "Single"
            | "Sencillo"
    )
}

fn column_runs<'a>(item: &'a Value, index: usize) -> &'a [Value] {
    item.get("flexColumns")
        .and_then(Value::as_array)
        .and_then(|cols| cols.get(index))
        .and_then(|c| c.get("musicResponsiveListItemFlexColumnRenderer"))
        .and_then(|r| r.get("text"))
        .and_then(|t| t.get("runs"))
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

fn column_text(item: &Value, index: usize) -> String {
    item.get("flexColumns")
        .and_then(Value::as_array)
        .and_then(|cols| cols.get(index))
        .and_then(|c| c.get("musicResponsiveListItemFlexColumnRenderer"))
        .and_then(|r| r.get("text"))
        .map(runs_text)
        .unwrap_or_default()
}

/// Convierte una fila de InnerTube en una canción.
///
/// Las columnas cambian según la vista (búsqueda, artista, álbum): a veces la
/// duración es la última columna y a veces no existe. Se recorre todo y se
/// deduce por el endpoint de cada `run`.
fn parse_item(item: &Value) -> Option<Track> {
    let title = column_text(item, 0).trim().to_string();
    if title.is_empty() {
        return None;
    }

    let cols = item.get("flexColumns").and_then(Value::as_array)?;

    let mut artists: Vec<String> = Vec::new();
    let mut artist_id: Option<String> = None;
    let mut album: Option<String> = None;
    let mut duration_sec = 0;

    for (index, _) in cols.iter().enumerate().skip(1) {
        for run in column_runs(item, index) {
            let Some(text) = run.get("text").and_then(Value::as_str) else {
                continue;
            };
            let text = text.trim();
            if text.is_empty() || is_noise(text) {
                continue;
            }

            if let Some(id) = run_browse_id(run) {
                if id.starts_with("UC") {
                    if artist_id.is_none() {
                        artist_id = Some(id.to_string());
                    }
                    if !artists.iter().any(|a| a == text) {
                        artists.push(text.to_string());
                    }
                } else if id.starts_with("MPREb_") && album.is_none() {
                    album = Some(text.to_string());
                }
                continue;
            }

            if let Some(secs) = parse_clock(text) {
                duration_sec = secs;
                continue;
            }

            if is_counter(text) {
                continue;
            }
        }
    }

    // Respaldo para filas sin endpoints: texto plano separado por «•».
    if artists.is_empty() {
        let mut parts: Vec<String> = column_text(item, 1)
            .split('•')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty() && !is_row_label(s) && !is_counter(s))
            .collect();

        if let Some(last) = parts.last() {
            if let Some(secs) = parse_clock(last) {
                duration_sec = secs;
                parts.pop();
            }
        }

        if let Some(first) = parts.first() {
            artists.push(first.clone());
        }
        if album.is_none() {
            album = parts.get(1).cloned();
        }
    }

    let id = find_item_video_id(item)?;

    Some(Track {
        id,
        title,
        artist: if artists.is_empty() {
            "Desconocido".to_string()
        } else {
            artists.join(", ")
        },
        album,
        duration_sec,
        duration_formatted: if duration_sec > 0 {
            format_clock(duration_sec)
        } else {
            "--:--".to_string()
        },
        thumbnail: find_thumbnail(item),
        artist_id,
    })
}

fn parse_items(node: &Value) -> Vec<Track> {
    let mut tracks: Vec<Track> = Vec::new();
    for item in get_all(node, "musicResponsiveListItemRenderer") {
        if let Some(track) = parse_item(item) {
            if !tracks.iter().any(|t| t.id == track.id) {
                tracks.push(track);
            }
        }
    }
    tracks
}

pub async fn search(client: &reqwest::Client, query: &str) -> Result<Vec<Track>, String> {
    let body = json!({
        "context": context(),
        "query": query,
        "params": SONGS_PARAMS,
    });

    let json = post(client, "search", body).await?;
    Ok(parse_items(&json))
}

pub async fn search_artists(client: &reqwest::Client, query: &str) -> Result<Vec<ArtistRef>, String> {
    let body = json!({
        "context": context(),
        "query": query,
        "params": ARTISTS_PARAMS,
    });

    let json = post(client, "search", body).await?;

    let mut artists: Vec<ArtistRef> = Vec::new();
    for item in get_all(&json, "musicResponsiveListItemRenderer") {
        let name = column_text(item, 0).trim().to_string();
        if name.is_empty() {
            continue;
        }

        let id = get_all(item, "browseEndpoint")
            .iter()
            .filter_map(|ep| ep.get("browseId").and_then(Value::as_str))
            .find(|id| id.starts_with("UC"))
            .map(str::to_string);
        let Some(id) = id else { continue };
        if artists.iter().any(|a| a.id == id) {
            continue;
        }

        let subtitle = column_text(item, 1);
        let subscribers = subtitle
            .split('•')
            .map(str::trim)
            .find(|part| part.contains("usuarios") || part.contains("suscriptores"))
            .map(str::to_string);

        artists.push(ArtistRef {
            id,
            name,
            subscribers,
            thumbnail: find_thumbnail(item),
        });
    }

    Ok(artists)
}

pub async fn artist_details(
    client: &reqwest::Client,
    artist_id: &str,
) -> Result<ArtistDetails, String> {
    let json = post(
        client,
        "browse",
        json!({ "context": context(), "browseId": artist_id }),
    )
    .await?;

    let mut name = String::new();
    let mut banner = String::new();
    let mut description = String::new();

    if let Some(header) = get_all(&json, "musicImmersiveHeaderRenderer").first() {
        name = runs_text(&header["title"]);
        banner = find_thumbnail(header);
        description = runs_text(&header["description"]);
    }

    // Artistas con el encabezado nuevo (o sin banner personalizado).
    if name.trim().is_empty() {
        if let Some(header) = get_all(&json, "musicResponsiveHeaderRenderer").first() {
            name = runs_text(&header["title"]);
            banner = find_thumbnail(header);
        }
    }

    // Estadísticas: los dos diseños las colocan en sitios distintos.
    let mut subscribers = get_all(&json, "subscriberCountText")
        .first()
        .map(|node| runs_text(node))
        .and_then(non_empty);
    let mut monthly_listeners = get_all(&json, "monthlyListenerCount")
        .first()
        .map(|node| runs_text(node))
        .and_then(non_empty);

    if subscribers.is_none() || monthly_listeners.is_none() {
        let parts: Vec<String> = get_all(&json, "musicResponsiveHeaderRenderer")
            .first()
            .map(|header| {
                ["subtitle", "secondSubtitle"]
                    .iter()
                    .flat_map(|key| runs_text(&header[*key]).split('•').map(str::to_string).collect::<Vec<_>>())
                    .map(|part| part.trim().to_string())
                    .collect()
            })
            .unwrap_or_default();

        for part in parts {
            if part.is_empty() {
                continue;
            }
            if subscribers.is_none() && part.contains("suscriptor") {
                subscribers = Some(part);
            } else if monthly_listeners.is_none() && part.contains("mensual") {
                monthly_listeners = Some(part);
            }
        }
    }

    if description.trim().is_empty() {
        if let Some(shelf) = get_all(&json, "musicDescriptionShelfRenderer").first() {
            description = runs_text(&shelf["description"]);
        }
    }

    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("YouTube Music no devolvió el perfil de ese artista".into());
    }

    // Canciones más escuchadas: la primera estantería con listas.
    let mut tracks = Vec::new();
    let shelves = get_all(&json, "musicShelfRenderer");
    let songs_shelf = shelves
        .iter()
        .find(|s| {
            let title = runs_text(&s["title"]).to_lowercase();
            title.contains("escuchad") || title.contains("canciones")
        })
        .or_else(|| shelves.first());
    if let Some(shelf) = songs_shelf {
        tracks = parse_items(shelf);
        tracks.truncate(10);
    }

    // Carátulas: álbumes, singles y artistas relacionados.
    let mut albums: Vec<AlbumRef> = Vec::new();
    let mut related: Vec<ArtistRef> = Vec::new();

    for carousel in get_all(&json, "musicCarouselShelfRenderer") {
        let carousel_title = runs_text(&carousel["header"]["musicCarouselShelfBasicHeaderRenderer"]["title"])
            .to_lowercase();
        let is_related = carousel_title.contains("guste") || carousel_title.contains("similar");

        for row in get_all(carousel, "musicTwoRowItemRenderer") {
            let Some(id) = row["navigationEndpoint"]["browseEndpoint"]["browseId"]
                .as_str()
            else {
                continue;
            };
            let page_type = row["navigationEndpoint"]["browseEndpoint"]
                ["browseEndpointContextSupportedConfigs"]
                ["browseEndpointContextMusicConfig"]["pageType"]
                .as_str()
                .unwrap_or_default();
            let title = runs_text(&row["title"]).trim().to_string();
            if title.is_empty() {
                continue;
            }

            if page_type == "MUSIC_PAGE_TYPE_ALBUM" && id.starts_with("MPREb_") {
                if albums.iter().any(|a| a.id == id) {
                    continue;
                }
                albums.push(AlbumRef {
                    id: id.to_string(),
                    title,
                    subtitle: runs_text(&row["subtitle"]).trim().to_string(),
                    thumbnail: find_thumbnail(row),
                });
            } else if is_related && page_type == "MUSIC_PAGE_TYPE_ARTIST" && id.starts_with("UC") {
                if related.iter().any(|a| a.id == id) {
                    continue;
                }
                related.push(ArtistRef {
                    id: id.to_string(),
                    name: title,
                    subscribers: non_empty(runs_text(&row["subtitle"]).trim().to_string()),
                    thumbnail: find_thumbnail(row),
                });
            }
        }
    }

    Ok(ArtistDetails {
        id: artist_id.to_string(),
        name,
        banner,
        subscribers,
        monthly_listeners,
        description: description.trim().to_string(),
        tracks,
        albums,
        related,
    })
}

pub async fn album_details(
    client: &reqwest::Client,
    album_id: &str,
) -> Result<AlbumDetails, String> {
    let json = post(
        client,
        "browse",
        json!({ "context": context(), "browseId": album_id }),
    )
    .await?;

    let header = get_all(&json, "musicResponsiveHeaderRenderer")
        .into_iter()
        .next();

    let (title, subtitle, description, thumbnail) = match header {
        Some(header) => {
            let mut description = runs_text(&header["description"]);
            if description.trim().is_empty() {
                if let Some(shelf) = get_all(&json, "musicDescriptionShelfRenderer").first() {
                    description = runs_text(&shelf["description"]);
                }
            }
            (
                runs_text(&header["title"]).trim().to_string(),
                runs_text(&header["subtitle"]).trim().to_string(),
                non_empty(description),
                find_thumbnail(header),
            )
        }
        None => (String::new(), String::new(), None, String::new()),
    };

    if title.is_empty() {
        return Err("YouTube Music no devolvió ese álbum".into());
    }

    let mut tracks = parse_items(&json);
    tracks.truncate(100);

    Ok(AlbumDetails {
        id: album_id.to_string(),
        title,
        subtitle,
        description,
        thumbnail,
        tracks,
    })
}

/// Letra desde el panel de YouTube Music (`browseId = MPLYt_<videoId>`).
///
/// Sin sesión YouTube suele responder "La letra no está disponible", así que
/// esto es sólo un primer intento antes de caer a lrclib.
pub async fn lyrics(client: &reqwest::Client, video_id: &str) -> Option<String> {
    let body = json!({
        "context": context(),
        "browseId": format!("MPLYt_{video_id}"),
    });

    let json = post(client, "browse", body).await.ok()?;

    let mut shelves = Vec::new();
    collect(&json, "musicDescriptionShelfRenderer", &mut shelves);

    for shelf in shelves {
        if let Some(desc) = shelf.get("description") {
            let text = runs_text(desc);
            if !text.trim().is_empty() {
                return Some(text.trim().to_string());
            }
        }
    }

    None
}

/// Palabras que no aportan al comparar un título de Spotify con YouTube.
const NOISE: &[&str] = &[
    "feat", "ft", "featuring", "remaster", "remastered", "version", "deluxe", "edit",
    "edition", "official", "video", "audio", "lyric", "lyrics", "mono", "stereo", "explicit",
    "radio",
];

fn fold_char(c: char) -> char {
    match c {
        'á' | 'à' | 'ä' | 'â' | 'ã' => 'a',
        'é' | 'è' | 'ë' | 'ê' => 'e',
        'í' | 'ì' | 'ï' | 'î' => 'i',
        'ó' | 'ò' | 'ö' | 'ô' | 'õ' => 'o',
        'ú' | 'ù' | 'ü' | 'û' => 'u',
        'ñ' => 'n',
        'ç' => 'c',
        _ => c,
    }
}

/// Normaliza para comparar: sin acentos, sin paréntesis ni sufijos de edición.
pub fn normalize(text: &str) -> String {
    let lowered = text.to_lowercase();

    // "Song - 2005 Remaster" → "Song"
    let mut base = String::new();
    for (index, part) in lowered.split(" - ").enumerate() {
        if index > 0 {
            let part = part.to_lowercase();
            if ["remaster", "version", "edit", "deluxe", "mono", "stereo", "live"]
                .iter()
                .any(|word| part.contains(word))
            {
                break;
            }
        }
        if !base.is_empty() {
            base.push(' ');
        }
        base.push_str(part);
    }

    let mut out = String::new();
    let mut depth = 0i32;
    for ch in base.chars() {
        match ch {
            '(' | '[' => depth += 1,
            ')' | ']' => depth = (depth - 1).max(0),
            _ if depth > 0 => {}
            c if c.is_alphanumeric() => out.push(fold_char(c)),
            _ => out.push(' '),
        }
    }

    out.split_whitespace()
        .filter(|word| !NOISE.contains(word))
        .collect::<Vec<_>>()
        .join(" ")
}

fn token_set(text: &str) -> HashSet<&str> {
    text.split_whitespace().collect()
}

/// Parecido entre dos textos ya normalizados (0..1).
pub fn text_score(a: &str, b: &str) -> f32 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    if a == b {
        return 1.0;
    }

    let sa = token_set(a);
    let sb = token_set(b);
    if sa.is_subset(&sb) || sb.is_subset(&sa) {
        // «instant crush» dentro de «instant crush julian casablancas»
        return 0.85;
    }

    let inter = sa.intersection(&sb).count() as f32;
    let union = sa.union(&sb).count() as f32;
    if union == 0.0 {
        0.0
    } else {
        inter / union
    }
}

/// El artista de Spotify puede traer varios nombres; basta con que uno cuadre.
pub fn artist_score(imported: &str, candidate: &str) -> f32 {
    let candidate_norm = normalize(candidate);
    let mut best: f32 = text_score(&normalize(imported), &candidate_norm);

    for part in imported.split([',', '&', '/']) {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        best = best.max(text_score(&normalize(part), &candidate_norm));
    }

    best
}

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  AlbumDetails,
  ArtistDetails,
  ArtistRef,
  ImportedPlaylist,
  ImportMatch,
  ImportTrack,
  MusicTrack,
} from '../types'
import { isDesktop, requireDesktop } from './desktop'

export { isDesktop, requireDesktop }

export type StreamInfo = {
  url: string
  mimeType: string
  expiresAt: number
  /** Viene de una descarga local, sin pasar por yt-dlp. */
  offline: boolean
}

/**
 * Busca canciones en YouTube Music a través de InnerTube (backend Rust).
 * El `signal` se acepta por compatibilidad: quien llama descarta resultados viejos.
 */
export async function searchSongs(
  query: string,
  signal?: AbortSignal,
): Promise<MusicTrack[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  requireDesktop()
  if (signal?.aborted) return []
  return invoke<MusicTrack[]>('search_tracks', { query: trimmed })
}

/** Busca artistas (filtro de InnerTube, no canciones). */
export async function searchArtists(query: string): Promise<ArtistRef[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  requireDesktop()
  return invoke<ArtistRef[]>('search_artists', { query: trimmed })
}

export async function getArtist(artistId: string): Promise<ArtistDetails> {
  requireDesktop()
  return invoke<ArtistDetails>('artist_details', { artistId })
}

export async function getAlbum(albumId: string): Promise<AlbumDetails> {
  requireDesktop()
  return invoke<AlbumDetails>('album_details', { albumId })
}

/**
 * Devuelve el artista cuyo nombre coincide (o el primero parecido).
 * Sirve para canciones viejas sin `artistId` y para textos tipo
 * «Daft Punk, Julian Casablancas».
 */
export async function findArtist(name: string): Promise<ArtistRef | null> {
  const primary = name.split(',')[0].trim() || name.trim()
  if (!primary) return null
  const found = await searchArtists(primary)
  if (found.length === 0) return null

  const target = primary.toLowerCase()
  return (
    found.find((artist) => artist.name.toLowerCase() === target) ??
    found.find((artist) => artist.name.toLowerCase().includes(target)) ??
    found[0]
  )
}

/** Lee una playlist pública de Spotify desde su enlace, URI o id. */
export async function fetchSpotifyPlaylist(
  source: string,
): Promise<ImportedPlaylist> {
  requireDesktop()
  return invoke<ImportedPlaylist>('spotify_playlist', { source: source.trim() })
}

/** Empareja canciones importadas con YouTube Music. */
export async function matchImport(tracks: ImportTrack[]): Promise<ImportMatch[]> {
  requireDesktop()
  if (tracks.length === 0) return []
  return invoke<ImportMatch[]>('match_import', { tracks })
}

export type ImportProgress = { done: number; total: number }

/** Progreso del emparejamiento (evento `import-progress` del backend). */
export async function onImportProgress(
  handler: (progress: ImportProgress) => void,
): Promise<() => void> {
  if (!isDesktop()) return () => undefined
  return listen<ImportProgress>('import-progress', (event) => handler(event.payload))
}

/**
 * Pide al backend la URL del proxy local con soporte de `Range`.
 * La primera vez tarda lo que tarde yt-dlp (~1-3 s); luego sale de caché.
 */
export async function resolveStream(videoId: string): Promise<StreamInfo> {
  requireDesktop()
  return invoke<StreamInfo>('resolve_stream', { videoId })
}

export type EngineInfo = {
  version: string
  proxy: string
  ytdlp: boolean
}

export async function getEngineInfo(): Promise<EngineInfo> {
  requireDesktop()
  return invoke<EngineInfo>('app_info')
}

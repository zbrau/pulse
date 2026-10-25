import { invoke } from '@tauri-apps/api/core'
import type { LyricLine, Lyrics, MusicTrack } from '../types'
import { isDesktop } from './music'

/**
 * Letra de una canción: lrclib (sincronizada) desde Rust, con InnerTube
 * como respaldo. Devuelve `null` si no hay nada.
 */
export async function getLyrics(track: MusicTrack): Promise<Lyrics | null> {
  if (!isDesktop()) return null

  const lyrics = await invoke<Lyrics>('get_lyrics', {
    videoId: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album ?? null,
    durationSec: track.durationSec,
  })

  const empty =
    !lyrics.synced && !lyrics.plain && !lyrics.instrumental
  return empty ? null : lyrics
}

/** Búsqueda manual de letras (sin canción sonando). */
export async function searchLyrics(query: string): Promise<Lyrics | null> {
  if (!isDesktop()) return null
  return invoke<Lyrics | null>('search_lyrics', { query })
}

export const currentLineIndex = (lines: LyricLine[], ms: number): number => {
  let lo = 0
  let hi = lines.length - 1
  let idx = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= ms) {
      idx = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return idx
}

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { DownloadQuality, MusicTrack } from '../types'
import { requireDesktop } from './desktop'

export type DownloadEntry = {
  id: string
  title: string
  artist: string
  album: string | null
  thumbnail: string
  durationSec: number
  file: string
  sizeBytes: number
  quality: DownloadQuality
  createdAt: number
}

export type DownloadProgress = {
  id: string
  percent: number
  totalBytes: number
  downloadedBytes: number
}

export type DownloadFailure = {
  id: string
  message: string
}

export type DownloadsInfo = {
  dir: string
  count: number
  totalBytes: number
  freeBytes: number
}

export const QUALITY_OPTIONS: Array<{
  id: DownloadQuality
  label: string
  detail: string
}> = [
  {
    id: 'best',
    label: 'Máxima',
    detail: 'El mejor audio disponible, sin recodificar.',
  },
  {
    id: 'high',
    label: 'Alta',
    detail: 'Hasta 160 kbps. Buen equilibrio en discos grandes.',
  },
  {
    id: 'medium',
    label: 'Media',
    detail: 'Hasta 128 kbps. Ocupa menos y suena bien.',
  },
  {
    id: 'low',
    label: 'Baja',
    detail: 'Hasta 96 kbps. Para ahorrar espacio al máximo.',
  },
]

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

/** Descarga una canción al disco (yt-dlp) y devuelve su entrada. */
export async function downloadTrack(
  track: MusicTrack,
  quality: DownloadQuality,
): Promise<DownloadEntry> {
  requireDesktop()
  return invoke<DownloadEntry>('download_track', {
    track: {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album ?? null,
      thumbnail: track.thumbnail,
      durationSec: track.durationSec,
    },
    quality,
  })
}

export async function listDownloads(): Promise<DownloadEntry[]> {
  requireDesktop()
  return invoke<DownloadEntry[]>('list_downloads')
}

export async function deleteDownload(id: string): Promise<void> {
  requireDesktop()
  await invoke('delete_download', { id })
}

export async function getDownloadsInfo(): Promise<DownloadsInfo> {
  requireDesktop()
  return invoke<DownloadsInfo>('downloads_info')
}

export async function revealDownloads(): Promise<void> {
  requireDesktop()
  await invoke('reveal_downloads')
}

export async function onDownloadProgress(
  handler: (progress: DownloadProgress) => void,
): Promise<() => void> {
  return listen<DownloadProgress>('download-progress', (event) =>
    handler(event.payload),
  )
}

export async function onDownloadDone(
  handler: (entry: DownloadEntry) => void,
): Promise<() => void> {
  return listen<DownloadEntry>('download-done', (event) => handler(event.payload))
}

export async function onDownloadError(
  handler: (failure: DownloadFailure) => void,
): Promise<() => void> {
  return listen<DownloadFailure>('download-error', (event) =>
    handler(event.payload),
  )
}

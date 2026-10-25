import type { ImportTrack } from '../types'

export type ParsedPlaylist = {
  name?: string
  tracks: ImportTrack[]
}

const cleanKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Parser CSV mínimo: comillas dobles, delimitador configurable. */
function parseCsvRows(text: string, delimiter = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

/** Exportify usa comas, pero Excel en español guarda punto y coma. */
function detectDelimiter(text: string): string {
  const line = text.slice(0, 4000).split('\n')[0] ?? ''
  const count = (needle: string) => line.split(needle).length - 1
  const commas = count(',')
  const semicolons = count(';')
  const tabs = count('\t')

  if (semicolons > commas && semicolons > tabs) return ';'
  if (tabs > commas && tabs > semicolons) return '\t'
  return ','
}

function parseDuration(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value > 10_000 ? value : value * 1000)
  }

  const text = String(value ?? '').trim().replace(',', '.')
  if (!text) return null

  if (/^\d+(\.\d+)?$/.test(text)) {
    const seconds = Number(text)
    return Math.round(seconds > 10_000 ? seconds : seconds * 1000)
  }

  const parts = text.split(':').map(Number)
  if (parts.some((part) => Number.isNaN(part))) return null
  if (parts.length === 3) {
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000
  }
  if (parts.length === 2) {
    return (parts[0] * 60 + parts[1]) * 1000
  }
  return null
}

function fromCsv(text: string, fallbackName?: string): ParsedPlaylist {
  const rows = parseCsvRows(text, detectDelimiter(text))
  if (rows.length < 2) {
    throw new Error('El CSV no tiene filas de canciones.')
  }

  const headers = rows[0].map(cleanKey)
  const findColumn = (...candidates: string[]) =>
    headers.findIndex((header) => candidates.includes(header))

  const titleIndex = findColumn('trackname', 'name', 'title', 'song', 'songname')
  const artistIndex = findColumn(
    'artistnames',
    'artistname',
    'artists',
    'artist',
    'artistsnames',
    'artist(s)',
  )

  if (titleIndex < 0 || artistIndex < 0) {
    throw new Error(
      'El CSV necesita columnas de título y artista. El de Exportify las incluye.',
    )
  }

  const albumIndex = findColumn('albumname', 'album')
  const durationIndex = findColumn('durationms', 'duration', 'length', 'trackduration')

  const tracks: ImportTrack[] = []
  for (const row of rows.slice(1)) {
    const title = (row[titleIndex] ?? '').trim()
    if (!title) continue
    const artist = (row[artistIndex] ?? '').trim()
    tracks.push({
      title,
      artist: artist || 'Desconocido',
      album: albumIndex >= 0 ? (row[albumIndex] ?? '').trim() || null : null,
      durationMs: durationIndex >= 0 ? parseDuration(row[durationIndex]) : null,
    })
  }

  if (tracks.length === 0) {
    throw new Error('El CSV no tiene canciones con título.')
  }

  return { name: fallbackName, tracks }
}

const TITLE_KEYS = ['title', 'name', 'trackName', 'track_name', 'Track Name', 'song']
const ARTIST_KEYS = [
  'artists',
  'artist',
  'artistName',
  'artist_name',
  'Artist Name(s)',
  'Artist Name',
  'Artist Names',
  'authors',
]
const ALBUM_KEYS = ['album', 'albumName', 'album_name', 'Album Name']
const DURATION_KEYS = ['duration_ms', 'durationMs', 'duration', 'Duration (ms)', 'length']

function matchKey(key: string, candidates: string[]): boolean {
  return candidates.some((candidate) => cleanKey(candidate) === cleanKey(key))
}

function readString(
  obj: Record<string, unknown>,
  candidates: string[],
): string | null {
  for (const [key, value] of Object.entries(obj)) {
    if (!matchKey(key, candidates)) continue
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function readArtists(obj: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(obj)) {
    if (!matchKey(key, ARTIST_KEYS)) continue

    if (typeof value === 'string' && value.trim()) return value.trim()

    if (Array.isArray(value)) {
      const names = value
        .map((item) => {
          if (typeof item === 'string') return item.trim()
          if (item && typeof item === 'object') {
            const name =
              (item as Record<string, unknown>).name ??
              (item as Record<string, unknown>).title
            return typeof name === 'string' ? name.trim() : ''
          }
          return ''
        })
        .filter(Boolean)
      if (names.length > 0) return names.join(', ')
    }

    if (value && typeof value === 'object') {
      const name = (value as Record<string, unknown>).name
      if (typeof name === 'string' && name.trim()) return name.trim()
    }
  }
  return null
}

function readAlbum(obj: Record<string, unknown>): string | null {
  const direct = readString(obj, ALBUM_KEYS)
  if (direct) return direct

  for (const [key, value] of Object.entries(obj)) {
    if (!matchKey(key, ALBUM_KEYS)) continue
    if (value && typeof value === 'object') {
      const name = (value as Record<string, unknown>).name
      if (typeof name === 'string' && name.trim()) return name.trim()
    }
  }
  return null
}

function readDuration(obj: Record<string, unknown>): number | null {
  for (const [key, value] of Object.entries(obj)) {
    if (!matchKey(key, DURATION_KEYS)) continue
    const parsed = parseDuration(value)
    if (parsed !== null) return parsed
  }
  return null
}

/** Recorre JSON de Spotify/Exportify buscando objetos que parezcan canciones. */
function walkJson(value: unknown, out: ImportTrack[], depth = 0): void {
  if (depth > 10 || out.length > 1000) return

  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, out, depth + 1)
    return
  }

  if (!value || typeof value !== 'object') return
  const obj = value as Record<string, unknown>

  // Un álbum agrupa canciones: se entra en su lista, no se añade como tema.
  if ('album_type' in obj) {
    walkJson(obj.tracks, out, depth + 1)
    return
  }

  const title = readString(obj, TITLE_KEYS)
  const artist = readArtists(obj)

  if (title && artist) {
    out.push({
      title,
      artist,
      album: readAlbum(obj),
      durationMs: readDuration(obj),
    })
    return
  }

  for (const child of Object.values(obj)) walkJson(child, out, depth + 1)
}

function playlistNameFrom(data: unknown, fallbackName?: string): string | undefined {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    if (typeof obj.name === 'string' && obj.name.trim() && 'tracks' in obj) {
      return obj.name.trim()
    }
    const playlist = obj.playlist
    if (playlist && typeof playlist === 'object') {
      const name = (playlist as Record<string, unknown>).name
      if (typeof name === 'string' && name.trim()) return name.trim()
    }
  }
  return fallbackName
}

/** Acepta CSV de Exportify y varios JSON de Spotify/Exportify. */
export function parsePlaylistText(
  text: string,
  filename = '',
): ParsedPlaylist {
  const trimmed = text.replace(/^\uFEFF/, '').trim()
  if (!trimmed) throw new Error('El archivo está vacío.')

  const fallbackName = filename.replace(/\.[^.]+$/, '') || undefined

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let data: unknown
    try {
      data = JSON.parse(trimmed)
    } catch {
      throw new Error('El JSON no se pudo leer.')
    }

    const tracks: ImportTrack[] = []
    walkJson(data, tracks)
    if (tracks.length === 0) {
      throw new Error(
        'No encontré canciones en ese JSON. Prueba con el CSV de Exportify.',
      )
    }

    return { name: playlistNameFrom(data, fallbackName), tracks }
  }

  return fromCsv(trimmed, fallbackName)
}

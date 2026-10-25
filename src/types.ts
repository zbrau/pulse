export type TimerMode = 'work' | 'short' | 'long'

export type Priority = 'alta' | 'media' | 'baja'

export type Task = {
  id: string
  title: string
  done: boolean
  priority: Priority
  /** Etiquetas libres sin el `#`. */
  tags: string[]
  /** Pomodoros completados mientras esta tarea estaba activa. */
  pomodoros: number
  /** Estimación en pomodoros. */
  estimate: number
  createdAt: number
  completedAt: number | null
}

/** Campos opcionales al crear una tarea desde el input rápido. */
export type TaskDraft = {
  priority?: Priority
  estimate?: number
  tags?: string[]
}

export type Settings = {
  workMin: number
  shortMin: number
  longMin: number
  cyclesBeforeLong: number
  autoStartBreaks: boolean
  autoStartWork: boolean
  soundOn: boolean
  lofiVolume: number
}

export type DayStat = {
  focusMinutes: number
  pomodoros: number
}

export type Timer = {
  mode: TimerMode
  /** Epoch ms en el que termina la sesión. null si está pausado. */
  endsAt: number | null
  /** Milisegundos restantes cuando está pausado. */
  remainingMs: number
  running: boolean
  /** Sesiones de trabajo completadas dentro del ciclo actual. */
  cycle: number
}

export type Station = {
  id: string
  name: string
  description: string
  url: string
}

export type LyricLine = {
  time: number
  text: string
}

export type Lyrics = {
  synced: LyricLine[] | null
  plain: string | null
  instrumental: boolean
  /** De dónde salió la letra. */
  source?: 'lrclib' | 'youtube' | 'none'
  title?: string | null
  artist?: string | null
}

export type MusicTrack = {
  id: string
  title: string
  artist: string
  durationSec: number
  durationFormatted: string
  thumbnail: string
  album?: string
  /** Canal de YouTube del artista, para abrir su perfil directamente. */
  artistId?: string | null
}

export type ArtistRef = {
  id: string
  name: string
  subscribers: string | null
  thumbnail: string
}

export type AlbumRef = {
  id: string
  title: string
  subtitle: string
  thumbnail: string
}

export type ArtistDetails = {
  id: string
  name: string
  banner: string
  subscribers: string | null
  monthlyListeners: string | null
  description: string
  tracks: MusicTrack[]
  albums: AlbumRef[]
  related: ArtistRef[]
}

export type AlbumDetails = {
  id: string
  title: string
  subtitle: string
  description: string | null
  thumbnail: string
  tracks: MusicTrack[]
}

export type ImportTrack = {
  title: string
  artist: string
  album?: string | null
  durationMs?: number | null
}

export type ImportMatch = {
  original: ImportTrack
  track: MusicTrack | null
  score: number
}

export type ImportedPlaylist = {
  name: string
  cover: string | null
  total: number
  truncated: boolean
  tracks: ImportTrack[]
}

/** Playlist importada que se conserva para escucharla sin volver a pegar el link. */
export type SavedPlaylist = {
  id: string
  name: string
  cover: string | null
  /** Origen normalizado (enlace de Spotify o `file:nombre.csv`). */
  origin: string
  createdAt: number
  updatedAt: number
  tracks: MusicTrack[]
}



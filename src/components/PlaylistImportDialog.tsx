import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  FileUp,
  LibraryBig,
  Link2,
  Loader2,
  Music4,
  Play,
  Plus,
  X,
} from 'lucide-react'
import { Modal } from './Modal'
import { useUi } from '../store/useUi'
import { usePlayerStore } from '../store/usePlayerStore'
import { useLibrary } from '../store/useLibrary'
import { fetchSpotifyPlaylist, matchImport, onImportProgress } from '../lib/music'
import type { ImportProgress } from '../lib/music'
import { parsePlaylistText } from '../lib/importTracks'
import type { ImportMatch, ImportTrack, MusicTrack } from '../types'

type Phase = 'idle' | 'working' | 'done' | 'error'
type Stage = 'playlist' | 'matching'

type PlaylistInfo = {
  name: string
  cover: string | null
  total: number
  truncated: boolean
}

export function PlaylistImportDialog() {
  const open = useUi((state) => state.importOpen)
  const close = useUi((state) => state.closeImport)
  const openLibrary = useUi((state) => state.openLibrary)

  const playTrack = usePlayerStore((state) => state.playTrack)
  const addManyToQueue = usePlayerStore((state) => state.addManyToQueue)
  const savePlaylist = useLibrary((state) => state.savePlaylist)

  const [source, setSource] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [stage, setStage] = useState<Stage>('playlist')
  const [progress, setProgress] = useState<ImportProgress>({ done: 0, total: 0 })
  const [playlist, setPlaylist] = useState<PlaylistInfo | null>(null)
  const [matches, setMatches] = useState<ImportMatch[]>([])
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState(false)
  const [autoSave, setAutoSave] = useState(true)
  const [savedToLibrary, setSavedToLibrary] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  /** Descarta importaciones que terminan después de cerrar el diálogo. */
  const attemptRef = useRef(0)

  // Progreso del backend mientras empareja canciones.
  useEffect(() => {
    if (!open) return
    let stop: (() => void) | undefined
    let alive = true

    onImportProgress((next) => setProgress(next))
      .then((unlisten) => {
        if (alive) stop = unlisten
        else unlisten()
      })
      .catch(() => undefined)

    return () => {
      alive = false
      stop?.()
    }
  }, [open])

  const reset = () => {
    attemptRef.current += 1
    setPhase('idle')
    setStage('playlist')
    setProgress({ done: 0, total: 0 })
    setPlaylist(null)
    setMatches([])
    setError(null)
    setAdded(false)
    setSavedToLibrary(false)
  }

  useEffect(() => {
    if (!open) reset()
  }, [open])

  const closeDialog = () => {
    close()
    reset()
  }

  const runImport = async (fileText?: string, filename?: string) => {
    if (phase === 'working') return

    const attempt = ++attemptRef.current

    setError(null)
    setMatches([])
    setPlaylist(null)
    setAdded(false)
    setSavedToLibrary(false)
    setStage('playlist')
    setPhase('working')

    try {
      let tracks: ImportTrack[]
      let info: PlaylistInfo
      let origin: string

      if (fileText !== undefined) {
        const parsed = parsePlaylistText(fileText, filename)
        tracks = parsed.tracks
        info = {
          name: parsed.name ?? 'Playlist importada',
          cover: null,
          total: parsed.tracks.length,
          truncated: false,
        }
        origin = `file:${(filename ?? 'playlist').toLowerCase()}`
      } else {
        if (!source.trim()) throw new Error('Pega el enlace de una playlist de Spotify.')
        const imported = await fetchSpotifyPlaylist(source)
        tracks = imported.tracks
        info = {
          name: imported.name,
          cover: imported.cover,
          total: imported.total,
          truncated: imported.truncated,
        }
        origin = source.trim()
      }

      if (tracks.length === 0) throw new Error('La playlist no tiene canciones.')

      if (attempt !== attemptRef.current) return
      setPlaylist(info)
      setStage('matching')
      setProgress({ done: 0, total: tracks.length })

      const found = await matchImport(tracks)
      if (attempt !== attemptRef.current) return
      setMatches(found)

      // Se guardan sólo las canciones que existen en YouTube Music: los
      // streams se resuelven al reproducir, así que no ocupa casi nada.
      const matchedTracks = found.flatMap((item) => (item.track ? [item.track] : []))
      if (autoSave && matchedTracks.length > 0) {
        savePlaylist({
          name: info.name,
          cover: info.cover ?? matchedTracks[0]?.thumbnail ?? null,
          origin,
          tracks: matchedTracks,
        })
        setSavedToLibrary(true)
      }

      setPhase('done')
    } catch (err) {
      if (attempt !== attemptRef.current) return
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const text = await file.text()
    void runImport(text, file.name)
  }

  const matched: MusicTrack[] = matches.flatMap((item) =>
    item.track ? [item.track] : [],
  )
  const missing = matches.filter((item) => !item.track)
  const artwork = playlist?.cover ?? matched[0]?.thumbnail ?? null
  const percent =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  const startPlaying = () => {
    if (matched.length === 0) return
    playTrack(matched[0], matched)
    closeDialog()
  }

  const addAll = () => {
    if (matched.length === 0) return
    addManyToQueue(matched)
    setAdded(true)
    window.setTimeout(() => setAdded(false), 1600)
  }

  return (
    <Modal
      open={open}
      onClose={closeDialog}
      title="Importar playlist"
      description="Trae una lista de Spotify al reproductor."
      widthClass="max-w-xl"
    >
      {phase === 'idle' && (
        <div className="space-y-4">
          <div className="space-y-2.5 rounded-xl border border-line bg-surface-2/40 p-3.5">
            <label className="block">
              <span className="text-[10px] font-medium tracking-[0.12em] text-faint uppercase">
                Enlace de Spotify
              </span>
              <div className="relative mt-1.5">
                <Link2
                  size={13}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
                />
                <input
                  type="url"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void runImport()
                    }
                  }}
                  placeholder="https://open.spotify.com/playlist/…"
                  className="input py-2 pr-3 pl-9 text-xs"
                  aria-label="Enlace de la playlist de Spotify"
                />
              </div>
            </label>

            <button
              type="button"
              onClick={() => void runImport()}
              disabled={!source.trim()}
              className="btn btn-accent w-full"
            >
              <Music4 size={14} /> Importar desde el enlace
            </button>
          </div>

          <div className="flex items-center gap-3 text-[10px] font-medium tracking-[0.14em] text-faint uppercase">
            <div className="h-px flex-1 bg-line-soft" />o<div className="h-px flex-1 bg-line-soft" />
          </div>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn w-full"
          >
            <FileUp size={14} /> Subir CSV o JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            onChange={handleFile}
            className="hidden"
            aria-label="Archivo de playlist"
          />

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-surface-2/30 px-3 py-2.5">
            <input
              type="checkbox"
              checked={autoSave}
              onChange={(event) => setAutoSave(event.target.checked)}
              className="mt-0.5 size-3.5 shrink-0 accent-accent"
            />
            <span className="min-w-0">
              <span className="block text-[11px] font-medium text-fg">
                Guardar en Mis playlists
              </span>
              <span className="block text-[10px] leading-relaxed text-faint">
                Podrás escucharla después sin volver a pegar el enlace.
              </span>
            </span>
          </label>

          <p className="text-[10.5px] leading-relaxed text-faint">
            Para listas privadas, exporta el CSV con{' '}
            <a
              href="https://exportify.net"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              Exportify
            </a>{' '}
            y súbelo aquí. Se importan hasta 100 canciones por enlace y después se
            buscan una a una en YouTube Music.
          </p>
        </div>
      )}

      {phase === 'working' && (
        <div className="space-y-3 py-4">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Loader2 size={14} className="animate-spin text-accent" />
            {stage === 'playlist'
              ? 'Leyendo la playlist de Spotify…'
              : `Buscando en YouTube Music… ${progress.done}/${progress.total}`}
          </div>

          {stage === 'matching' && progress.total > 0 && (
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
              aria-label="Progreso de importación"
            >
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
          )}

          {playlist && (
            <p className="text-[10.5px] text-faint">
              «{playlist.name}» · {playlist.total} canciones
            </p>
          )}
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/[0.07] px-3 py-2.5 text-[11px] leading-relaxed text-warn/90">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={reset} className="btn w-full">
            Reintentar
          </button>
        </div>
      )}

      {phase === 'done' && playlist && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {artwork ? (
              <img
                src={artwork}
                alt=""
                className="size-14 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
              />
            ) : (
              <div className="grid size-14 shrink-0 place-items-center rounded-lg bg-surface-2">
                <Music4 size={20} className="text-faint" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-fg">
                {playlist.name}
              </p>
              <p className="text-[11px] text-muted">
                {matched.length} de {matches.length} encontradas
                {missing.length > 0 ? ` · ${missing.length} sin match` : ''}
              </p>
            </div>
          </div>

          {playlist.truncated && (
            <p className="rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-[10.5px] leading-relaxed text-faint">
              Spotify sólo expone las primeras 100 canciones de un enlace. Para una
              lista completa, usa el CSV de Exportify.
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={startPlaying}
              disabled={matched.length === 0}
              className="btn btn-accent flex-1"
            >
              <Play size={13} fill="currentColor" /> Reproducir
            </button>
            <button
              type="button"
              onClick={addAll}
              disabled={matched.length === 0}
              className="btn flex-1"
            >
              {added ? <Check size={13} className="text-accent" /> : <Plus size={13} />}
              {added ? 'Añadidas' : 'A la cola'}
            </button>
          </div>

          {savedToLibrary && (
            <div className="flex items-center gap-2 rounded-lg border border-break/25 bg-break/[0.07] px-3 py-2 text-[10.5px] leading-relaxed text-break/90">
              <LibraryBig size={12} className="shrink-0" />
              <span className="flex-1">Guardada en Mis playlists</span>
              <button
                type="button"
                onClick={() => {
                  closeDialog()
                  openLibrary()
                }}
                className="shrink-0 font-medium text-accent hover:underline"
              >
                Ver
              </button>
            </div>
          )}

          <div className="rounded-xl border border-line bg-surface-2/30">
            <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[10px] font-medium tracking-[0.12em] text-faint uppercase">
              <span>Canciones</span>
              <span>{matches.length}</span>
            </div>
            <div className="scroll-thin max-h-48 space-y-0.5 overflow-y-auto p-1.5">
              {matches.map((item, index) => {
                const track = item.track
                return (
                  <div
                    key={`${item.original.title}-${index}`}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px]"
                  >
                    {track ? (
                      <Check size={12} className="shrink-0 text-break" />
                    ) : (
                      <X size={12} className="shrink-0 text-warn/80" />
                    )}
                    <span
                      className={`min-w-0 flex-1 truncate ${
                        track ? 'text-fg' : 'text-faint'
                      }`}
                      title={track ? track.title : item.original.title}
                    >
                      {track ? track.title : item.original.title}
                    </span>
                    <span className="max-w-[40%] shrink-0 truncate text-[10px] text-faint">
                      {track ? track.artist : item.original.artist}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {missing.length > 0 && (
            <p className="text-[10.5px] leading-relaxed text-faint">
              Las marcadas con ✕ no están en YouTube Music o tienen otro título.
              Puedes buscarlas a mano desde la barra de arriba.
            </p>
          )}

          <button type="button" onClick={reset} className="btn w-full">
            Importar otra lista
          </button>
        </div>
      )}
    </Modal>
  )
}

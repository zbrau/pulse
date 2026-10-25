import { useState, useEffect, useRef, type FormEvent } from 'react'
import {
  AlertCircle,
  Check,
  ChevronRight,
  LibraryBig,
  ListMusic,
  ListPlus,
  Loader2,
  Pause,
  Play,
  Plus,
  Radio,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { usePlayerStore } from '../store/usePlayerStore'
import { useUi } from '../store/useUi'
import { Visualizer } from './Visualizer'
import { findArtist, isDesktop, searchArtists, searchSongs } from '../lib/music'
import { formatTime } from '../lib/date'
import type { ArtistRef, MusicTrack } from '../types'

export function FreePlayerCard() {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    progressMs,
    durationMs,
    volume,
    isMuted,
    repeatMode,
    shuffle,
    queue,
    queueIndex,
    error,
    playTrack,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    nextTrack,
    prevTrack,
    addToQueue,
    removeFromQueue,
    clearQueue,
    toggleRepeat,
    toggleShuffle,
    clearError,
  } = usePlayerStore()

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<MusicTrack[]>([])
  const [artistResults, setArtistResults] = useState<ArtistRef[]>([])
  const [showResults, setShowResults] = useState(false)
  const [showQueue, setShowQueue] = useState(false)
  const [seekingValue, setSeekingValue] = useState<number | null>(null)
  const [addedId, setAddedId] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  const openArtist = useUi((state) => state.openArtist)
  const openImport = useUi((state) => state.openImport)
  const openLibrary = useUi((state) => state.openLibrary)

  const searchBoxRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const runSearch = async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      setResults([])
      setSearching(false)
      setShowResults(false)
      return
    }

    const token = ++requestRef.current
    setSearching(true)
    setShowResults(true)
    setSearchError(null)

    try {
      const [found, artists] = await Promise.all([
        searchSongs(trimmed),
        searchArtists(trimmed).catch(() => [] as ArtistRef[]),
      ])
      if (token !== requestRef.current) return
      setResults(found)
      setArtistResults(artists.slice(0, 3))
    } catch (err) {
      if (token !== requestRef.current) return
      setResults([])
      setArtistResults([])
      setSearchError(
        err instanceof Error ? err.message : 'No se pudo buscar en el catálogo',
      )
    } finally {
      if (token === requestRef.current) setSearching(false)
    }
  }

  const handleQueryChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!value.trim()) {
      setResults([])
      setArtistResults([])
      setSearching(false)
      setShowResults(false)
      return
    }

    setShowResults(true)
    setSearching(true)
    debounceRef.current = setTimeout(() => void runSearch(value), 450)
  }

  const handleManualSearch = (e: FormEvent) => {
    e.preventDefault()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    void runSearch(query)
  }

  const handlePlaySong = (track: MusicTrack) => {
    playTrack(track, results.length > 0 ? results : undefined)
    setShowResults(false)
  }

  const handleAddToQueue = (e: React.MouseEvent, track: MusicTrack) => {
    e.stopPropagation()
    addToQueue(track)
    setAddedId(track.id)
    setTimeout(() => setAddedId(null), 1200)
  }

  const handleOpenArtist = async (track: MusicTrack) => {
    if (track.artistId) {
      openArtist({ id: track.artistId, name: track.artist })
      setShowResults(false)
      return
    }

    try {
      const artist = await findArtist(track.artist)
      if (artist) {
        openArtist({ id: artist.id, name: artist.name })
        setShowResults(false)
      } else {
        setSearchError(`No encontré el perfil de ${track.artist}. Búscalo arriba.`)
        setShowResults(true)
      }
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : 'No se pudo abrir el artista',
      )
      setShowResults(true)
    }
  }

  const shownProgress = seekingValue ?? progressMs
  const duration = durationMs > 0 ? durationMs : (currentTrack?.durationSec ?? 0) * 1000

  const commitSeek = () => {
    if (seekingValue !== null) {
      seek(seekingValue)
      setSeekingValue(null)
    }
  }

  return (
    <section className="card relative flex flex-col">
      <div className="card-head">
        <div className="flex min-w-0 items-center gap-2">
          <Radio size={14} className="shrink-0 text-accent" />
          <h2 className="card-title">YouTube Music</h2>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[9.5px] font-medium tracking-wide text-accent">
            INNERTUBE
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openLibrary}
            className="icon-btn size-7"
            title="Mis playlists"
            aria-label="Mis playlists"
          >
            <LibraryBig size={14} />
          </button>
          <button
            type="button"
            onClick={openImport}
            className="icon-btn size-7"
            title="Importar playlist de Spotify"
            aria-label="Importar playlist de Spotify"
          >
            <ListPlus size={14} />
          </button>
          <button
            type="button"
            onClick={() => setShowQueue(!showQueue)}
            className={`icon-btn size-7 ${showQueue ? 'bg-accent/10 text-accent' : ''}`}
            title="Ver cola de reproducción"
            aria-label="Ver cola de reproducción"
          >
            <ListMusic size={14} />
            {queue.length > 0 && (
              <span className="ml-1 text-[10px] font-semibold">{queue.length}</span>
            )}
          </button>
        </div>
      </div>

      <div className="space-y-3.5 p-4 pt-1">
        <div ref={searchBoxRef} className="relative">
          <form onSubmit={handleManualSearch} className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onFocus={() => {
                if (results.length > 0) setShowResults(true)
              }}
              placeholder="Buscar canción, artista o álbum…"
              className="input py-2 pr-9 pl-9 text-xs"
              aria-label="Buscar música"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setResults([])
                  setArtistResults([])
                  setShowResults(false)
                  setSearchError(null)
                }}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-faint transition hover:text-fg"
                aria-label="Limpiar búsqueda"
              >
                <X size={13} />
              </button>
            ) : null}
            {searching && (
              <Loader2
                size={13}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 animate-spin text-accent"
              />
            )}
          </form>

          {showResults && (
            <div className="scroll-thin absolute top-full right-0 left-0 z-30 mt-1 max-h-72 space-y-1 overflow-y-auto rounded-xl border border-line bg-surface/95 p-1.5 shadow-2xl backdrop-blur-md">
              {artistResults.length > 0 && (
                <div className="mb-1 space-y-0.5 border-b border-line/70 pb-1">
                  <p className="px-2 pt-1 pb-0.5 text-[9px] font-medium tracking-[0.14em] text-faint uppercase">
                    Artistas
                  </p>
                  {artistResults.map((artist) => (
                    <button
                      key={artist.id}
                      type="button"
                      onClick={() => {
                        openArtist({ id: artist.id, name: artist.name })
                        setShowResults(false)
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-surface-2"
                    >
                      {artist.thumbnail ? (
                        <img
                          src={artist.thumbnail}
                          alt=""
                          className="size-9 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                          loading="lazy"
                        />
                      ) : (
                        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2">
                          <Radio size={14} className="text-faint" />
                        </div>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-fg">
                          {artist.name}
                        </span>
                        <span className="block truncate text-[10.5px] text-muted">
                          {artist.subscribers ?? 'Artista'}
                        </span>
                      </span>
                      <ChevronRight size={13} className="shrink-0 text-faint" />
                    </button>
                  ))}
                </div>
              )}

              {searching && results.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted">
                  <Loader2 size={14} className="animate-spin text-accent" />
                  <span>Buscando en YouTube Music…</span>
                </div>
              ) : searchError ? (
                <div className="flex items-start gap-2 px-2 py-3 text-[11px] leading-relaxed text-warn">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  <span>{searchError}</span>
                </div>
              ) : results.length > 0 ? (
                results.map((track) => (
                  <div
                    key={track.id}
                    onClick={() => handlePlaySong(track)}
                    className="group flex cursor-pointer items-center justify-between gap-2.5 rounded-lg p-2 transition-colors hover:bg-surface-2"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {track.thumbnail ? (
                        <img
                          src={track.thumbnail}
                          alt=""
                          className="size-9 shrink-0 rounded-md object-cover ring-1 ring-white/10"
                          loading="lazy"
                        />
                      ) : (
                        <div className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2">
                          <Radio size={14} className="text-faint" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-fg transition-colors group-hover:text-accent">
                          {track.title}
                        </p>
                        <p className="truncate text-[11px] text-muted">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              void handleOpenArtist(track)
                            }}
                            className="hover:text-accent hover:underline"
                            title={`Ver perfil de ${track.artist}`}
                          >
                            {track.artist}
                          </button>
                          <span> · {track.durationFormatted}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => handleAddToQueue(e, track)}
                        className="icon-btn size-7 text-faint hover:text-fg"
                        title="Añadir a la cola"
                        aria-label={`Añadir ${track.title} a la cola`}
                      >
                        {addedId === track.id ? (
                          <Check size={13} className="text-accent" />
                        ) : (
                          <Plus size={13} />
                        )}
                      </button>
                      <button
                        type="button"
                        className="grid size-7 place-items-center rounded-full bg-accent/15 text-accent transition-all group-hover:bg-accent group-hover:text-bg"
                        aria-label={`Reproducir ${track.title}`}
                      >
                        <Play size={11} fill="currentColor" className="ml-0.5" />
                      </button>
                    </div>
                  </div>
                ))
              ) : query.trim() ? (
                <p className="py-4 text-center text-xs text-faint">
                  Sin resultados para «{query}»
                </p>
              ) : null}
            </div>
          )}
        </div>

        {showQueue ? (
          <div className="space-y-2 rounded-xl border border-line bg-surface-2/40 p-3">
            <div className="flex items-center justify-between border-b border-line pb-1 text-[11px] text-muted">
              <span className="font-medium">Cola ({queue.length})</span>
              {queue.length > 0 && (
                <button
                  type="button"
                  onClick={clearQueue}
                  className="text-[10px] text-faint hover:text-fg"
                >
                  Vaciar
                </button>
              )}
            </div>
            {queue.length === 0 ? (
              <p className="py-4 text-center text-xs text-faint">
                La cola está vacía. Añade canciones con el botón (+).
              </p>
            ) : (
              <div className="scroll-thin max-h-48 space-y-1 overflow-y-auto pr-1">
                {queue.map((t, idx) => (
                  <div
                    key={`${t.id}-${idx}`}
                    className={`flex items-center justify-between gap-2 rounded-lg p-1.5 text-xs ${
                      idx === queueIndex
                        ? 'bg-accent/15 font-medium text-accent'
                        : 'text-fg hover:bg-surface-2'
                    }`}
                  >
                    <div
                      className="min-w-0 flex-1 cursor-pointer truncate"
                      onClick={() => playTrack(t)}
                    >
                      <span className="mr-1.5 text-[10px] text-faint">{idx + 1}.</span>
                      {t.title}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromQueue(idx)}
                      className="p-1 text-faint hover:text-fg"
                      title="Quitar"
                      aria-label={`Quitar ${t.title} de la cola`}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {currentTrack ? (
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-3">
              {currentTrack.thumbnail ? (
                <div className="group relative size-14 shrink-0">
                  <img
                    src={currentTrack.thumbnail}
                    alt={currentTrack.title}
                    className="size-14 rounded-xl object-cover shadow-lg ring-1 ring-white/10"
                  />
                  {isBuffering && (
                    <div className="absolute inset-0 grid place-items-center rounded-xl bg-black/50">
                      <Loader2 size={16} className="animate-spin text-accent" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-surface-2 text-faint">
                  <Radio size={20} />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[13px] font-semibold text-fg"
                  title={currentTrack.title}
                >
                  {currentTrack.title}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  <button
                    type="button"
                    onClick={() => void handleOpenArtist(currentTrack)}
                    className="hover:text-accent hover:underline"
                    title={`Ver perfil de ${currentTrack.artist}`}
                  >
                    {currentTrack.artist}
                  </button>
                </p>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-faint">
                  {isBuffering ? (
                    <span className="text-accent/80">preparando audio…</span>
                  ) : (
                    <span className="text-break/80">stream local</span>
                  )}
                  {currentTrack.album && (
                    <>
                      <span>·</span>
                      <span className="truncate">{currentTrack.album}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div>
              <input
                type="range"
                min={0}
                max={duration || 1}
                value={shownProgress}
                onChange={(e) => setSeekingValue(Number(e.target.value))}
                onPointerUp={commitSeek}
                onKeyUp={commitSeek}
                className="w-full cursor-pointer accent-accent"
                aria-label="Posición de la canción"
              />
              <div className="mt-1 flex justify-between font-mono text-[10.5px] text-faint">
                <span>{formatTime(shownProgress)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={toggleShuffle}
                className={`icon-btn size-8 ${shuffle ? 'text-accent' : 'text-faint'}`}
                title="Aleatorio"
                aria-label="Aleatorio"
                aria-pressed={shuffle}
              >
                <Shuffle size={14} />
              </button>

              <button
                type="button"
                onClick={prevTrack}
                className="icon-btn size-8 text-fg"
                title="Anterior"
                aria-label="Anterior"
              >
                <SkipBack size={15} fill="currentColor" />
              </button>

              <button
                type="button"
                onClick={togglePlay}
                className="grid size-11 place-items-center rounded-full bg-accent text-bg shadow-md transition-all hover:scale-105 active:scale-95"
                title={isPlaying ? 'Pausar' : 'Reproducir'}
                aria-label={isPlaying ? 'Pausar música' : 'Reproducir música'}
              >
                {isPlaying ? (
                  <Pause size={18} fill="currentColor" />
                ) : (
                  <Play size={18} fill="currentColor" className="ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={nextTrack}
                className="icon-btn size-8 text-fg"
                title="Siguiente"
                aria-label="Siguiente"
              >
                <SkipForward size={15} fill="currentColor" />
              </button>

              <button
                type="button"
                onClick={toggleRepeat}
                className={`icon-btn size-8 ${
                  repeatMode !== 'off' ? 'text-accent' : 'text-faint'
                }`}
                title={`Repetir: ${repeatMode}`}
                aria-label={`Repetir: ${repeatMode}`}
              >
                {repeatMode === 'one' ? <Repeat1 size={14} /> : <Repeat size={14} />}
              </button>
            </div>

            <div className="flex items-center gap-2 px-1 pt-1">
              <button
                type="button"
                onClick={toggleMute}
                className="text-faint transition-colors hover:text-fg"
                title={isMuted ? 'Activar sonido' : 'Silenciar'}
                aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX size={14} />
                ) : volume < 0.5 ? (
                  <Volume1 size={14} />
                ) : (
                  <Volume2 size={14} />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer accent-accent"
                aria-label="Volumen de la música"
              />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line/80 px-4 py-8 text-center">
            <Radio size={24} className="mx-auto mb-2 text-faint opacity-60" />
            <p className="text-xs font-medium text-muted">
              ¿Qué quieres escuchar hoy?
            </p>
            <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-faint">
              {isDesktop()
                ? 'Escribe un tema o artista arriba: el catálogo sale de YouTube Music y el audio lo sirve el motor local.'
                : 'Abre la app de escritorio («npm run desktop») para buscar y reproducir.'}
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/[0.07] px-2.5 py-2">
            <AlertCircle size={12} className="mt-0.5 shrink-0 text-warn" />
            <p className="flex-1 text-[10.5px] leading-relaxed text-warn/90">{error}</p>
            <button
              type="button"
              onClick={clearError}
              className="text-[10px] text-warn/60 hover:text-warn"
            >
              ok
            </button>
          </div>
        )}
      </div>

      <Visualizer />
    </section>
  )
}

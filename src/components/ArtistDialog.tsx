import { useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Disc3,
  Loader2,
  Play,
  Plus,
} from 'lucide-react'
import { Modal } from './Modal'
import { useUi } from '../store/useUi'
import { usePlayerStore } from '../store/usePlayerStore'
import { getAlbum, getArtist } from '../lib/music'
import type {
  AlbumDetails,
  AlbumRef,
  ArtistDetails,
  ArtistRef,
  MusicTrack,
} from '../types'

function TrackList({
  tracks,
  onPlay,
  onAdd,
  addedId,
}: {
  tracks: MusicTrack[]
  onPlay: (track: MusicTrack) => void
  onAdd: (event: React.MouseEvent, track: MusicTrack) => void
  addedId: string | null
}) {
  return (
    <div className="space-y-0.5">
      {tracks.map((track, index) => (
        <div
          key={`${track.id}-${index}`}
          onClick={() => onPlay(track)}
          className="group flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-2"
        >
          <span className="w-4 shrink-0 text-right font-mono text-[10px] text-faint">
            {index + 1}
          </span>

          {track.thumbnail ? (
            <img
              src={track.thumbnail}
              alt=""
              className="size-9 shrink-0 rounded-md object-cover ring-1 ring-white/10"
              loading="lazy"
            />
          ) : (
            <div className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2">
              <Disc3 size={14} className="text-faint" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p
              className="truncate text-xs font-medium text-fg transition-colors group-hover:text-accent"
              title={track.title}
            >
              {track.title}
            </p>
            <p className="truncate text-[10.5px] text-muted">{track.artist}</p>
          </div>

          {track.durationSec > 0 && (
            <span className="shrink-0 font-mono text-[10px] text-faint">
              {track.durationFormatted}
            </span>
          )}

          <button
            type="button"
            onClick={(event) => onAdd(event, track)}
            className="icon-btn size-7 shrink-0 text-faint hover:text-fg"
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
            onClick={(event) => {
              event.stopPropagation()
              onPlay(track)
            }}
            className="grid size-7 shrink-0 place-items-center rounded-full bg-accent/15 text-accent transition-all group-hover:bg-accent group-hover:text-bg"
            aria-label={`Reproducir ${track.title}`}
          >
            <Play size={11} fill="currentColor" className="ml-0.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

function AlbumPanel({
  album,
  loading,
  error,
  onBack,
  onPlay,
  onPlayAll,
  onAdd,
  addedId,
}: {
  album: AlbumDetails | null
  loading: boolean
  error: string | null
  onBack: () => void
  onPlay: (track: MusicTrack, queue: MusicTrack[]) => void
  onPlayAll: (queue: MusicTrack[]) => void
  onAdd: (event: React.MouseEvent, track: MusicTrack) => void
  addedId: string | null
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1.5 text-[11px] text-muted transition hover:text-fg"
      >
        <ArrowLeft size={13} /> Volver al artista
      </button>

      {loading && (
        <div className="flex items-center gap-2 py-8 text-xs text-muted">
          <Loader2 size={14} className="animate-spin text-accent" /> Cargando álbum…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/[0.07] px-3 py-2 text-[11px] text-warn/90">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {album && (
        <>
          <div className="flex items-end gap-4">
            {album.thumbnail ? (
              <img
                src={album.thumbnail}
                alt={album.title}
                className="size-28 shrink-0 rounded-xl object-cover shadow-lg ring-1 ring-white/10"
              />
            ) : (
              <div className="grid size-28 shrink-0 place-items-center rounded-xl bg-surface-2">
                <Disc3 size={28} className="text-faint" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium tracking-[0.16em] text-accent uppercase">
                Álbum
              </p>
              <h3 className="mt-1 truncate text-lg font-semibold text-fg" title={album.title}>
                {album.title}
              </h3>
              <p className="truncate text-[11.5px] text-muted">
                {album.subtitle}
                {album.tracks.length > 0 ? ` · ${album.tracks.length} canciones` : ''}
              </p>
              <button
                type="button"
                onClick={() => album.tracks[0] && onPlayAll(album.tracks)}
                disabled={album.tracks.length === 0}
                className="btn btn-accent mt-3 px-3 py-1.5 text-[11.5px]"
              >
                <Play size={12} fill="currentColor" /> Reproducir
              </button>
            </div>
          </div>

          {album.description && (
            <p className="mt-3 line-clamp-3 text-[10.5px] leading-relaxed text-faint">
              {album.description}
            </p>
          )}

          <div className="mt-4">
            <TrackList
              tracks={album.tracks}
              onPlay={(track) => onPlay(track, album.tracks)}
              onAdd={onAdd}
              addedId={addedId}
            />
          </div>
        </>
      )}
    </div>
  )
}

export function ArtistDialog() {
  const artist = useUi((state) => state.artist)
  const close = useUi((state) => state.closeArtist)
  const openArtist = useUi((state) => state.openArtist)

  const playTrack = usePlayerStore((state) => state.playTrack)
  const addToQueue = usePlayerStore((state) => state.addToQueue)

  const [details, setDetails] = useState<ArtistDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [addedId, setAddedId] = useState<string | null>(null)

  const [albumRef, setAlbumRef] = useState<AlbumRef | null>(null)
  const [album, setAlbum] = useState<AlbumDetails | null>(null)
  const [albumLoading, setAlbumLoading] = useState(false)
  const [albumError, setAlbumError] = useState<string | null>(null)

  const artistId = artist?.id

  useEffect(() => {
    if (!artistId) return
    let alive = true

    setDetails(null)
    setError(null)
    setExpanded(false)
    setAlbumRef(null)
    setAlbum(null)
    setAlbumError(null)
    setLoading(true)

    getArtist(artistId)
      .then((data) => {
        if (alive) setDetails(data)
      })
      .catch((err: unknown) => {
        if (alive) {
          setError(
            err instanceof Error ? err.message : 'No se pudo cargar el artista',
          )
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [artistId])

  const openAlbum = (ref: AlbumRef) => {
    setAlbumRef(ref)
    setAlbum(null)
    setAlbumError(null)
    setAlbumLoading(true)

    getAlbum(ref.id)
      .then(setAlbum)
      .catch((err: unknown) =>
        setAlbumError(err instanceof Error ? err.message : 'No se pudo cargar el álbum'),
      )
      .finally(() => setAlbumLoading(false))
  }

  const playTracks = (tracks: MusicTrack[]) => {
    if (tracks.length === 0) return
    playTrack(tracks[0], tracks)
  }

  const handleAdd = (event: React.MouseEvent, track: MusicTrack) => {
    event.stopPropagation()
    addToQueue(track)
    setAddedId(track.id)
    window.setTimeout(() => setAddedId(null), 1200)
  }

  if (!artist) return null

  return (
    <Modal
      open
      onClose={close}
      title={albumRef ? 'Álbum' : 'Artista'}
      description={albumRef ? 'YouTube Music' : 'Perfil de artista · YouTube Music'}
      widthClass="max-w-2xl"
    >
      {albumRef ? (
        <AlbumPanel
          album={album}
          loading={albumLoading}
          error={albumError}
          onBack={() => {
            setAlbumRef(null)
            setAlbum(null)
            setAlbumError(null)
          }}
          onPlay={playTrack}
          onPlayAll={playTracks}
          onAdd={handleAdd}
          addedId={addedId}
        />
      ) : loading ? (
        <div className="flex items-center gap-2 py-10 text-xs text-muted">
          <Loader2 size={14} className="animate-spin text-accent" /> Cargando perfil…
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/[0.07] px-3 py-2 text-[11px] leading-relaxed text-warn/90">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : details ? (
        <div>
          <div className="relative -mx-5 -mt-4 mb-4 h-44 overflow-hidden">
            {details.banner ? (
              <img
                src={details.banner}
                alt=""
                className="absolute inset-0 size-full object-cover opacity-60"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-accent/25 via-surface-2 to-surface" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/55 to-transparent" />

            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
              <div className="min-w-0">
                <p className="text-[10px] font-medium tracking-[0.18em] text-accent uppercase">
                  Artista
                </p>
                <h3
                  className="mt-0.5 truncate text-2xl font-semibold text-fg"
                  title={details.name}
                >
                  {details.name}
                </h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-muted">
                  {details.monthlyListeners && (
                    <span>{details.monthlyListeners}</span>
                  )}
                  {details.monthlyListeners && details.subscribers && (
                    <span className="text-faint">·</span>
                  )}
                  {details.subscribers && (
                    <span>{details.subscribers} suscriptores</span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => playTracks(details.tracks)}
                disabled={details.tracks.length === 0}
                className="btn btn-accent shrink-0 px-3.5 py-2 text-[12px]"
              >
                <Play size={13} fill="currentColor" /> Reproducir
              </button>
            </div>
          </div>

          {details.description && (
            <div className="mb-4">
              <p
                className={`text-[10.5px] leading-relaxed text-faint ${
                  expanded ? '' : 'line-clamp-3'
                }`}
              >
                {details.description}
              </p>
              {details.description.length > 220 && (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  aria-expanded={expanded}
                  className="mt-1 text-[10.5px] text-accent hover:underline"
                >
                  {expanded ? 'Ver menos' : 'Ver más'}
                </button>
              )}
            </div>
          )}

          {details.tracks.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className="text-[10.5px] font-medium tracking-[0.14em] text-faint uppercase">
                  Canciones más escuchadas
                </h3>
                <button
                  type="button"
                  onClick={() => playTracks(details.tracks)}
                  className="text-[10.5px] text-accent hover:underline"
                >
                  Reproducir todo
                </button>
              </div>
              <TrackList
                tracks={details.tracks}
                onPlay={(track) => playTrack(track, details.tracks)}
                onAdd={handleAdd}
                addedId={addedId}
              />
            </div>
          )}

          {details.albums.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-[10.5px] font-medium tracking-[0.14em] text-faint uppercase">
                Álbumes y singles
              </h3>
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {details.albums.map((ref) => (
                  <button
                    key={ref.id}
                    type="button"
                    onClick={() => openAlbum(ref)}
                    className="group min-w-0 text-left"
                    aria-label={`Abrir ${ref.title}`}
                  >
                    {ref.thumbnail ? (
                      <img
                        src={ref.thumbnail}
                        alt=""
                        className="aspect-square w-full rounded-lg object-cover shadow ring-1 ring-white/5 transition group-hover:ring-accent/40"
                        loading="lazy"
                      />
                    ) : (
                      <div className="grid aspect-square w-full place-items-center rounded-lg bg-surface-2">
                        <Disc3 size={20} className="text-faint" />
                      </div>
                    )}
                    <p className="mt-1.5 truncate text-[11px] font-medium text-fg group-hover:text-accent">
                      {ref.title}
                    </p>
                    <p className="truncate text-[10px] text-faint">{ref.subtitle}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {details.related.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-[10.5px] font-medium tracking-[0.14em] text-faint uppercase">
                Artistas similares
              </h3>
              <div className="scroll-thin flex gap-3 overflow-x-auto pb-1">
                {details.related.slice(0, 10).map((ref: ArtistRef) => (
                  <button
                    key={ref.id}
                    type="button"
                    onClick={() => openArtist({ id: ref.id, name: ref.name })}
                    className="group w-20 shrink-0 text-center"
                    aria-label={`Abrir ${ref.name}`}
                  >
                    {ref.thumbnail ? (
                      <img
                        src={ref.thumbnail}
                        alt=""
                        className="mx-auto size-16 rounded-full object-cover ring-1 ring-white/10 transition group-hover:ring-accent/50"
                        loading="lazy"
                      />
                    ) : (
                      <div className="mx-auto grid size-16 place-items-center rounded-full bg-surface-2">
                        <Disc3 size={18} className="text-faint" />
                      </div>
                    )}
                    <p className="mt-1.5 truncate text-[10.5px] text-muted group-hover:text-fg">
                      {ref.name}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center gap-1 text-[10px] text-faint">
            <ChevronRight size={11} />
            <span>Toca una canción para reproducirla; el resto queda en la cola.</span>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Check,
  ChevronDown,
  LibraryBig,
  ListPlus,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { Modal } from './Modal'
import { useUi } from '../store/useUi'
import { useLibrary } from '../store/useLibrary'
import { usePlayerStore } from '../store/usePlayerStore'
import type { SavedPlaylist } from '../types'

const formatDate = (timestamp: number): string =>
  new Date(timestamp).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  })

export function LibraryDialog() {
  const open = useUi((state) => state.libraryOpen)
  const close = useUi((state) => state.closeLibrary)
  const openImport = useUi((state) => state.openImport)

  const playlists = useLibrary((state) => state.playlists)
  const rename = useLibrary((state) => state.rename)
  const remove = useLibrary((state) => state.remove)

  const playTrack = usePlayerStore((state) => state.playTrack)
  const addManyToQueue = usePlayerStore((state) => state.addManyToQueue)
  const currentTrackId = usePlayerStore((state) => state.currentTrack?.id ?? null)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [addedId, setAddedId] = useState<string | null>(null)

  useEffect(() => {
    if (open) return
    setExpanded(null)
    setRenaming(null)
    setConfirmDelete(null)
    setAddedId(null)
  }, [open])

  const sorted = useMemo(
    () => [...playlists].sort((a, b) => b.updatedAt - a.updatedAt),
    [playlists],
  )

  const startPlaylist = (playlist: SavedPlaylist) => {
    const first = playlist.tracks[0]
    if (!first) return
    playTrack(first, playlist.tracks)
    close()
  }

  const queuePlaylist = (playlist: SavedPlaylist) => {
    addManyToQueue(playlist.tracks)
    setAddedId(playlist.id)
    window.setTimeout(() => setAddedId(null), 1400)
  }

  const startRename = (playlist: SavedPlaylist) => {
    setRenaming(playlist.id)
    setDraft(playlist.name)
    setConfirmDelete(null)
  }

  const submitRename = (event: FormEvent) => {
    event.preventDefault()
    if (!renaming) return
    rename(renaming, draft)
    setRenaming(null)
  }

  const goImport = () => {
    close()
    openImport()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Mis playlists"
      description="Guardadas en este equipo: se reproducen sin volver a pegar el enlace."
      widthClass="max-w-xl"
    >
      <div className="space-y-3">
        {sorted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
            <LibraryBig size={26} className="mx-auto mb-2 text-faint opacity-60" />
            <p className="text-xs font-medium text-muted">Todavía no hay playlists</p>
            <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-faint">
              Importa una lista de Spotify (enlace o CSV) y se guardará aquí con sus
              canciones para escucharla cuando quieras.
            </p>
          </div>
        ) : (
          sorted.map((playlist) => {
            const isExpanded = expanded === playlist.id
            const isRenaming = renaming === playlist.id
            const cover = playlist.cover ?? playlist.tracks[0]?.thumbnail ?? null

            return (
              <div
                key={playlist.id}
                className="rounded-xl border border-line bg-surface-2/30"
              >
                <div className="flex items-center gap-2.5 p-2.5">
                  <button
                    type="button"
                    onClick={() => startPlaylist(playlist)}
                    className="group relative size-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10"
                    aria-label={`Reproducir ${playlist.name}`}
                    title={`Reproducir ${playlist.name}`}
                  >
                    {cover ? (
                      <img
                        src={cover}
                        alt=""
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="grid size-full place-items-center bg-surface-2">
                        <LibraryBig size={16} className="text-faint" />
                      </span>
                    )}
                    <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                      <Play size={14} fill="currentColor" className="text-fg" />
                    </span>
                  </button>

                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <form onSubmit={submitRename} className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={draft}
                          maxLength={80}
                          onChange={(event) => setDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') setRenaming(null)
                          }}
                          className="input min-w-0 flex-1 px-2 py-1 text-xs"
                          aria-label="Nuevo nombre de la playlist"
                        />
                        <button
                          type="submit"
                          className="icon-btn size-7 text-accent"
                          aria-label="Guardar nombre"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenaming(null)}
                          className="icon-btn size-7"
                          aria-label="Cancelar cambio de nombre"
                        >
                          <X size={14} />
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startPlaylist(playlist)}
                        className="block w-full text-left"
                      >
                        <span className="block truncate text-xs font-medium text-fg transition-colors hover:text-accent">
                          {playlist.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[10.5px] text-muted">
                          {playlist.tracks.length} canciones · {formatDate(playlist.updatedAt)}
                        </span>
                      </button>
                    )}
                  </div>

                  {!isRenaming && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => queuePlaylist(playlist)}
                        className="icon-btn size-7"
                        title="Añadir a la cola"
                        aria-label={`Añadir ${playlist.name} a la cola`}
                      >
                        {addedId === playlist.id ? (
                          <Check size={13} className="text-accent" />
                        ) : (
                          <Plus size={13} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpanded(isExpanded ? null : playlist.id)}
                        className={`icon-btn size-7 ${isExpanded ? 'text-accent' : ''}`}
                        title={isExpanded ? 'Ocultar canciones' : 'Ver canciones'}
                        aria-label={
                          isExpanded
                            ? `Ocultar canciones de ${playlist.name}`
                            : `Ver canciones de ${playlist.name}`
                        }
                        aria-expanded={isExpanded}
                      >
                        <ChevronDown
                          size={14}
                          className={`transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => startRename(playlist)}
                        className="icon-btn size-7"
                        title="Renombrar"
                        aria-label={`Renombrar ${playlist.name}`}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDelete(
                            confirmDelete === playlist.id ? null : playlist.id,
                          )
                        }
                        className={`icon-btn size-7 ${
                          confirmDelete === playlist.id ? 'text-warn' : ''
                        }`}
                        title="Eliminar playlist"
                        aria-label={`Eliminar ${playlist.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {confirmDelete === playlist.id && (
                  <div className="flex items-center justify-between gap-2 border-t border-line-soft px-2.5 py-2">
                    <span className="min-w-0 truncate text-[11px] text-warn/90">
                      ¿Eliminar «{playlist.name}»?
                    </span>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                        className="rounded-lg px-2 py-1 text-[11px] text-muted transition hover:bg-surface-2 hover:text-fg"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          remove(playlist.id)
                          setConfirmDelete(null)
                        }}
                        className="rounded-lg border border-warn/35 bg-warn/[0.08] px-2 py-1 text-[11px] text-warn transition hover:bg-warn/15"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                )}

                {isExpanded && (
                  <div className="border-t border-line-soft px-2 pt-1.5 pb-2">
                    <div className="scroll-thin max-h-56 space-y-0.5 overflow-y-auto pr-0.5">
                      {playlist.tracks.map((track, index) => {
                        const active = currentTrackId === track.id
                        return (
                          <button
                            key={`${track.id}-${index}`}
                            type="button"
                            onClick={() => {
                              playTrack(track, playlist.tracks)
                              close()
                            }}
                            className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[11px] transition-colors ${
                              active
                                ? 'bg-accent/15 font-medium text-accent'
                                : 'text-fg hover:bg-surface-2'
                            }`}
                          >
                            <span className="tnum w-4 shrink-0 text-right text-[9.5px] text-faint">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                              {track.title}
                            </span>
                            <span className="max-w-[38%] shrink-0 truncate text-[10px] text-faint">
                              {track.artist}
                            </span>
                            <span className="tnum shrink-0 font-mono text-[9.5px] text-faint">
                              {track.durationFormatted}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}

        <button type="button" onClick={goImport} className="btn btn-accent w-full">
          <ListPlus size={14} /> Importar una playlist
        </button>
      </div>
    </Modal>
  )
}

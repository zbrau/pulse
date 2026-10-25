import { useState } from 'react'
import {
  FolderOpen,
  HardDriveDownload,
  ListPlus,
  Loader2,
  Pause,
  Play,
  Trash2,
} from 'lucide-react'
import { Modal } from './Modal'
import { useUi } from '../store/useUi'
import { useDownloads } from '../store/useDownloads'
import { useStore } from '../store/useStore'
import { usePlayerStore } from '../store/usePlayerStore'
import {
  formatBytes,
  QUALITY_OPTIONS,
  revealDownloads,
  type DownloadEntry,
} from '../lib/downloads'
import { formatTime } from '../lib/date'
import type { MusicTrack } from '../types'

const asTrack = (entry: DownloadEntry): MusicTrack => ({
  id: entry.id,
  title: entry.title,
  artist: entry.artist,
  album: entry.album ?? undefined,
  durationSec: entry.durationSec,
  durationFormatted: formatTime(entry.durationSec * 1000),
  thumbnail: entry.thumbnail,
})

const formatDate = (seconds: number): string =>
  new Date(seconds * 1000).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  })

export function DownloadsDialog() {
  const open = useUi((state) => state.downloadsOpen)
  const close = useUi((state) => state.closeDownloads)

  const entries = useDownloads((state) => state.entries)
  const pending = useDownloads((state) => state.pending)
  const progress = useDownloads((state) => state.progress)
  const errors = useDownloads((state) => state.errors)
  const info = useDownloads((state) => state.info)
  const remove = useDownloads((state) => state.remove)

  const settings = useStore((state) => state.settings)
  const updateSettings = useStore((state) => state.updateSettings)

  const playTrack = usePlayerStore((state) => state.playTrack)
  const addManyToQueue = usePlayerStore((state) => state.addManyToQueue)
  const unloadTrack = usePlayerStore((state) => state.unloadTrack)
  const currentTrackId = usePlayerStore((state) => state.currentTrack?.id ?? null)
  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const togglePlay = usePlayerStore((state) => state.togglePlay)

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [folderError, setFolderError] = useState<string | null>(null)

  const openFolder = () => {
    setFolderError(null)
    revealDownloads().catch((err: unknown) =>
      setFolderError(err instanceof Error ? err.message : String(err)),
    )
  }

  const handleRemove = (id: string) => {
    unloadTrack(id)
    setConfirmDelete(null)
    void remove(id)
  }

  const inFlight = Object.values(progress).filter(
    (item) => !entries.some((entry) => entry.id === item.id),
  )
  const freeLow = info ? info.freeBytes > 0 && info.freeBytes < 1024 ** 3 : false

  return (
    <Modal
      open={open}
      onClose={close}
      title="Escuchar sin conexión"
      description="Canciones guardadas en este equipo. Se reproducen sin red."
      widthClass="max-w-xl"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-line bg-surface-2/40 px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11.5px] text-fg">
                {entries.length} {entries.length === 1 ? 'canción' : 'canciones'} ·{' '}
                <span className="text-muted">{formatBytes(info?.totalBytes ?? 0)}</span>
              </p>
              <p
                className="mt-0.5 truncate font-mono text-[9.5px] text-faint"
                title={info?.dir}
              >
                {info?.dir ?? 'Carpeta de descargas'}
              </p>
              <p className={`mt-1 text-[10px] ${freeLow ? 'text-warn/90' : 'text-faint'}`}>
                {info ? `${formatBytes(info.freeBytes)} libres en el disco` : 'Calculando espacio…'}
              </p>
            </div>
            <button
              type="button"
              onClick={openFolder}
              className="btn shrink-0 px-2.5 py-1.5 text-[11px]"
              title="Abrir la carpeta de descargas"
            >
              <FolderOpen size={12} /> Abrir
            </button>
          </div>
          {folderError && (
            <p className="mt-1.5 text-[10px] text-warn/90">{folderError}</p>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-medium tracking-[0.12em] text-faint uppercase">
            Calidad de las próximas descargas
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {QUALITY_OPTIONS.map((option) => {
              const active = settings.downloadQuality === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => updateSettings({ downloadQuality: option.id })}
                  className={`rounded-lg border px-2.5 py-2 text-left transition ${
                    active
                      ? 'border-accent/45 bg-accent/10'
                      : 'border-line bg-surface-2/30 hover:border-surface-3'
                  }`}
                >
                  <span
                    className={`block text-[11px] font-medium ${
                      active ? 'text-accent' : 'text-fg'
                    }`}
                  >
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-[9.5px] leading-snug text-faint">
                    {option.detail}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-[9.5px] leading-relaxed text-faint">
            Sin ffmpeg no se recodifica: se elige la mejor pista original que
            quepa en ese límite.
          </p>
        </div>

        {inFlight.length > 0 && (
          <div className="space-y-1.5">
            {inFlight.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-accent/25 bg-accent/[0.05] px-2.5 py-2"
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="flex min-w-0 items-center gap-1.5 text-fg">
                    <Loader2 size={11} className="shrink-0 animate-spin text-accent" />
                    <span className="truncate">
                      {pending[item.id]?.title ?? 'Descargando…'}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-[10px] text-accent">
                    {Math.round(item.percent)}%
                  </span>
                </div>
                <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full bg-accent transition-[width] duration-200"
                    style={{ width: `${Math.max(2, item.percent)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
            <HardDriveDownload size={26} className="mx-auto mb-2 text-faint opacity-60" />
            <p className="text-xs font-medium text-muted">Todavía no hay descargas</p>
            <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-faint">
              Busca una canción y pulsa el icono de descarga. Quedará en este
              equipo y sonará incluso sin conexión.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {entries.map((entry) => {
              const active = currentTrackId === entry.id
              const confirming = confirmDelete === entry.id
              const failure = errors[entry.id]

              return (
                <div
                  key={entry.id}
                  className={`rounded-xl border ${
                    active ? 'border-accent/35 bg-accent/[0.05]' : 'border-line bg-surface-2/25'
                  }`}
                >
                  <div className="flex items-center gap-2.5 p-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (active) togglePlay()
                        else playTrack(asTrack(entry), entries.map(asTrack))
                      }}
                      className="group relative size-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10"
                      aria-label={
                        active && isPlaying
                          ? `Pausar ${entry.title}`
                          : `Reproducir ${entry.title}`
                      }
                    >
                      {entry.thumbnail ? (
                        <img
                          src={entry.thumbnail}
                          alt=""
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="grid size-full place-items-center bg-surface-2">
                          <HardDriveDownload size={15} className="text-faint" />
                        </span>
                      )}
                      <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                        {active && isPlaying ? (
                          <Pause size={13} fill="currentColor" className="text-fg" />
                        ) : (
                          <Play size={13} fill="currentColor" className="text-fg" />
                        )}
                      </span>
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] font-medium text-fg">
                        {entry.title}
                      </p>
                      <p className="truncate text-[10.5px] text-muted">
                        {entry.artist} · {formatBytes(entry.sizeBytes)} ·{' '}
                        {formatDate(entry.createdAt)}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => addManyToQueue([asTrack(entry)])}
                        className="icon-btn size-7 text-faint hover:text-fg"
                        title="Añadir a la cola"
                        aria-label={`Añadir ${entry.title} a la cola`}
                      >
                        <ListPlus size={12} className="opacity-70" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDelete(confirming ? null : entry.id)
                        }
                        className={`icon-btn size-7 ${
                          confirming ? 'text-warn' : 'text-faint hover:text-fg'
                        }`}
                        title="Borrar descarga"
                        aria-label={`Borrar ${entry.title} del disco`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {confirming && (
                    <div className="flex items-center justify-between gap-2 border-t border-line-soft px-2.5 py-1.5">
                      <span className="min-w-0 truncate text-[10.5px] text-warn/90">
                        ¿Borrar «{entry.title}» del disco?
                      </span>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className="rounded-lg px-2 py-1 text-[10.5px] text-muted transition hover:bg-surface-2 hover:text-fg"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(entry.id)}
                          className="rounded-lg border border-warn/35 bg-warn/[0.08] px-2 py-1 text-[10.5px] text-warn transition hover:bg-warn/15"
                        >
                          Borrar
                        </button>
                      </div>
                    </div>
                  )}

                  {failure && (
                    <div className="flex items-start justify-between gap-2 border-t border-line-soft px-2.5 py-1.5">
                      <p className="min-w-0 text-[10px] leading-relaxed text-warn/90">
                        {failure}
                      </p>
                      <button
                        type="button"
                        onClick={() => useDownloads.getState().clearError(entry.id)}
                        className="shrink-0 text-[10px] text-warn/60 hover:text-warn"
                      >
                        ok
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {Object.entries(errors)
          .filter(([id]) => !entries.some((entry) => entry.id === id))
          .map(([id, message]) => (
            <div
              key={id}
              className="flex items-start justify-between gap-2 rounded-lg border border-warn/25 bg-warn/[0.07] px-2.5 py-2"
            >
              <p className="min-w-0 text-[10px] leading-relaxed text-warn/90">
                {message}
              </p>
              <button
                type="button"
                onClick={() => useDownloads.getState().clearError(id)}
                className="shrink-0 text-[10px] text-warn/60 hover:text-warn"
              >
                ok
              </button>
            </div>
          ))}
      </div>
    </Modal>
  )
}

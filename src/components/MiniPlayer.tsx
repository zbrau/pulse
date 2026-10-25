import {
  Maximize2,
  Pause,
  Play,
  SkipForward,
  Timer as TimerIcon,
} from 'lucide-react'
import { durationFor, useStore } from '../store/useStore'
import { usePlayerStore } from '../store/usePlayerStore'
import { useUi } from '../store/useUi'
import { formatClock } from '../lib/date'

/** Vista compacta: timer, tarea activa y controles de música. */
export function MiniPlayer() {
  const timer = useStore((s) => s.timer)
  const settings = useStore((s) => s.settings)
  const activeTask = useStore((s) =>
    s.tasks.find((task) => task.id === s.activeTaskId),
  )
  const toggleTimer = useStore((s) => s.toggleTimer)
  const skipTimer = useStore((s) => s.skipTimer)

  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const nextTrack = usePlayerStore((s) => s.nextTrack)

  const setMini = useUi((s) => s.setMini)

  const total = Math.max(1, durationFor(timer.mode, settings))
  const ratio = Math.min(1, Math.max(0, 1 - timer.remainingMs / total))
  const label =
    timer.mode === 'work'
      ? 'enfoque'
      : timer.mode === 'long'
        ? 'descanso largo'
        : 'descanso'

  return (
    <div className="flex h-screen flex-col justify-between gap-2 overflow-hidden bg-bg px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[9px] font-medium tracking-[0.16em] text-accent/80 uppercase">
            <TimerIcon size={9} />
            {label}
          </p>
          <p className="tnum mt-1 text-[32px] leading-none font-semibold tracking-tight text-fg">
            {formatClock(timer.remainingMs)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={toggleTimer}
            className="grid size-8 place-items-center rounded-full bg-accent text-bg transition hover:scale-105 active:scale-95"
            title={timer.running ? 'Pausar' : 'Empezar'}
            aria-label={timer.running ? 'Pausar temporizador' : 'Empezar temporizador'}
          >
            {timer.running ? (
              <Pause size={13} fill="currentColor" />
            ) : (
              <Play size={13} fill="currentColor" className="ml-0.5" />
            )}
          </button>
          <button
            type="button"
            onClick={skipTimer}
            className="icon-btn size-7 text-faint hover:text-fg"
            title="Saltar sesión"
            aria-label="Saltar sesión"
          >
            <SkipForward size={13} />
          </button>
          <button
            type="button"
            onClick={() => setMini(false)}
            className="icon-btn size-7 text-faint hover:text-fg"
            title="Salir del modo mini"
            aria-label="Salir del modo mini"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      <div className="h-0.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full bg-accent/80 transition-[width] duration-300"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <p
          className="min-w-0 flex-1 truncate text-[11px] text-muted"
          title={activeTask?.title ?? 'Sin tarea activa'}
        >
          {activeTask?.title ?? 'Sin tarea activa'}
        </p>

        {currentTrack ? (
          <div className="flex min-w-0 items-center gap-1">
            <span
              className="max-w-[150px] truncate text-[10.5px] text-faint"
              title={`${currentTrack.title} · ${currentTrack.artist}`}
            >
              {currentTrack.title}
            </span>
            <button
              type="button"
              onClick={togglePlay}
              className="icon-btn size-6 text-fg"
              title={isPlaying ? 'Pausar música' : 'Reproducir música'}
              aria-label={isPlaying ? 'Pausar música' : 'Reproducir música'}
            >
              {isPlaying ? (
                <Pause size={12} fill="currentColor" />
              ) : (
                <Play size={12} fill="currentColor" />
              )}
            </button>
            <button
              type="button"
              onClick={nextTrack}
              className="icon-btn size-6 text-faint hover:text-fg"
              title="Siguiente canción"
              aria-label="Siguiente canción"
            >
              <SkipForward size={12} />
            </button>
          </div>
        ) : (
          <span className="shrink-0 text-[10px] text-faint">sin música</span>
        )}
      </div>
    </div>
  )
}

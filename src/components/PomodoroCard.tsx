import { Coffee, Pause, Play, RotateCcw, SkipForward, Target } from 'lucide-react'
import { durationFor, useStore } from '../store/useStore'
import { formatClock } from '../lib/date'
import { PRIORITY_COLOR, PRIORITY_LABEL } from '../lib/tasks'
import type { TimerMode } from '../types'
import { ensureNotifications } from '../lib/sound'

const MODES: { id: TimerMode; label: string }[] = [
  { id: 'work', label: 'Enfoque' },
  { id: 'short', label: 'Corto' },
  { id: 'long', label: 'Largo' },
]

const R = 112
const CIRC = 2 * Math.PI * R

export function PomodoroCard() {
  const timer = useStore((s) => s.timer)
  const settings = useStore((s) => s.settings)
  const activeTask = useStore((s) =>
    s.tasks.find((t) => t.id === s.activeTaskId),
  )
  const toggleTimer = useStore((s) => s.toggleTimer)
  const resetTimer = useStore((s) => s.resetTimer)
  const skipTimer = useStore((s) => s.skipTimer)
  const setMode = useStore((s) => s.setMode)

  const duration = durationFor(timer.mode, settings)
  const remaining = Math.max(0, timer.remainingMs)
  const progress = Math.min(1, Math.max(0, 1 - remaining / duration))
  const isBreak = timer.mode !== 'work'
  const accent = isBreak ? 'var(--color-break)' : 'var(--color-accent)'

  const cycleDone = isBreak
    ? timer.cycle % settings.cyclesBeforeLong === 0 &&
      timer.cycle > 0 &&
      timer.mode === 'long'
      ? settings.cyclesBeforeLong
      : timer.cycle % settings.cyclesBeforeLong
    : timer.cycle % settings.cyclesBeforeLong

  const startOrPause = () => {
    if (!timer.running) void ensureNotifications()
    toggleTimer()
  }

  return (
    <section className="card relative overflow-hidden">
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full opacity-[0.13] blur-3xl transition-colors duration-700"
        style={{
          background: isBreak ? 'var(--color-break)' : 'var(--color-accent)',
        }}
      />

      <div className="relative px-5 pt-4 pb-5">
        <div className="flex items-center justify-center">
          <div
            className="inline-flex rounded-full border border-line bg-surface-2/70 p-0.5"
            role="tablist"
            aria-label="Modo del temporizador"
          >
            {MODES.map((m) => {
              const active = timer.mode === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMode(m.id)}
                  className={`rounded-full px-3.5 py-1.5 text-[11.5px] font-medium transition ${
                    active
                      ? 'bg-surface text-fg shadow-sm'
                      : 'text-faint hover:text-muted'
                  }`}
                >
                  {m.label}
                  <span className="ml-1.5 text-[10px] text-faint tnum">
                    {m.id === 'work'
                      ? settings.workMin
                      : m.id === 'short'
                        ? settings.shortMin
                        : settings.longMin}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-5 flex justify-center">
          <div className="relative size-[248px]">
            <svg
              viewBox="0 0 248 248"
              className="size-full -rotate-90"
              aria-hidden
            >
              <circle
                cx="124"
                cy="124"
                r={R}
                fill="none"
                stroke="var(--color-surface-3)"
                strokeWidth="5"
              />
              <circle
                cx="124"
                cy="124"
                r={R}
                fill="none"
                stroke={accent}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC * (1 - progress)}
                style={{
                  transition: 'stroke-dashoffset 300ms linear, stroke 400ms ease',
                  filter: `drop-shadow(0 0 6px ${isBreak ? 'rgba(143,185,143,0.35)' : 'rgba(137,169,204,0.35)'})`,
                }}
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] font-medium tracking-[0.18em] text-faint uppercase">
                {isBreak ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Coffee size={10} /> descanso
                  </span>
                ) : (
                  'enfoque'
                )}
              </span>
              <span className="mt-1 text-[58px] leading-none font-light tracking-tight text-fg tnum" data-testid="clock">
                {formatClock(remaining)}
              </span>
              <div className="mt-3 flex items-center gap-1.5">
                {Array.from({ length: settings.cyclesBeforeLong }).map((_, i) => (
                  <span
                    key={i}
                    className="size-1.5 rounded-full transition-colors"
                    style={{
                      background:
                        i < cycleDone ? accent : 'var(--color-surface-3)',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-1 flex min-h-[34px] items-center justify-center px-4">
          {activeTask ? (
            <span
              className="flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-2.5 py-1 text-[11.5px] text-muted"
              title={activeTask.title}
            >
              <Target size={11} className="shrink-0 text-accent" />
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{
                  background: PRIORITY_COLOR[activeTask.priority ?? 'media'],
                }}
                title={`Prioridad ${PRIORITY_LABEL[activeTask.priority ?? 'media']}`}
              />
              <span className="truncate">{activeTask.title}</span>
            </span>
          ) : (
            <span className="text-[11.5px] text-faint">
              sin tarea activa · elige una a la izquierda
            </span>
          )}
        </div>

        <div className="mt-4 flex items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={resetTimer}
            className="icon-btn border border-line bg-surface-2"
            aria-label="Reiniciar sesión"
            title="Reiniciar"
          >
            <RotateCcw size={15} />
          </button>

          <button
            type="button"
            onClick={startOrPause}
            className="inline-flex h-12 items-center gap-2 rounded-full px-7 text-[13px] font-medium transition active:scale-[0.98]"
            style={{
              background: isBreak
                ? 'rgba(143,185,143,0.16)'
                : 'rgba(137,169,204,0.16)',
              color: accent,
              boxShadow: `inset 0 0 0 1px ${isBreak ? 'rgba(143,185,143,0.3)' : 'rgba(137,169,204,0.3)'}`,
            }}
          >
            {timer.running ? (
              <Pause size={16} fill="currentColor" />
            ) : (
              <Play size={16} fill="currentColor" />
            )}
            {timer.running ? 'Pausar' : 'Empezar'}
          </button>

          <button
            type="button"
            onClick={skipTimer}
            className="icon-btn border border-line bg-surface-2"
            aria-label="Saltar sesión"
            title="Saltar a la siguiente"
          >
            <SkipForward size={15} />
          </button>
        </div>

        <p className="mt-3 text-center text-[10.5px] text-faint">
          <kbd className="rounded border border-line bg-surface-2 px-1 py-0.5 font-sans text-[10px]">
            espacio
          </kbd>{' '}
          para {timer.running ? 'pausar' : 'empezar'}
        </p>
      </div>
    </section>
  )
}

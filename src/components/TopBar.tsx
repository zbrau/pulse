import { useMemo } from 'react'
import {
  CircleDot,
  Download,
  Flame,
  Minimize2,
  Minus,
  Settings2,
  Square,
  Timer,
  X,
} from 'lucide-react'
import { selectToday, useStore } from '../store/useStore'
import { useUi } from '../store/useUi'
import { useUpdater } from '../store/useUpdater'
import { formatLongDate, todayKey } from '../lib/date'
import { isDesktop } from '../lib/desktop'
import { closeWindow, minimizeWindow, toggleMaximizeWindow } from '../lib/window'

const streakOf = (stats: Record<string, { pomodoros: number }>): number => {
  let streak = 0
  const d = new Date()
  for (;;) {
    const key = todayKey(d)
    const day = stats[key]
    if (day && day.pomodoros > 0) {
      streak++
      d.setDate(d.getDate() - 1)
      continue
    }
    // El día de hoy no rompe la racha si aún no empezaste.
    if (streak === 0 && key === todayKey()) {
      d.setDate(d.getDate() - 1)
      const yesterday = stats[todayKey(d)]
      if (yesterday && yesterday.pomodoros > 0) continue
    }
    break
  }
  return streak
}

export function TopBar() {
  const today = useStore(selectToday)
  const stats = useStore((s) => s.stats)
  const openSettings = useUi((s) => s.openSettings)
  const setMini = useUi((s) => s.setMini)
  const updateStatus = useUpdater((s) => s.status)
  const updateVersion = useUpdater((s) => s.version)
  const dismissed = useUpdater((s) => s.dismissed)

  const streak = useMemo(() => streakOf(stats), [stats])

  const showUpdate =
    !dismissed &&
    (updateStatus === 'available' ||
      updateStatus === 'downloading' ||
      updateStatus === 'ready')

  const handleDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null
    if (target?.closest('button, a, input, select, textarea')) return
    void toggleMaximizeWindow()
  }

  return (
    <header
      data-tauri-drag-region
      onDoubleClick={handleDoubleClick}
      className="sticky top-0 z-30 border-b border-line-soft bg-bg/90 backdrop-blur-md select-none transition-colors"
    >
      <div
        data-tauri-drag-region
        className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-2 sm:px-6"
      >
        {/* Identidad / Branding */}
        <div data-tauri-drag-region className="flex items-center gap-2.5">
          <div className="relative grid size-8 place-items-center rounded-xl border border-line bg-surface-2 text-accent shadow-sm">
            <CircleDot size={15} strokeWidth={2.4} />
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-accent animate-pulse opacity-75" />
          </div>
          <div data-tauri-drag-region className="leading-tight">
            <div className="flex items-center gap-1.5">
              <p className="text-[13.5px] font-bold tracking-tight text-fg">Pulse</p>
              <span className="text-[9.5px] font-mono text-faint px-1.5 py-0.2 rounded bg-surface-2 border border-line-soft">
                v0.2.3
              </span>
            </div>
            <p className="text-[10px] text-faint">
              {formatLongDate()}
            </p>
          </div>
        </div>

        {/* Acciones, Métricas y Controles Nativos de Ventana */}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="chip" title="Pomodoros completados hoy">
            <Timer size={12} className="text-accent" />
            <span className="tnum font-semibold text-fg">{today.pomodoros}</span>
            <span className="hidden sm:inline text-faint">hoy</span>
          </span>

          <span className="chip" title="Minutos de enfoque hoy">
            <span className="tnum font-semibold text-fg">{today.focusMinutes}</span>
            <span className="hidden sm:inline text-faint">min</span>
          </span>

          {streak > 0 && (
            <span className="chip" title="Días seguidos con al menos un pomodoro">
              <Flame size={12} className="text-warn fill-warn/20" />
              <span className="tnum font-semibold text-fg">{streak}</span>
            </span>
          )}

          {showUpdate && (
            <button
              type="button"
              onClick={() => openSettings('music')}
              className="chip chip-interactive border-accent/40 bg-accent/15 text-accent font-semibold"
              title={`Pulse ${updateVersion ?? ''} disponible`}
            >
              <Download size={12} />
              <span className="tnum">v{updateVersion}</span>
            </button>
          )}

          <div className="h-4 w-px bg-line-soft mx-1" />

          <button
            type="button"
            onClick={() => setMini(true)}
            className="icon-btn size-8"
            aria-label="Modo mini"
            title="Modo mini flotante (Always-on-top)"
          >
            <Minimize2 size={14} />
          </button>

          <button
            type="button"
            onClick={() => openSettings()}
            className="icon-btn size-8"
            aria-label="Ajustes"
            title="Ajustes de Pulse"
          >
            <Settings2 size={15} />
          </button>

          {/* Controles de Ventana Nativos de Escritorio (Windows / macOS) */}
          {isDesktop() && (
            <div className="flex items-center ml-2 pl-2 border-l border-line-soft gap-1">
              <button
                type="button"
                onClick={() => void minimizeWindow()}
                className="size-7 grid place-items-center rounded-lg text-muted hover:text-fg hover:bg-surface-3 transition-colors active:scale-95"
                title="Minimizar ventana"
                aria-label="Minimizar ventana"
              >
                <Minus size={13} />
              </button>
              <button
                type="button"
                onClick={() => void toggleMaximizeWindow()}
                className="size-7 grid place-items-center rounded-lg text-muted hover:text-fg hover:bg-surface-3 transition-colors active:scale-95"
                title="Maximizar o restaurar ventana"
                aria-label="Maximizar o restaurar ventana"
              >
                <Square size={11} />
              </button>
              <button
                type="button"
                onClick={() => void closeWindow()}
                className="size-7 grid place-items-center rounded-lg text-muted hover:text-white hover:bg-[#e81123] transition-colors active:scale-95"
                title="Cerrar Pulse"
                aria-label="Cerrar Pulse"
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

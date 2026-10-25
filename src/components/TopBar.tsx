import { CircleDot, Download, Flame, Minimize2, Settings2, Timer } from 'lucide-react'
import { selectToday, useStore } from '../store/useStore'
import { useUi } from '../store/useUi'
import { useUpdater } from '../store/useUpdater'
import { formatLongDate, todayKey } from '../lib/date'

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
  const streak = streakOf(stats)

  const showUpdate =
    !dismissed &&
    (updateStatus === 'available' ||
      updateStatus === 'downloading' ||
      updateStatus === 'ready')

  return (
    <header className="sticky top-0 z-30 border-b border-line-soft bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-xl border border-line bg-surface-2 text-accent">
            <CircleDot size={15} strokeWidth={2.2} />
          </div>
          <div className="leading-tight">
            <p className="text-[13px] font-semibold tracking-tight">Pulse</p>
            <p className="text-[10px] text-faint">
              {formatLongDate()}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <span className="chip" title="Pomodoros completados hoy">
            <Timer size={12} className="text-accent" />
            <span className="tnum text-fg">{today.pomodoros}</span>
            <span className="hidden sm:inline">hoy</span>
          </span>
          <span className="chip" title="Minutos de enfoque hoy">
            <span className="tnum text-fg">{today.focusMinutes}</span>
            <span className="hidden sm:inline">min</span>
          </span>
          {streak > 0 && (
            <span className="chip" title="Días seguidos con al menos un pomodoro">
              <Flame size={12} className="text-warn" />
              <span className="tnum text-fg">{streak}</span>
            </span>
          )}
          {showUpdate && (
            <button
              type="button"
              onClick={() => openSettings('music')}
              className="chip border-accent/35 bg-accent/10 text-accent transition hover:bg-accent/20"
              title={`Pulse ${updateVersion ?? ''} disponible`}
            >
              <Download size={12} />
              <span className="tnum">v{updateVersion}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setMini(true)}
            className="icon-btn ml-1"
            aria-label="Modo mini"
            title="Modo mini, siempre visible"
          >
            <Minimize2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => openSettings()}
            className="icon-btn"
            aria-label="Ajustes"
          >
            <Settings2 size={16} />
          </button>
        </div>
      </div>
    </header>
  )
}

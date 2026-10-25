import { lastNDays, weekdayShort } from '../lib/date'
import { useStore } from '../store/useStore'
import { BarChart3 } from 'lucide-react'

export function WeekStrip() {
  const stats = useStore((s) => s.stats)
  const days = lastNDays(7)
  const values = days.map((k) => stats[k]?.focusMinutes ?? 0)
  const max = Math.max(1, ...values)
  const total = values.reduce((a, b) => a + b, 0)
  const pomodoros = days.reduce((acc, k) => acc + (stats[k]?.pomodoros ?? 0), 0)

  return (
    <section className="card px-4 pt-4 pb-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-faint" />
          <h2 className="card-title">Últimos 7 días</h2>
        </div>
        <span className="text-[10.5px] text-faint tnum">
          {Math.floor(total / 60)}h {total % 60}m · {pomodoros} 🍅
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-1.5">
        {days.map((key, i) => {
          const value = values[i]
          const h = Math.max(3, Math.round((value / max) * 46))
          const isToday = i === days.length - 1
          return (
            <div
              key={key}
              className="flex flex-1 flex-col items-center gap-1.5"
              title={`${value} min`}
            >
              <div className="flex h-[46px] w-full items-end">
                <div
                  className={`w-full rounded-[3px] transition-all duration-500 ${
                    value === 0
                      ? 'bg-surface-2'
                      : isToday
                        ? 'bg-accent/80'
                        : 'bg-accent/25'
                  }`}
                  style={{ height: `${h}px` }}
                />
              </div>
              <span
                className={`text-[10px] capitalize ${
                  isToday ? 'text-muted' : 'text-faint'
                }`}
              >
                {weekdayShort(key)}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

import { useEffect } from 'react'
import { useStore } from '../store/useStore'
import { chime, notify } from '../lib/sound'
import { formatClock } from '../lib/date'

/**
 * Motor del pomodoro: un único intervalo que avanza el timer del store,
 * dispara el sonido/notificación y mantiene el título de la pestaña.
 */
export function useTimerEngine(): void {
  const tick = useStore((s) => s.tick)
  const resume = useStore((s) => s.resume)

  useEffect(() => {
    resume(Date.now())

    const id = window.setInterval(() => {
      const finished = useStore.getState().tick(Date.now())
      if (!finished) return

      const { settings, timer } = useStore.getState()
      if (settings.soundOn) chime(finished === 'work' ? 'work' : 'break')

      const title = finished === 'work' ? 'Sesión completada' : 'Descanso terminado'
      const body =
        finished === 'work'
          ? timer.mode === 'long'
            ? 'Buen trabajo. Toca un descanso largo.'
            : 'Toca un descanso corto.'
          : 'De vuelta al enfoque.'
      notify(title, body)
    }, 250)

    return () => window.clearInterval(id)
  }, [tick, resume])

  const running = useStore((s) => s.timer.running)
  const remainingMs = useStore((s) => s.timer.remainingMs)
  const mode = useStore((s) => s.timer.mode)

  useEffect(() => {
    if (running) {
      const label = mode === 'work' ? 'enfoque' : 'descanso'
      document.title = `${formatClock(remainingMs)} · ${label}`
    } else {
      document.title = 'Pulse'
    }
  }, [running, remainingMs, mode])
}

import { useEffect, useRef } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { getAnalyser } from '../lib/audioGraph'
import { useUi } from '../store/useUi'

const BAR_COUNT = 46
const ACCENT = '137, 169, 204'

type Props = {
  /** Altura en píxeles de la franja. */
  heightClass?: string
}

/**
 * Franja de barras espejadas alimentada por el `AnalyserNode` del reproductor.
 * Sin señal (o sin Web Audio) dibuja una onda suave en reposo.
 */
export function Visualizer({ heightClass = 'h-14' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const openEq = useUi((state) => state.openEq)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 1
    let height = 1
    let frame = 0
    let spectrum: Uint8Array | null = null
    let resizeScheduled = false

    const currentCanvas = () => canvasRef.current ?? canvas
    const currentCtx = () => currentCanvas().getContext('2d') ?? ctx

    const resize = () => {
      const rect = currentCanvas().getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = Math.max(1, Math.round(rect.width))
      height = Math.max(1, Math.round(rect.height))
      currentCanvas().width = Math.round(width * dpr)
      currentCanvas().height = Math.round(height * dpr)
      currentCtx().setTransform(dpr, 0, 0, dpr, 0, 0)
      resizeScheduled = false
    }

    const draw = (time: number) => {
      const c = currentCtx()
      c.clearRect(0, 0, width, height)
      const mid = height / 2

      // Si el contexto de audio se suspendió (pestaña en segundo plano o
      // inactividad), intentamos reanudarlo para que el espectro vuelva.
      const analyser = getAnalyser()
      if (analyser && analyser.context.state === 'suspended') {
        void analyser.context.resume().catch(() => undefined)
      }

      if (analyser) {
        if (!spectrum || spectrum.length !== analyser.frequencyBinCount) {
          spectrum = new Uint8Array(analyser.frequencyBinCount)
        }
        analyser.getByteFrequencyData(spectrum)
      }

      // En pausa la señal es silencio: mejor una onda suave que barras planas.
      let silent = true
      if (analyser && spectrum) {
        for (let bin = 0; bin < spectrum.length; bin += 1) {
          if (spectrum[bin] > 3) {
            silent = false
            break
          }
        }
      }

      // Línea central tenue: da sensación de eje aun con la música en pausa.
      c.fillStyle = `rgba(${ACCENT}, 0.09)`
      c.fillRect(0, mid - 0.5, width, 1)

      const gap = 2
      const barWidth = Math.max(1, (width - gap * (BAR_COUNT - 1)) / BAR_COUNT)

      for (let i = 0; i < BAR_COUNT; i += 1) {
        let level: number

        if (analyser && spectrum && !silent) {
          // Escala logarítmica: la música concentra energía en los graves.
          const ratio = i / BAR_COUNT
          const center = Math.min(
            spectrum.length - 1,
            Math.floor(Math.pow(ratio, 1.7) * spectrum.length * 0.55),
          )
          const from = Math.max(0, center - 1)
          const to = Math.min(spectrum.length, center + 2)
          let sum = 0
          for (let bin = from; bin < to; bin += 1) sum += spectrum[bin]
          level = (sum / (to - from) / 255) ** 1.5
        } else {
          level =
            0.18 +
            0.12 * Math.sin(time / 900 + i * 0.35) +
            0.07 * Math.sin(time / 1500 - i * 0.18)
        }

        const energy = Math.max(0.02, Math.min(1, level))
        const barHeight = Math.max(1.5, energy * (mid - 1))
        const x = i * (barWidth + gap)
        const alpha = 0.16 + energy * 0.6

        c.fillStyle = `rgba(${ACCENT}, ${alpha.toFixed(3)})`
        c.beginPath()
        if (typeof c.roundRect === 'function') {
          c.roundRect(x, mid - barHeight, barWidth, barHeight * 2, barWidth / 2)
        } else {
          c.rect(x, mid - barHeight, barWidth, barHeight * 2)
        }
        c.fill()
      }
    }

    const loop = (time: number) => {
      draw(time)
      frame = window.requestAnimationFrame(loop)
    }

    resize()
    draw(0)

    const observer = new ResizeObserver(() => {
      if (resizeScheduled) return
      resizeScheduled = true
      queueMicrotask(() => {
        resize()
        // Redibuja ya: si la ventana está en segundo plano, rAF puede estar
        // frenado y el canvas acabaría en blanco tras el resize.
        draw(performance.now())
      })
    })
    observer.observe(canvas)

    if (!reduceMotion) frame = window.requestAnimationFrame(loop)

    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div
      className={`group relative ${heightClass} overflow-hidden rounded-b-2xl border-t border-line-soft bg-surface-2/25`}
    >
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 size-full" />
      <span className="pointer-events-none absolute right-3 bottom-1.5 flex items-center gap-1 text-[9px] tracking-[0.14em] text-faint uppercase opacity-60 transition-opacity group-hover:opacity-100">
        <SlidersHorizontal size={10} />
        Ecualizador
      </span>
      <button
        type="button"
        onClick={openEq}
        className="absolute inset-0 rounded-none"
        aria-label="Abrir ecualizador"
        title="Abrir ecualizador"
      />
    </div>
  )
}

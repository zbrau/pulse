import { useEffect, useRef } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { getAnalyser } from '../lib/audioGraph'
import { useUi } from '../store/useUi'

const BAR_COUNT = 48
const ACCENT_BASE = '137, 169, 204'

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

      // Reanudar contexto si está suspendido
      const analyser = getAnalyser()
      const audioCtx = analyser?.context as AudioContext | undefined
      if (audioCtx && 'state' in audioCtx && audioCtx.state === 'suspended') {
        void audioCtx.resume?.().catch(() => undefined)
      }

      if (analyser) {
        if (!spectrum || spectrum.length !== analyser.frequencyBinCount) {
          spectrum = new Uint8Array(analyser.frequencyBinCount)
        }
        analyser.getByteFrequencyData(spectrum as any)
      }

      let silent = true
      if (analyser && spectrum) {
        for (let bin = 0; bin < spectrum.length; bin += 1) {
          if (spectrum[bin] > 3) {
            silent = false
            break
          }
        }
      }

      // Eje central con degradado suave
      const axisGrad = c.createLinearGradient(0, 0, width, 0)
      axisGrad.addColorStop(0, 'rgba(137, 169, 204, 0)')
      axisGrad.addColorStop(0.5, 'rgba(137, 169, 204, 0.15)')
      axisGrad.addColorStop(1, 'rgba(137, 169, 204, 0)')
      c.fillStyle = axisGrad
      c.fillRect(0, mid - 0.5, width, 1)

      const gap = 2
      const barWidth = Math.max(1, (width - gap * (BAR_COUNT - 1)) / BAR_COUNT)

      for (let i = 0; i < BAR_COUNT; i += 1) {
        let level: number

        if (analyser && spectrum && !silent) {
          // Escala logarítmica: la música concentra energía en graves
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
            0.16 +
            0.1 * Math.sin(time / 850 + i * 0.32) +
            0.06 * Math.sin(time / 1400 - i * 0.16)
        }

        const energy = Math.max(0.02, Math.min(1, level))
        const barHeight = Math.max(1.5, energy * (mid - 2))
        const x = i * (barWidth + gap)
        const alpha = Math.min(1, 0.2 + energy * 0.75)

        // Refactoring UI: Gradiente luminoso en las barras del espectro
        const barGrad = c.createLinearGradient(0, mid - barHeight, 0, mid + barHeight)
        barGrad.addColorStop(0, `rgba(180, 210, 240, ${alpha.toFixed(3)})`)
        barGrad.addColorStop(0.5, `rgba(${ACCENT_BASE}, ${alpha.toFixed(3)})`)
        barGrad.addColorStop(1, `rgba(180, 210, 240, ${alpha.toFixed(3)})`)

        c.fillStyle = barGrad
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
        draw(performance.now())
      })
    })
    observer.observe(canvas)

    // Bucle continuo de animación del visualizador
    frame = window.requestAnimationFrame(loop)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  return (
    <div className={`group relative w-full border-t border-line-soft bg-surface-2/40 px-3 py-1 ${heightClass}`}>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="size-full"
      />

      <div className="absolute top-1/2 right-3 -translate-y-1/2 opacity-0 transition-all duration-200 group-hover:opacity-100">
        <button
          type="button"
          onClick={() => openEq()}
          className="chip chip-interactive flex items-center gap-1.5 py-1 text-[10.5px] font-semibold text-accent border-accent/25 bg-surface/90 shadow-lg backdrop-blur-md"
          title="Abrir ecualizador de 5 bandas"
          aria-label="Abrir ecualizador"
        >
          <SlidersHorizontal size={12} />
          <span>Ecualizador</span>
        </button>
      </div>
    </div>
  )
}

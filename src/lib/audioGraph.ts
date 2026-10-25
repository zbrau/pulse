/**
 * Grafo de Web Audio para el reproductor principal.
 *
 * `source → 5 biquads → analyser → destination`
 *
 * El ecualizador y el visualizador comparten este único grafo: el elemento de
 * audio sólo puede conectarse una vez (`createMediaElementSource` lanza si se
 * repite), así que se construye de forma perezosa y se reutiliza.
 */

/** Frecuencias centrales (Hz) de las 5 bandas. */
export const EQ_BANDS = [60, 230, 910, 3600, 14000] as const

export const EQ_BAND_LABELS = ['60 Hz', '230 Hz', '910 Hz', '3.6 kHz', '14 kHz'] as const

export const EQ_MIN = -12
export const EQ_MAX = 12

const BAND_TYPES: BiquadFilterType[] = [
  'lowshelf',
  'peaking',
  'peaking',
  'peaking',
  'highshelf',
]

type Graph = {
  context: AudioContext
  analyser: AnalyserNode
  filters: BiquadFilterNode[]
}

let graph: Graph | null = null
let failed = false
/** Ganancias pendientes si el grafo aún no existe (store hidratado antes). */
let pendingGains: number[] | null = null
let unlockBound = false

const clampGain = (value: number) =>
  Math.max(EQ_MIN, Math.min(EQ_MAX, Number.isFinite(value) ? value : 0))

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext ??
    null
  )
}

/** Reanuda el contexto (los navegadores lo crean suspendido sin gesto). */
export function resumeAudio(): void {
  if (!graph) return
  if (graph.context.state === 'suspended') {
    void graph.context.resume().catch(() => undefined)
  }
}

/**
 * Crea el grafo una sola vez. Devuelve `null` si Web Audio no está
 * disponible o el WebView bloquea la conexión: en ese caso el audio sigue
 * sonando por la salida normal y el visualizador queda en modo reposo.
 */
export function ensureAudioGraph(audio: HTMLAudioElement): Graph | null {
  if (graph) return graph
  if (failed) return null

  const Ctor = getAudioContextCtor()
  if (!Ctor) {
    failed = true
    return null
  }

  try {
    const context = new Ctor()
    const source = context.createMediaElementSource(audio)

    const filters = EQ_BANDS.map((frequency, index) => {
      const filter = context.createBiquadFilter()
      filter.type = BAND_TYPES[index]
      filter.frequency.value = frequency
      filter.Q.value = index === 0 || index === 4 ? 0.7 : 1.1
      filter.gain.value = 0
      return filter
    })

    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.82

    source.connect(filters[0])
    for (let i = 0; i < filters.length - 1; i += 1) {
      filters[i].connect(filters[i + 1])
    }
    filters[filters.length - 1].connect(analyser)
    analyser.connect(context.destination)

    graph = { context, analyser, filters }

    // Cualquier clic posterior desbloquea el contexto si el primer intento
    // llegó demasiado pronto (WebView2 lo deja suspendido).
    if (!unlockBound) {
      unlockBound = true
      document.addEventListener('pointerdown', resumeAudio, true)
      document.addEventListener('keydown', resumeAudio, true)
    }

    if (pendingGains) applyEq(pendingGains)
    return graph
  } catch (err) {
    failed = true
    console.warn('[Pulse] no se pudo crear el grafo de audio:', err)
    return null
  }
}

/** Aplica 5 ganancias en dB (−12..+12). Guarda el valor aunque no haya grafo. */
export function applyEq(gains: number[]): void {
  pendingGains = gains.map(clampGain)
  if (!graph) return

  const { context, filters } = graph
  pendingGains.forEach((value, index) => {
    const filter = filters[index]
    if (!filter) return
    // Rampa corta: evita chasquidos al mover un slider.
    filter.gain.setTargetAtTime(value, context.currentTime, 0.03)
  })
}

export function getAnalyser(): AnalyserNode | null {
  return graph?.analyser ?? null
}

export function isAudioGraphReady(): boolean {
  return graph !== null
}

// Hook de desarrollo para las pruebas E2E (no existe en la build de release).
if (import.meta.env.DEV) {
  Object.assign(window, {
    __pulseAudioDebug: {
      analyser: () => graph?.analyser ?? null,
      state: () => graph?.context.state ?? 'none',
      gains: () =>
        graph?.filters.map((filter) => Math.round(filter.gain.value * 10) / 10) ?? [],
    },
  })
}

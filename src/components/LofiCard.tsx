import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, Pause, Play, Radio } from 'lucide-react'
import { useStore } from '../store/useStore'
import { usePlayerStore } from '../store/usePlayerStore'
import type { Station } from '../types'

export const STATIONS: Station[] = [
  {
    id: 'lofi',
    name: 'Lofi',
    description: 'beats para concentrarse',
    url: 'https://stream.laut.fm/lofi',
  },
  {
    id: 'chillhop',
    name: 'Chillhop',
    description: 'iloveradio · 192 kbps',
    url: 'https://streams.ilovemusic.de/iloveradio17.mp3',
  },
  {
    id: 'jazz',
    name: 'Jazz',
    description: 'jazz todo el día',
    url: 'https://stream.laut.fm/jazz',
  },
  {
    id: 'ambient',
    name: 'Ambient',
    description: 'atmósfera profunda',
    url: 'https://stream.laut.fm/ambient',
  },
  {
    id: 'lounge',
    name: 'Lounge',
    description: 'lounge suave',
    url: 'https://stream.laut.fm/lounge',
  },
]

type Status = 'idle' | 'loading' | 'playing' | 'error'

export function LofiCard() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const musicPlaying = usePlayerStore((s) => s.isPlaying)
  const pauseMusic = usePlayerStore((s) => s.pause)

  const lofiPlaying = useStore((s) => s.lofiPlaying)
  const setLofiPlaying = useStore((s) => s.setLofiPlaying)
  const stationId = useStore((s) => s.stationId)
  const setStation = useStore((s) => s.setStation)
  const volume = useStore((s) => s.settings.lofiVolume)
  const updateSettings = useStore((s) => s.updateSettings)

  const [status, setStatus] = useState<Status>('idle')

  const station = STATIONS.find((s) => s.id === stationId) ?? STATIONS[0]

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (!lofiPlaying) {
      audio.pause()
      setStatus('idle')
      return
    }

    if (audio.src !== station.url) audio.src = station.url
    setStatus('loading')
    audio.play().catch(() => setStatus('error'))
  }, [lofiPlaying, station.url])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  const toggle = async () => {
    if (lofiPlaying) {
      setLofiPlaying(false)
      return
    }
    // Una sola fuente de audio a la vez.
    if (musicPlaying) pauseMusic()
    setLofiPlaying(true)
  }

  const pick = (id: string) => {
    setStation(id)
    if (!lofiPlaying) void toggle()
  }

  return (
    <section className="card">
      <audio
        ref={audioRef}
        preload="none"
        onPlaying={() => setStatus('playing')}
        onWaiting={() => setStatus('loading')}
        onError={() => setStatus('error')}
      />

      <div className="card-head">
        <div className="flex items-center gap-2">
          <Radio size={14} className="text-faint" />
          <h2 className="card-title">Radio lofi</h2>
        </div>
        <span className="text-[10px] tracking-wide text-faint uppercase">
          {lofiPlaying ? 'en vivo' : 'pausada'}
        </span>
      </div>

      <div className="flex items-center gap-3 px-4 pb-3">
        <button
          type="button"
          onClick={() => void toggle()}
          className="grid size-12 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-fg transition hover:border-surface-3 hover:bg-surface-3 active:scale-95"
          aria-label={lofiPlaying ? 'Pausar radio' : 'Reproducir radio'}
        >
          {status === 'loading' && lofiPlaying ? (
            <Loader2 size={17} className="animate-spin text-accent" />
          ) : lofiPlaying ? (
            <Pause size={17} fill="currentColor" />
          ) : (
            <Play size={17} fill="currentColor" className="ml-0.5" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{station.name}</p>
          <p className="truncate text-[11px] text-faint">{station.description}</p>
        </div>

        {lofiPlaying && status === 'playing' && <Equalizer />}
      </div>

      <div className="flex items-center gap-2 px-4 pb-2">
        <span className="text-[10px] text-faint">vol</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) =>
            updateSettings({ lofiVolume: Number(e.target.value) / 100 })
          }
          className="w-full flex-1"
          aria-label="Volumen de la radio"
        />
      </div>

      <div className="divider mx-4 w-auto" />

      <ul className="p-2">
        {STATIONS.map((s) => {
          const active = s.id === station.id
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => pick(s.id)}
                className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                  active ? 'bg-surface-2' : 'hover:bg-surface-2/60'
                }`}
                aria-pressed={active}
              >
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-md border text-[9px] transition ${
                    active && lofiPlaying
                      ? 'border-accent/30 bg-accent/15 text-accent'
                      : 'border-line bg-surface text-faint'
                  }`}
                >
                  {active && lofiPlaying ? (
                    <Pause size={9} fill="currentColor" />
                  ) : (
                    <Play size={9} fill="currentColor" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[12px] ${
                      active ? 'text-fg' : 'text-muted group-hover:text-fg'
                    }`}
                  >
                    {s.name}
                  </span>
                  <span className="block truncate text-[10px] text-faint">
                    {s.description}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {status === 'error' && (
        <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/[0.07] px-2.5 py-2">
          <AlertCircle size={12} className="mt-0.5 shrink-0 text-warn" />
          <p className="text-[10.5px] leading-relaxed text-warn/90">
            No se pudo abrir el stream. Prueba otra emisora o revisa la
            conexión.
          </p>
        </div>
      )}

      <p className="px-4 pb-3 text-[10px] leading-relaxed text-faint">
        La radio se pausa sola cuando das play a YouTube Music.
      </p>
    </section>
  )
}

function Equalizer() {
  return (
    <div className="flex h-5 items-end gap-[3px]" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-accent/70"
          style={{
            animation: `eq 1.1s ease-in-out ${i * 0.13}s infinite alternate`,
            height: '40%',
          }}
        />
      ))}
    </div>
  )
}

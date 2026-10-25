import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Music2, Search, X } from 'lucide-react'
import { usePlayerStore } from '../store/usePlayerStore'
import { currentLineIndex, getLyrics, searchLyrics } from '../lib/lyrics'
import { isDesktop } from '../lib/music'
import type { Lyrics } from '../types'

type Status = 'idle' | 'loading' | 'empty' | 'error'

export function LyricsCard() {
  const track = usePlayerStore((s) => s.currentTrack)
  const progressMs = usePlayerStore((s) => s.progressMs)
  const seek = usePlayerStore((s) => s.seek)

  const [lyrics, setLyrics] = useState<Lyrics | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [query, setQuery] = useState('')
  const [manualTitle, setManualTitle] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLParagraphElement>(null)

  const trackId = track?.id ?? null
  const artist = track?.artist ?? ''

  useEffect(() => {
    if (!track || !trackId) {
      setLyrics(null)
      setStatus('idle')
      setManualTitle(null)
      return
    }

    let alive = true
    setStatus('loading')
    setLyrics(null)
    setManualTitle(null)

    getLyrics(track)
      .then((result) => {
        if (!alive) return
        setLyrics(result)
        setStatus(result ? 'idle' : 'empty')
      })
      .catch(() => {
        if (alive) setStatus('error')
      })

    return () => {
      alive = false
    }
  }, [trackId])

  const lines = lyrics?.synced ?? null
  const activeIndex = useMemo(
    () => (lines ? currentLineIndex(lines, progressMs) : -1),
    [lines, progressMs],
  )

  useEffect(() => {
    const container = scrollRef.current
    const active = activeRef.current
    if (!container || !active) return
    const top = active.offsetTop - container.clientHeight / 2 + active.clientHeight / 2
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }, [activeIndex])

  const runManualSearch = async (e: FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setStatus('loading')
    try {
      const found = await searchLyrics(q)
      if (!found) {
        setLyrics(null)
        setManualTitle(q)
        setStatus('empty')
        return
      }
      setLyrics(found)
      setManualTitle(
        found.title && found.artist
          ? `${found.title} — ${found.artist}`
          : q,
      )
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }

  const clearManual = () => {
    setManualTitle(null)
    setQuery('')
    setStatus('idle')
    setLyrics(null)
  }

  const heading = manualTitle ?? (track ? `${track.title} — ${artist}` : null)
  const showSearch = !track || manualTitle !== null

  return (
    <section className="card flex min-h-0 flex-col">
      <div className="card-head">
        <div className="flex min-w-0 items-center gap-2">
          <Music2 size={14} className="shrink-0 text-accent" />
          <h2 className="card-title shrink-0">Letra en Vivo</h2>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          {heading && (
            <span className="truncate text-[11px] text-faint" title={heading}>
              {heading}
            </span>
          )}
          {manualTitle && (
            <button
              type="button"
              onClick={clearManual}
              className="icon-btn size-6 shrink-0"
              aria-label="Cerrar búsqueda manual"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {showSearch && (
        <form onSubmit={runManualSearch} className="px-4 pb-2">
          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Busca una canción para ver su letra…"
              className="input py-1.5 pr-8 pl-8 text-xs"
              aria-label="Buscar letra de canción"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-faint hover:text-fg"
                aria-label="Borrar búsqueda"
              >
                <X size={12} />
              </button>
            ) : null}
          </div>
        </form>
      )}

      <div
        ref={scrollRef}
        tabIndex={0}
        aria-label="Letra de la canción"
        className="scroll-thin flex-1 overflow-y-auto px-5 py-4 focus:outline-none max-h-[360px]"
      >
        {status === 'loading' && (
          <div className="flex h-36 flex-col items-center justify-center gap-2 text-center">
            <div className="size-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            <span className="text-xs text-muted">Sincronizando letra…</span>
          </div>
        )}

        {status === 'error' && (
          <div className="flex h-36 flex-col items-center justify-center gap-1.5 text-center">
            <p className="text-[13px] text-muted">No se pudo cargar la letra</p>
            <p className="text-[11.5px] text-faint">
              Revisa tu conexión e inténtalo otra vez.
            </p>
          </div>
        )}

        {status === 'empty' && (
          <div className="flex h-36 flex-col items-center justify-center gap-1.5 text-center">
            <p className="text-[13px] text-muted">Sin letra disponible</p>
            <p className="max-w-[240px] text-[11.5px] leading-relaxed text-faint">
              Esta canción no tiene letra cargada en la comunidad de lrclib.
            </p>
          </div>
        )}

        {status === 'idle' && !lyrics && (
          <div className="flex h-36 flex-col items-center justify-center gap-2 text-center">
            <div className="grid size-9 place-items-center rounded-xl border border-line bg-surface-2 text-faint">
              <Music2 size={16} />
            </div>
            <p className="text-[13px] font-medium text-muted">
              {track ? 'Buscando…' : 'Nada sonando'}
            </p>
            <p className="max-w-[260px] text-[11.5px] leading-relaxed text-faint">
              {track
                ? 'Esperando la letra de la canción actual.'
                : isDesktop()
                  ? 'Pon algo en YouTube Music o busca una canción aquí arriba.'
                  : 'Abre la app de escritorio para buscar letras.'}
            </p>
          </div>
        )}

        {status === 'idle' && lyrics && lines && (
          <div className="space-y-3.5 text-center select-none py-2">
            {lines.map((line, i) => {
              const active = i === activeIndex
              const isPast = activeIndex > -1 && i < activeIndex
              return (
                <p
                  key={`${line.time}-${i}`}
                  ref={active ? activeRef : undefined}
                  onClick={() => seek(line.time)}
                  className={`cursor-pointer transition-all duration-200 select-text ${
                    active
                      ? 'scale-[1.03] text-[16px] font-bold text-accent drop-shadow-[0_2px_12px_rgba(137,169,204,0.35)]'
                      : isPast
                        ? 'text-[13.5px] text-faint/60 hover:text-fg'
                        : 'text-[13.5px] text-muted/70 hover:text-fg'
                  }`}
                  title="Haz clic para saltar a esta parte"
                >
                  {line.text || '\u00A0'}
                </p>
              )
            })}
          </div>
        )}

        {status === 'idle' && lyrics && !lines && lyrics.plain && (
          <div className="space-y-4 whitespace-pre-line text-[13.5px] leading-relaxed text-muted py-2">
            {lyrics.plain}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-line-soft px-4 py-2 bg-surface-2/30">
        <span className="text-[10px] text-faint">
          letras por <span className="text-muted font-medium">lrclib</span>
          {lyrics?.source === 'youtube' && ' · youtube music'}
        </span>
        {lines && (
          <span className="chip py-0.5 text-[9px] font-semibold tracking-wider uppercase text-accent border-accent/20 bg-accent/10">
            sincronizada · clic para saltar
          </span>
        )}
      </div>
    </section>
  )
}

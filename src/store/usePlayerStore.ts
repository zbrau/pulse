import { create } from 'zustand'
import type { MusicTrack } from '../types'
import { resolveStream } from '../lib/music'
import { ensureAudioGraph, resumeAudio } from '../lib/audioGraph'
import { useStore } from './useStore'

// Reproductor único para toda la app (sobrevive a cambios de vista).
let globalAudio: HTMLAudioElement | null = null
/** Descarta resoluciones que llegan tarde (clic rápido en varias canciones). */
let loadToken = 0

function getAudio(): HTMLAudioElement {
  if (!globalAudio) {
    globalAudio = new Audio()
    // Necesario para que Web Audio pueda leer el stream del proxy local
    // (el proxy responde con `Access-Control-Allow-Origin: *`).
    globalAudio.crossOrigin = 'anonymous'
    globalAudio.preload = 'auto'

    // Ecualizador + analizador. Si el WebView no lo permite, devuelve null y
    // el audio sigue saliendo por la ruta normal.
    ensureAudioGraph(globalAudio)

    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        usePlayerStore.getState().togglePlay()
      })
      navigator.mediaSession.setActionHandler('pause', () => {
        usePlayerStore.getState().togglePlay()
      })
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        usePlayerStore.getState().prevTrack()
      })
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        usePlayerStore.getState().nextTrack()
      })
    }
  }
  return globalAudio
}

const syncVolume = (audio: HTMLAudioElement, volume: number, muted: boolean) => {
  audio.volume = Math.max(0, Math.min(1, volume))
  audio.muted = muted || volume === 0
}

interface PlayerState {
  currentTrack: MusicTrack | null
  isPlaying: boolean
  isBuffering: boolean
  progressMs: number
  durationMs: number
  volume: number
  isMuted: boolean
  repeatMode: 'off' | 'all' | 'one'
  shuffle: boolean
  queue: MusicTrack[]
  queueIndex: number
  error: string | null
  /** La pista actual suena desde una descarga local. */
  currentOffline: boolean

  playTrack: (track: MusicTrack, newQueue?: MusicTrack[]) => void
  togglePlay: () => void
  pause: () => void
  resume: () => void
  seek: (ms: number) => void
  setVolume: (vol: number) => void
  toggleMute: () => void
  nextTrack: () => void
  prevTrack: () => void
  addToQueue: (track: MusicTrack) => void
  addManyToQueue: (tracks: MusicTrack[]) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void
  toggleRepeat: () => void
  toggleShuffle: () => void
  clearError: () => void
  /** Suelta el audio si la pista indicada es la que está sonando. */
  unloadTrack: (id: string) => void
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  const audio = typeof window !== 'undefined' ? getAudio() : null

  if (audio) {
    audio.addEventListener('timeupdate', () => {
      // Mientras se resuelve otra canción el elemento aún reporta la anterior.
      if (get().isBuffering) return
      set({
        progressMs: Math.round(audio.currentTime * 1000),
        durationMs: Math.round((audio.duration || 0) * 1000),
      })
    })

    // Algunas vistas (artista, álbum) no traen duración: se toma del audio.
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        set({ durationMs: Math.round(audio.duration * 1000) })
      }
    })

    audio.addEventListener('playing', () => {
      // El contexto puede haber nacido suspendido: cualquier gesto lo reanuda.
      resumeAudio()
      syncVolume(audio, get().volume, get().isMuted)
      set({ isPlaying: true, isBuffering: false })
    })

    audio.addEventListener('pause', () => {
      set({ isPlaying: false })
    })

    audio.addEventListener('waiting', () => {
      set({ isBuffering: true })
    })

    audio.addEventListener('ended', () => {
      const { repeatMode, nextTrack } = get()
      if (repeatMode === 'one') {
        audio.currentTime = 0
        void audio.play().catch(() => undefined)
      } else {
        nextTrack()
      }
    })

    audio.addEventListener('error', () => {
      set({
        isPlaying: false,
        isBuffering: false,
        error: 'No se pudo reproducir el audio. Prueba otra canción.',
      })
    })
  }

  return {
    currentTrack: null,
    isPlaying: false,
    isBuffering: false,
    progressMs: 0,
    durationMs: 0,
    volume: 0.85,
    isMuted: false,
    repeatMode: 'all',
    shuffle: false,
    queue: [],
    queueIndex: -1,
    error: null,
    currentOffline: false,

    playTrack: (track: MusicTrack, newQueue?: MusicTrack[]) => {
      const a = getAudio()
      let queue = get().queue
      let queueIndex = get().queueIndex

      if (newQueue) {
        queue = newQueue
        queueIndex = newQueue.findIndex((t) => t.id === track.id)
      } else if (!queue.some((t) => t.id === track.id)) {
        queue = [...queue, track]
        queueIndex = queue.length - 1
      } else {
        queueIndex = queue.findIndex((t) => t.id === track.id)
      }

      // Una sola fuente de sonido: la radio se apaga al dar play aquí.
      useStore.getState().setLofiPlaying(false)

      // La fuente anterior sigue cargada hasta que yt-dlp responde (~1 s):
      // se silencia para que no suene encima de la canción nueva.
      a.muted = true

      set({
        currentTrack: track,
        queue,
        queueIndex,
        progressMs: 0,
        durationMs: track.durationSec * 1000,
        isBuffering: true,
        error: null,
        currentOffline: false,
      })

      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: track.album || 'YouTube Music',
          artwork: track.thumbnail
            ? [{ src: track.thumbnail, sizes: '512x512', type: 'image/jpeg' }]
            : [],
        })
      }

      const token = ++loadToken
      resumeAudio()

      resolveStream(track.id)
        .then(({ url, offline }) => {
          if (token !== loadToken) return

          a.src = url
          syncVolume(a, get().volume, get().isMuted)
          set({ currentOffline: offline })

          // WebView2 puede bloquear el autoplay tras el await: arrancamos en
          // silencio (siempre permitido) y subimos el volumen al sonar.
          a.muted = true
          resumeAudio()
          return a.play().then(() => {
            if (token === loadToken) syncVolume(a, get().volume, get().isMuted)
          })
        })
        .catch((err: unknown) => {
          if (token !== loadToken) return
          a.muted = false
          set({
            isBuffering: false,
            isPlaying: false,
            error:
              err instanceof Error
                ? err.message
                : String(err ?? 'No se pudo preparar el audio'),
          })
        })
    },

    togglePlay: () => {
      const a = getAudio()
      const { isPlaying, currentTrack } = get()
      if (!currentTrack) return

      if (isPlaying) {
        a.pause()
        set({ isPlaying: false })
      } else {
        useStore.getState().setLofiPlaying(false)
        resumeAudio()
        void a.play().catch(() => {
          set({ error: 'El navegador bloqueó la reproducción. Pulsa play otra vez.' })
        })
        set({ isPlaying: true })
      }
    },

    pause: () => {
      const a = getAudio()
      a.pause()
      set({ isPlaying: false })
    },

    resume: () => {
      const a = getAudio()
      if (get().currentTrack) {
        resumeAudio()
        void a.play().catch(() => undefined)
        set({ isPlaying: true })
      }
    },

    seek: (ms: number) => {
      const a = getAudio()
      if (Number.isFinite(a.duration)) {
        a.currentTime = Math.min(ms / 1000, a.duration)
      }
      set({ progressMs: ms })
    },

    setVolume: (vol: number) => {
      const audio = getAudio()
      const clamped = Math.max(0, Math.min(1, vol))
      syncVolume(audio, clamped, clamped === 0)
      set({ volume: clamped, isMuted: clamped === 0 })
    },

    toggleMute: () => {
      const audio = getAudio()
      const { isMuted, volume } = get()
      if (isMuted) {
        syncVolume(audio, volume || 0.8, false)
        set({ isMuted: false })
      } else {
        syncVolume(audio, volume, true)
        set({ isMuted: true })
      }
    },

    nextTrack: () => {
      const { queue, queueIndex, shuffle, repeatMode, playTrack } = get()
      if (queue.length === 0) return

      let nextIndex = queueIndex + 1

      if (shuffle) {
        nextIndex = Math.floor(Math.random() * queue.length)
      } else if (nextIndex >= queue.length) {
        if (repeatMode === 'all') {
          nextIndex = 0
        } else {
          return
        }
      }

      const next = queue[nextIndex]
      if (next) playTrack(next)
    },

    prevTrack: () => {
      const { queue, queueIndex, playTrack, progressMs } = get()
      const a = getAudio()

      if (progressMs > 3000) {
        a.currentTime = 0
        set({ progressMs: 0 })
        return
      }

      if (queue.length === 0) return
      let prevIndex = queueIndex - 1
      if (prevIndex < 0) prevIndex = queue.length - 1

      const prev = queue[prevIndex]
      if (prev) playTrack(prev)
    },

    addToQueue: (track: MusicTrack) => {
      set((state) => ({ queue: [...state.queue, track] }))
    },

    addManyToQueue: (tracks: MusicTrack[]) => {
      if (tracks.length === 0) return
      set((state) => ({ queue: [...state.queue, ...tracks] }))
    },

    removeFromQueue: (index: number) => {
      set((state) => {
        const queue = [...state.queue]
        queue.splice(index, 1)
        return { queue }
      })
    },

    clearQueue: () => {
      const a = getAudio()
      a.pause()
      a.removeAttribute('src')
      a.load()
      loadToken++
      set({
        queue: [],
        queueIndex: -1,
        currentTrack: null,
        isPlaying: false,
        isBuffering: false,
        progressMs: 0,
        durationMs: 0,
        currentOffline: false,
      })
    },

    toggleRepeat: () => {
      const modes: Array<'off' | 'all' | 'one'> = ['off', 'all', 'one']
      const current = get().repeatMode
      const next = modes[(modes.indexOf(current) + 1) % modes.length]
      set({ repeatMode: next })
    },

    toggleShuffle: () => {
      set((state) => ({ shuffle: !state.shuffle }))
    },

    clearError: () => set({ error: null }),

    unloadTrack: (id) => {
      if (get().currentTrack?.id !== id) return
      const a = getAudio()
      a.pause()
      a.removeAttribute('src')
      a.load()
      loadToken++
      set({
        currentTrack: null,
        isPlaying: false,
        isBuffering: false,
        progressMs: 0,
        durationMs: 0,
        currentOffline: false,
      })
    },
  }
})

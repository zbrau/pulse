import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { MusicTrack, SavedPlaylist } from '../types'
import { migrateStorageKey } from '../lib/storage'

export type SavePlaylistInput = {
  name: string
  cover: string | null
  /** Enlace de Spotify o `file:nombre.csv`: identifica la lista. */
  origin: string
  tracks: MusicTrack[]
}

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

/** Un mismo enlace con `?si=…` cuenta como la misma playlist. */
export const normalizeOrigin = (origin: string): string => {
  const trimmed = origin.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      // Ojo: no se pasa a minúsculas el path; los ids de Spotify distinguen
      // mayúsculas de minúsculas.
      const url = new URL(trimmed)
      url.search = ''
      url.hash = ''
      return url.toString().replace(/\/+$/, '')
    } catch {
      return trimmed.split('?')[0].replace(/\/+$/, '')
    }
  }
  return trimmed.toLowerCase()
}

/**
 * `localStorage` puede rechazar escrituras cuando se llena la cuota.
 * Preferimos perder el guardado antes que romper la app.
 */
const safeStorage = {
  getItem: (name: string): string | null => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(name, value)
    } catch (err) {
      console.warn('[Pulse] no se pudo guardar la biblioteca:', err)
    }
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name)
    } catch {
      // sin nada que hacer
    }
  },
}

type LibraryState = {
  playlists: SavedPlaylist[]
  /** Guarda o actualiza (por origen). Devuelve el id resultante. */
  savePlaylist: (input: SavePlaylistInput) => string
  rename: (id: string, name: string) => void
  remove: (id: string) => void
}

migrateStorageKey('sonora-library-v1', 'pulse-library-v1')

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      playlists: [],

      savePlaylist: (input) => {
        const origin = normalizeOrigin(input.origin)
        const tracks = input.tracks.slice()
        if (tracks.length === 0) return ''

        const now = Date.now()
        const existing = get().playlists.find(
          (playlist) => normalizeOrigin(playlist.origin) === origin,
        )

        if (existing) {
          set((state) => ({
            playlists: state.playlists.map((playlist) =>
              playlist.id === existing.id
                ? {
                    ...playlist,
                    name: input.name.trim() || playlist.name,
                    cover: input.cover ?? playlist.cover,
                    origin,
                    tracks,
                    updatedAt: now,
                  }
                : playlist,
            ),
          }))
          return existing.id
        }

        const playlist: SavedPlaylist = {
          id: uid(),
          name: input.name.trim() || 'Playlist importada',
          cover: input.cover,
          origin,
          createdAt: now,
          updatedAt: now,
          tracks,
        }
        set((state) => ({ playlists: [playlist, ...state.playlists] }))
        return playlist.id
      },

      rename: (id, name) => {
        const clean = name.trim().slice(0, 80)
        if (!clean) return
        set((state) => ({
          playlists: state.playlists.map((playlist) =>
            playlist.id === id
              ? { ...playlist, name: clean, updatedAt: Date.now() }
              : playlist,
          ),
        }))
      },

      remove: (id) =>
        set((state) => ({
          playlists: state.playlists.filter((playlist) => playlist.id !== id),
        })),
    }),
    {
      name: 'pulse-library-v1',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ playlists: state.playlists }),
      merge: (persisted, current) => {
        const saved = persisted as { playlists?: unknown } | null
        const playlists = Array.isArray(saved?.playlists)
          ? (saved.playlists as SavedPlaylist[]).filter(
              (playlist) =>
                Boolean(playlist) &&
                typeof playlist.id === 'string' &&
                Array.isArray(playlist.tracks),
            )
          : []
        return { ...current, playlists }
      },
    },
  ),
)

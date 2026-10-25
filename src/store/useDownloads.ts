import { create } from 'zustand'
import type { MusicTrack } from '../types'
import type {
  DownloadEntry,
  DownloadProgress,
  DownloadsInfo,
} from '../lib/downloads'
import {
  deleteDownload,
  downloadTrack,
  getDownloadsInfo,
  listDownloads,
  onDownloadDone,
  onDownloadError,
  onDownloadProgress,
} from '../lib/downloads'
import { isDesktop } from '../lib/desktop'
import { useStore } from './useStore'

const without = <T,>(record: Record<string, T>, key: string): Record<string, T> => {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}

type State = {
  entries: DownloadEntry[]
  /** Canciones que se están descargando ahora mismo. */
  pending: Record<string, MusicTrack>
  progress: Record<string, DownloadProgress>
  errors: Record<string, string>
  info: DownloadsInfo | null
  loading: boolean

  init: () => void
  refresh: () => Promise<void>
  start: (track: MusicTrack) => Promise<void>
  remove: (id: string) => Promise<void>
  clearError: (id: string) => void
}

let started = false

export const useDownloads = create<State>((set, get) => ({
  entries: [],
  pending: {},
  progress: {},
  errors: {},
  info: null,
  loading: false,

  init: () => {
    if (started) return
    started = true
    if (!isDesktop()) return

    void onDownloadProgress((event) => {
      set((state) => ({ progress: { ...state.progress, [event.id]: event } }))
    })

    void onDownloadDone((entry) => {
      set((state) => ({
        pending: without(state.pending, entry.id),
        progress: without(state.progress, entry.id),
        errors: without(state.errors, entry.id),
      }))
      void get().refresh()
    })

    void onDownloadError((failure) => {
      set((state) => ({
        pending: without(state.pending, failure.id),
        progress: without(state.progress, failure.id),
        errors: { ...state.errors, [failure.id]: failure.message },
      }))
      void get().refresh()
    })

    void get().refresh()
  },

  refresh: async () => {
    if (!isDesktop()) return
    set({ loading: true })
    try {
      const [entries, info] = await Promise.all([
        listDownloads(),
        getDownloadsInfo(),
      ])
      set({ entries, info, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  start: async (track) => {
    if (!isDesktop()) return
    if (get().entries.some((entry) => entry.id === track.id)) return
    if (get().progress[track.id]) return

    const quality = useStore.getState().settings.downloadQuality

    set((state) => ({
      pending: { ...state.pending, [track.id]: track },
      progress: {
        ...state.progress,
        [track.id]: {
          id: track.id,
          percent: 0,
          totalBytes: 0,
          downloadedBytes: 0,
        },
      },
      errors: without(state.errors, track.id),
    }))

    try {
      await downloadTrack(track, quality)
      set((state) => ({
        pending: without(state.pending, track.id),
        progress: without(state.progress, track.id),
      }))
      await get().refresh()
    } catch (err) {
      set((state) => ({
        pending: without(state.pending, track.id),
        progress: without(state.progress, track.id),
        errors: {
          ...state.errors,
          [track.id]: err instanceof Error ? err.message : String(err),
        },
      }))
    }
  },

  remove: async (id) => {
    try {
      await deleteDownload(id)
      set((state) => ({ errors: without(state.errors, id) }))
      await get().refresh()
    } catch (err) {
      set((state) => ({
        errors: {
          ...state.errors,
          [id]: err instanceof Error ? err.message : String(err),
        },
      }))
    }
  },

  clearError: (id) => set((state) => ({ errors: without(state.errors, id) })),
}))

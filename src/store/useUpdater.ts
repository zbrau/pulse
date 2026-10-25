import { create } from 'zustand'
import type { Update } from '@tauri-apps/plugin-updater'
import {
  checkForUpdate,
  installUpdate,
  restartApp,
  updaterSupported,
} from '../lib/updater'

export type UpdateStatus =
  | 'idle'
  | 'unsupported'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'

/** El plugin devuelve mensajes en inglés; la interfaz está en español. */
function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const lower = raw.toLowerCase()
  if (lower.includes('valid release json') || lower.includes('could not fetch')) {
    return 'No se pudo leer el manifiesto de actualización. Comprueba la conexión o que la última release incluya latest.json.'
  }
  if (lower.includes('signature') || lower.includes('verify')) {
    return 'La firma de la actualización no es válida. No se ha instalado nada.'
  }
  if (lower.includes('network') || lower.includes('dns') || lower.includes('connect')) {
    return 'No se pudo conectar con GitHub. Inténtalo más tarde.'
  }
  return raw
}

type State = {
  status: UpdateStatus
  update: Update | null
  version: string | null
  notes: string | null
  date: string | null
  progress: number
  error: string | null
  /** El usuario ocultó el aviso de la barra superior. */
  dismissed: boolean

  check: (silent?: boolean) => Promise<void>
  install: () => Promise<void>
  dismiss: () => void
}

export const useUpdater = create<State>((set, get) => ({
  status: 'idle',
  update: null,
  version: null,
  notes: null,
  date: null,
  progress: 0,
  error: null,
  dismissed: false,

  check: async () => {
    if (!updaterSupported()) {
      set({ status: 'unsupported' })
      return
    }

    set({ status: 'checking', error: null })

    try {
      const update = await checkForUpdate()
      if (update) {
        set({
          update,
          status: 'available',
          version: update.version,
          notes: update.body ?? null,
          date: update.date ?? null,
          dismissed: false,
        })
      } else {
        set({ update: null, status: 'current', version: null, notes: null })
      }
    } catch (err) {
      set({
        status: 'error',
        error: friendlyError(err),
      })
    }
  },

  install: async () => {
    const { update } = get()
    if (!update) return

    set({ status: 'downloading', progress: 0, error: null })

    try {
      await installUpdate(update, (progress) =>
        set({ progress: progress.percent }),
      )
      set({ status: 'ready', progress: 100 })
      await restartApp()
    } catch (err) {
      set({
        status: 'error',
        error: friendlyError(err),
      })
    }
  },

  dismiss: () => set({ dismissed: true }),
}))

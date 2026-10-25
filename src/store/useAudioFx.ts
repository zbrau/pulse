import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { applyEq, EQ_BANDS, EQ_MAX, EQ_MIN } from '../lib/audioGraph'
import { migrateStorageKey } from '../lib/storage'

export type EqPresetId = 'flat' | 'bass' | 'vocal' | 'rock' | 'electronic' | 'night'
/** `custom` = el usuario movió una banda a mano. */
export type EqPreset = EqPresetId | 'custom'

export const FLAT_GAINS: number[] = EQ_BANDS.map(() => 0)

export const EQ_PRESETS: Array<{
  id: EqPresetId
  label: string
  gains: number[]
}> = [
  { id: 'flat', label: 'Plano', gains: [0, 0, 0, 0, 0] },
  { id: 'bass', label: 'Graves', gains: [7, 3, 0, -1, -2] },
  { id: 'vocal', label: 'Vocal', gains: [-2, 0, 4, 3, 0] },
  { id: 'rock', label: 'Rock', gains: [5, 2, -1, 3, 5] },
  { id: 'electronic', label: 'Electrónica', gains: [6, 3, 0, 3, 6] },
  { id: 'night', label: 'Noche', gains: [3, 1, 0, -3, -5] },
]

const clampGain = (value: number): number => {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(EQ_MIN, Math.min(EQ_MAX, Math.round(n)))
}

const sameGains = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index])

/** Ganancias reales que se aplican al grafo (plano si está apagado). */
export const effectiveGains = (state: {
  enabled: boolean
  gains: number[]
}): number[] => (state.enabled ? state.gains : FLAT_GAINS)

type State = {
  enabled: boolean
  gains: number[]
  preset: EqPreset
  setEnabled: (enabled: boolean) => void
  toggleEnabled: () => void
  setBand: (index: number, value: number) => void
  setPreset: (id: EqPresetId) => void
  reset: () => void
}

migrateStorageKey('sonora-audio-fx-v1', 'pulse-audio-fx-v1')

export const useAudioFx = create<State>()(
  persist(
    (set) => ({
      enabled: false,
      gains: [...FLAT_GAINS],
      preset: 'flat',

      setEnabled: (enabled) => set({ enabled }),
      toggleEnabled: () => set((state) => ({ enabled: !state.enabled })),

      setBand: (index, value) =>
        set((state) => {
          if (index < 0 || index >= EQ_BANDS.length) return state
          const gains = [...state.gains]
          gains[index] = clampGain(value)
          const match = EQ_PRESETS.find((preset) => sameGains(preset.gains, gains))
          return { gains, preset: match?.id ?? 'custom' }
        }),

      // Elegir un preset enciende el ecualizador: es lo que espera el usuario.
      setPreset: (id) =>
        set(() => {
          const preset = EQ_PRESETS.find((item) => item.id === id) ?? EQ_PRESETS[0]
          return { enabled: true, gains: [...preset.gains], preset: preset.id }
        }),

      reset: () =>
        set({ gains: [...FLAT_GAINS], preset: 'flat' }),
    }),
    {
      name: 'pulse-audio-fx-v1',
      version: 1,
      partialize: (state) => ({
        enabled: state.enabled,
        gains: state.gains,
        preset: state.preset,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<State> | null
        const gains =
          Array.isArray(saved?.gains) && saved.gains.length === EQ_BANDS.length
            ? saved.gains.map(clampGain)
            : [...FLAT_GAINS]
        const preset =
          saved?.preset && saved.preset !== 'custom'
            ? (EQ_PRESETS.find((item) => item.id === saved.preset)?.id ?? 'flat')
            : saved?.preset === 'custom'
              ? 'custom'
              : 'flat'

        return {
          ...current,
          enabled: Boolean(saved?.enabled),
          gains,
          preset,
        }
      },
      onRehydrateStorage: () => (state) => {
        if (state) applyEq(effectiveGains(state))
      },
    },
  ),
)

// Mantiene el grafo sincronizado con el estado guardado.
useAudioFx.subscribe((state) => applyEq(effectiveGains(state)))
applyEq(effectiveGains(useAudioFx.getState()))

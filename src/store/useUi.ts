import { create } from 'zustand'

export type SettingsTab = 'focus' | 'music' | 'downloads' | 'data'

export type ArtistTarget = {
  id: string
  name: string
}

type UiState = {
  settingsOpen: boolean
  settingsTab: SettingsTab
  openSettings: (tab?: SettingsTab) => void
  closeSettings: () => void

  artist: ArtistTarget | null
  openArtist: (artist: ArtistTarget) => void
  closeArtist: () => void

  importOpen: boolean
  openImport: () => void
  closeImport: () => void

  libraryOpen: boolean
  openLibrary: () => void
  closeLibrary: () => void

  eqOpen: boolean
  openEq: () => void
  closeEq: () => void

  downloadsOpen: boolean
  openDownloads: () => void
  closeDownloads: () => void

  /** Ventana compacta siempre visible. */
  mini: boolean
  setMini: (mini: boolean) => void
}

export const useUi = create<UiState>((set, get) => ({
  settingsOpen: false,
  settingsTab: 'focus',
  openSettings: (tab = 'focus') => set({ settingsOpen: true, settingsTab: tab }),
  closeSettings: () => set({ settingsOpen: false }),

  artist: null,
  openArtist: (artist) => set({ artist }),
  closeArtist: () => set({ artist: null }),

  importOpen: false,
  openImport: () => set({ importOpen: true }),
  closeImport: () => set({ importOpen: false }),

  libraryOpen: false,
  openLibrary: () => set({ libraryOpen: true }),
  closeLibrary: () => set({ libraryOpen: false }),

  eqOpen: false,
  openEq: () => set({ eqOpen: true }),
  closeEq: () => set({ eqOpen: false }),

  downloadsOpen: false,
  openDownloads: () => set({ downloadsOpen: true }),
  closeDownloads: () => set({ downloadsOpen: false }),

  mini: false,
  setMini: (mini) => {
    if (mini === get().mini) return
    // En mini no tiene sentido dejar un diálogo abierto y tapando todo.
    if (mini) {
      set({
        mini: true,
        settingsOpen: false,
        artist: null,
        importOpen: false,
        libraryOpen: false,
        eqOpen: false,
        downloadsOpen: false,
      })
    } else {
      set({ mini: false })
    }
  },
}))

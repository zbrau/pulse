import { useEffect } from 'react'
import { TopBar } from './components/TopBar'
import { TasksPanel } from './components/TasksPanel'
import { PomodoroCard } from './components/PomodoroCard'
import { LyricsCard } from './components/LyricsCard'
import { FreePlayerCard } from './components/FreePlayerCard'
import { LofiCard } from './components/LofiCard'
import { WeekStrip } from './components/WeekStrip'
import { SettingsDialog } from './components/SettingsDialog'
import { ArtistDialog } from './components/ArtistDialog'
import { PlaylistImportDialog } from './components/PlaylistImportDialog'
import { LibraryDialog } from './components/LibraryDialog'
import { EqualizerDialog } from './components/EqualizerDialog'
import { useStore } from './store/useStore'
import { useUi } from './store/useUi'
import { useTimerEngine } from './hooks/useTimerEngine'

function useSpacebar() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.metaKey || e.ctrlKey || e.altKey) return
      const ui = useUi.getState()
      if (ui.settingsOpen || ui.artist || ui.importOpen || ui.libraryOpen || ui.eqOpen) {
        return
      }
      const target = e.target as HTMLElement | null
      if (
        target?.closest(
          'input, textarea, select, button, a, [contenteditable="true"], [role="dialog"]',
        )
      ) {
        return
      }
      e.preventDefault()
      useStore.getState().toggleTimer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export default function App() {
  useTimerEngine()
  useSpacebar()

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-4 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(300px,344px)]">
          <div className="order-2 flex flex-col gap-4 lg:order-1">
            <TasksPanel />
            <WeekStrip />
          </div>

          <div className="order-1 flex flex-col gap-4 lg:order-2">
            <PomodoroCard />
            <LyricsCard />
          </div>

          <div className="order-3 flex flex-col gap-4">
            <FreePlayerCard />
            <LofiCard />
          </div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-[1440px] px-6 pb-6">
        <p className="text-center text-[10px] leading-relaxed text-faint">
          Pulse · catálogo por InnerTube · audio con yt-dlp · letras por lrclib ·
          espacio para iniciar o pausar
        </p>
      </footer>

      <SettingsDialog />
      <ArtistDialog />
      <PlaylistImportDialog />
      <LibraryDialog />
      <EqualizerDialog />
    </div>
  )
}

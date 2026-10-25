import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  DayStat,
  Priority,
  Settings,
  Task,
  TaskDraft,
  Timer,
  TimerMode,
} from '../types'
import { todayKey } from '../lib/date'
import { moveTaskWithin, sortPending } from '../lib/tasks'
import { migrateStorageKey } from '../lib/storage'

export const DEFAULT_SETTINGS: Settings = {
  workMin: 25,
  shortMin: 5,
  longMin: 15,
  cyclesBeforeLong: 4,
  autoStartBreaks: true,
  autoStartWork: false,
  soundOn: true,
  lofiVolume: 0.45,
  downloadQuality: 'best',
}

export const durationFor = (mode: TimerMode, s: Settings): number => {
  const min =
    mode === 'work' ? s.workMin : mode === 'short' ? s.shortMin : s.longMin
  return Math.max(1, min) * 60_000
}

const newTimer = (mode: TimerMode = 'work', settings = DEFAULT_SETTINGS): Timer => ({
  mode,
  running: false,
  endsAt: null,
  remainingMs: durationFor(mode, settings),
  cycle: 0,
})

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

type State = {
  tasks: Task[]
  activeTaskId: string | null
  settings: Settings
  timer: Timer
  stats: Record<string, DayStat>
  lofiPlaying: boolean
  stationId: string
}

type Actions = {
  addTask: (title: string, draft?: TaskDraft) => void
  toggleTask: (id: string) => void
  removeTask: (id: string) => void
  renameTask: (id: string, title: string) => void
  setEstimate: (id: string, estimate: number) => void
  setPriority: (id: string, priority: Priority) => void
  duplicateTask: (id: string) => void
  moveTask: (id: string, targetId: string, place: 'before' | 'after') => void
  moveTaskBy: (id: string, delta: -1 | 1) => void
  clearDone: () => void
  setActiveTask: (id: string | null) => void

  startTimer: () => void
  pauseTimer: () => void
  toggleTimer: () => void
  resetTimer: () => void
  skipTimer: () => void
  setMode: (mode: TimerMode) => void
  tick: (now: number) => TimerMode | null
  finishSession: (now: number, award: boolean) => void
  resume: (now: number) => void

  updateSettings: (patch: Partial<Settings>) => void
  setLofiPlaying: (playing: boolean) => void
  setStation: (id: string) => void
  resetStats: () => void
}

export type Store = State & Actions

migrateStorageKey('focus-deck-v1', 'pulse-state-v1')

type LegacyTask = Omit<Task, 'priority' | 'tags'> &
  Partial<Pick<Task, 'priority' | 'tags'>>

/** Rellena prioridad/etiquetas en las tareas guardadas antes de la v2. */
const migratePersisted = (persisted: unknown): Store => {
  const state = persisted as { tasks?: LegacyTask[] } & Record<string, unknown>
  if (Array.isArray(state.tasks)) {
    state.tasks = state.tasks.map((t) => ({
      ...t,
      priority: t.priority ?? 'media',
      tags: t.tags ?? [],
    }))
  }
  return state as unknown as Store
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      tasks: [],
      activeTaskId: null,
      settings: DEFAULT_SETTINGS,
      timer: newTimer(),
      stats: {},
      lofiPlaying: false,
      stationId: 'lofi',

      addTask: (title, draft) => {
        const clean = title.trim()
        if (!clean) return
        const task: Task = {
          id: uid(),
          title: clean,
          done: false,
          priority: draft?.priority ?? 'media',
          tags: draft?.tags ?? [],
          pomodoros: 0,
          estimate: Math.min(12, Math.max(1, draft?.estimate ?? 1)),
          createdAt: Date.now(),
          completedAt: null,
        }
        set((s) => ({
          tasks: [task, ...s.tasks],
          activeTaskId: s.activeTaskId ?? task.id,
        }))
      },

      toggleTask: (id) =>
        set((s) => {
          const tasks = s.tasks.map((t) =>
            t.id === id
              ? { ...t, done: !t.done, completedAt: !t.done ? Date.now() : null }
              : t,
          )
          const toggled = tasks.find((t) => t.id === id)
          const activeTaskId =
            toggled?.done && s.activeTaskId === id
              ? (tasks.find((t) => !t.done)?.id ?? null)
              : s.activeTaskId
          return { tasks, activeTaskId }
        }),

      removeTask: (id) =>
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
          activeTaskId: s.activeTaskId === id ? null : s.activeTaskId,
        })),

      renameTask: (id, title) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, title: title.trim() || t.title } : t,
          ),
        })),

      setEstimate: (id, estimate) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? { ...t, estimate: Math.min(12, Math.max(1, estimate)) }
              : t,
          ),
        })),

      setPriority: (id, priority) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, priority } : t)),
        })),

      duplicateTask: (id) =>
        set((s) => {
          const source = s.tasks.find((t) => t.id === id)
          if (!source) return s
          const copy: Task = {
            ...source,
            id: uid(),
            done: false,
            pomodoros: 0,
            createdAt: Date.now(),
            completedAt: null,
          }
          const tasks = [...s.tasks]
          tasks.splice(tasks.indexOf(source) + 1, 0, copy)
          return { tasks }
        }),

      moveTask: (id, targetId, place) =>
        set((s) => {
          const target = s.tasks.find((t) => t.id === targetId)
          if (!target) return s
          return {
            tasks: moveTaskWithin(s.tasks, id, targetId, place, target.priority),
          }
        }),

      moveTaskBy: (id, delta) =>
        set((s) => {
          const ordered = sortPending(s.tasks)
          const index = ordered.findIndex((t) => t.id === id)
          const target = ordered[index + delta]
          if (index < 0 || !target) return s
          return {
            tasks: moveTaskWithin(
              s.tasks,
              id,
              target.id,
              delta < 0 ? 'before' : 'after',
              target.priority,
            ),
          }
        }),

      clearDone: () =>
        set((s) => ({ tasks: s.tasks.filter((t) => !t.done) })),

      setActiveTask: (id) => set({ activeTaskId: id }),

      startTimer: () =>
        set((s) => {
          const remaining =
            s.timer.remainingMs > 0
              ? s.timer.remainingMs
              : durationFor(s.timer.mode, s.settings)
          return {
            timer: {
              ...s.timer,
              running: true,
              endsAt: Date.now() + remaining,
              remainingMs: remaining,
            },
          }
        }),

      pauseTimer: () =>
        set((s) => {
          if (!s.timer.running || s.timer.endsAt === null) return s
          const remaining = Math.max(0, s.timer.endsAt - Date.now())
          return {
            timer: { ...s.timer, running: false, endsAt: null, remainingMs: remaining },
          }
        }),

      toggleTimer: () => {
        const { timer, startTimer, pauseTimer } = get()
        if (timer.running) pauseTimer()
        else startTimer()
      },

      resetTimer: () =>
        set((s) => ({
          timer: {
            ...s.timer,
            running: false,
            endsAt: null,
            remainingMs: durationFor(s.timer.mode, s.settings),
          },
        })),

      skipTimer: () => get().finishSession(Date.now(), false),

      setMode: (mode) =>
        set((s) => ({
          timer: {
            ...s.timer,
            mode,
            running: false,
            endsAt: null,
            remainingMs: durationFor(mode, s.settings),
          },
        })),

      tick: (now) => {
        const { timer } = get()
        if (!timer.running || timer.endsAt === null) return null
        const remaining = timer.endsAt - now
        if (remaining > 0) {
          if (Math.abs(timer.remainingMs - remaining) > 90) {
            set({ timer: { ...timer, remainingMs: remaining } })
          }
          return null
        }
        get().finishSession(now, true)
        return timer.mode
      },

      finishSession: (now, award) => {
        const { timer, settings, tasks, activeTaskId, stats } = get()
        const key = todayKey(new Date(now))
        const day = stats[key] ?? { focusMinutes: 0, pomodoros: 0 }
        let nextStats = stats
        let nextTasks = tasks
        let nextCycle = timer.cycle
        let nextMode: TimerMode = 'work'

        if (timer.mode === 'work') {
          nextCycle = timer.cycle + 1
          if (award) {
            nextStats = {
              ...stats,
              [key]: {
                focusMinutes: day.focusMinutes + settings.workMin,
                pomodoros: day.pomodoros + 1,
              },
            }
            if (activeTaskId) {
              nextTasks = tasks.map((t) =>
                t.id === activeTaskId ? { ...t, pomodoros: t.pomodoros + 1 } : t,
              )
            }
          }
          nextMode = nextCycle % settings.cyclesBeforeLong === 0 ? 'long' : 'short'
        } else {
          nextMode = 'work'
        }

        const auto =
          nextMode === 'work' ? settings.autoStartWork : settings.autoStartBreaks
        const duration = durationFor(nextMode, settings)
        set({
          stats: nextStats,
          tasks: nextTasks,
          timer: {
            mode: nextMode,
            cycle: nextCycle,
            running: auto,
            endsAt: auto ? now + duration : null,
            remainingMs: duration,
          },
        })
      },

      resume: (now) => {
        const { timer, settings } = get()
        if (!timer.running || timer.endsAt === null) return
        const remaining = timer.endsAt - now
        if (remaining > 0) {
          set({ timer: { ...timer, remainingMs: remaining } })
          return
        }
        // Si la sesión terminó hace mucho (pestaña cerrada), no regalamos stats.
        if (now - timer.endsAt > 10 * 60_000) {
          set({
            timer: {
              ...timer,
              running: false,
              endsAt: null,
              remainingMs: durationFor(timer.mode, settings),
            },
          })
        } else {
          get().finishSession(now, true)
        }
      },

      updateSettings: (patch) =>
        set((s) => {
          const settings = { ...s.settings, ...patch }
          const durationChanged =
            (patch.workMin !== undefined && s.timer.mode === 'work') ||
            (patch.shortMin !== undefined && s.timer.mode === 'short') ||
            (patch.longMin !== undefined && s.timer.mode === 'long')
          return {
            settings,
            timer: durationChanged
              ? {
                  ...s.timer,
                  running: false,
                  endsAt: null,
                  remainingMs: durationFor(s.timer.mode, settings),
                }
              : s.timer,
          }
        }),

      setLofiPlaying: (playing) => set({ lofiPlaying: playing }),
      setStation: (id) => set({ stationId: id }),
      resetStats: () => set({ stats: {}, timer: { ...get().timer, cycle: 0 } }),
    }),
    {
      name: 'pulse-state-v1',
      version: 2,
      migrate: (persisted) => migratePersisted(persisted),
      partialize: (s) => ({
        tasks: s.tasks,
        activeTaskId: s.activeTaskId,
        settings: s.settings,
        timer: s.timer,
        stats: s.stats,
        stationId: s.stationId,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<Store> & {
          settings?: Partial<Settings>
        }
        return {
          ...current,
          ...saved,
          // Los ajustes nuevos (calidad de descarga) toman su valor por
          // defecto si el estado guardado es anterior.
          settings: { ...DEFAULT_SETTINGS, ...(saved?.settings ?? {}) },
        }
      },
    },
  ),
)

const EMPTY_DAY: DayStat = { focusMinutes: 0, pomodoros: 0 }

export const selectToday = (s: Store): DayStat =>
  s.stats[todayKey()] ?? EMPTY_DAY

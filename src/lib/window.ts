import { invoke } from '@tauri-apps/api/core'
import {
  getCurrentWindow,
  LogicalSize,
  PhysicalSize,
} from '@tauri-apps/api/window'
import { isDesktop } from './desktop'

/** Tamaño previo (físico) para devolver la ventana a su sitio. */
let saved: { width: number; height: number } | null = null
let active = false

export const isMiniWindow = (): boolean => active

/** Minimiza la ventana nativa de escritorio. */
export async function minimizeWindow(): Promise<void> {
  if (!isDesktop()) return
  try {
    await invoke('minimize_window')
  } catch {
    try {
      await getCurrentWindow().minimize()
    } catch (err) {
      console.warn('[window] error minimizando:', err)
    }
  }
}

/** Alterna entre maximizar y restaurar la ventana. */
export async function toggleMaximizeWindow(): Promise<void> {
  if (!isDesktop()) return
  try {
    await invoke('toggle_maximize_window')
  } catch {
    try {
      await getCurrentWindow().toggleMaximize()
    } catch (err) {
      console.warn('[window] error maximizando:', err)
    }
  }
}

/** Cierra la ventana. */
export async function closeWindow(): Promise<void> {
  if (!isDesktop()) return
  try {
    await invoke('close_window')
  } catch {
    try {
      await getCurrentWindow().close()
    } catch (err) {
      console.warn('[window] error cerrando:', err)
    }
  }
}

/** Encoge la ventana y la deja siempre encima. */
export async function enterMiniWindow(): Promise<void> {
  if (!isDesktop() || active) return
  const win = getCurrentWindow()

  try {
    const size = await win.innerSize()
    saved = { width: size.width, height: size.height }
    await win.setResizable(false)
    await win.setMinSize(new LogicalSize(380, 168))
    await win.setSize(new LogicalSize(430, 200))
    await win.setAlwaysOnTop(true)
    await win.setFocus()
    active = true
  } catch (err) {
    active = false
    throw err
  }
}

/** Devuelve el tamaño, el mínimo y el comportamiento normal. */
export async function exitMiniWindow(): Promise<void> {
  if (!isDesktop() || !active) return
  const win = getCurrentWindow()

  try {
    await win.setAlwaysOnTop(false)
    await win.setResizable(true)
    await win.setMinSize(new LogicalSize(1080, 680))
    if (saved) {
      await win.setSize(new PhysicalSize(saved.width, saved.height))
    } else {
      await win.setSize(new LogicalSize(1400, 940))
    }
    saved = null
  } finally {
    active = false
  }
}

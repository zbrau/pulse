import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { isDesktop } from './desktop'

export type InstallProgress = {
  percent: number
  downloadedBytes: number
  totalBytes: number
}

/** El updater solo tiene sentido en la app instalada, no en `vite`. */
export const updaterSupported = (): boolean =>
  isDesktop() && import.meta.env.PROD

export async function checkForUpdate(): Promise<Update | null> {
  if (!updaterSupported()) return null
  return check({ timeout: 20_000 })
}

export async function installUpdate(
  update: Update,
  onProgress: (progress: InstallProgress) => void,
): Promise<void> {
  let total = 0
  let downloaded = 0

  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? 0
      onProgress({ percent: 0, downloadedBytes: 0, totalBytes: total })
      return
    }
    if (event.event === 'Progress') {
      downloaded += event.data.chunkLength
      const percent = total > 0 ? Math.min(100, (downloaded / total) * 100) : 0
      onProgress({ percent, downloadedBytes: downloaded, totalBytes: total })
      return
    }
    onProgress({
      percent: 100,
      downloadedBytes: total,
      totalBytes: total,
    })
  })
}

export async function restartApp(): Promise<void> {
  await relaunch()
}

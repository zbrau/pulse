let ctx: AudioContext | null = null

const getCtx = (): AudioContext | null => {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!Ctor) return null
  ctx ??= new Ctor()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

const tone = (
  audio: AudioContext,
  freq: number,
  start: number,
  duration: number,
  gainValue: number,
) => {
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(gainValue, start + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain).connect(audio.destination)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

/** Campanita suave de fin de sesión. */
export const chime = (kind: 'work' | 'break' = 'work'): void => {
  const audio = getCtx()
  if (!audio) return
  const now = audio.currentTime + 0.02
  const notes = kind === 'work' ? [523.25, 659.25, 783.99] : [659.25, 523.25]
  notes.forEach((f, i) => tone(audio, f, now + i * 0.16, 0.9, 0.09))
}

export const ensureNotifications = async (): Promise<boolean> => {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export const notify = (title: string, body: string): void => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification(title, {
      body,
      silent: true,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">◉</text></svg>',
    })
  } catch {
    /* algunos navegadores no permiten el constructor */
  }
}

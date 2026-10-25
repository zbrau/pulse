import { useEffect, useState } from 'react'
import {
  Check,
  Download,
  Loader2,
  ServerCog,
  Trash2,
} from 'lucide-react'
import { Modal } from './Modal'
import { useUi, type SettingsTab } from '../store/useUi'
import { useStore } from '../store/useStore'
import { todayKey } from '../lib/date'
import { getEngineInfo, isDesktop, type EngineInfo } from '../lib/music'

function NumberField({
  label,
  value,
  onChange,
  min = 1,
  max = 180,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-medium tracking-[0.12em] text-faint uppercase">
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
        }}
        className="input tnum mt-1.5 py-1.5 text-[13px]"
      />
    </label>
  )
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 py-2 text-left"
    >
      <span className="min-w-0">
        <span className="block text-[12.5px] text-fg">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[10.5px] leading-relaxed text-faint">
            {description}
          </span>
        )}
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full p-[2px] transition-colors ${
          checked ? 'bg-accent/70' : 'bg-surface-3'
        }`}
      >
        <span
          className={`block size-4 rounded-full bg-bg shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  )
}

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'focus', label: 'Enfoque' },
  { id: 'music', label: 'Motor' },
  { id: 'data', label: 'Datos' },
]

function EnginePanel() {
  const [info, setInfo] = useState<EngineInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isDesktop()) {
      setError('Sólo disponible dentro de la app de escritorio.')
      return
    }
    getEngineInfo()
      .then(setInfo)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'No se pudo leer el motor'),
      )
  }, [])

  const row = (label: string, ok: boolean | null, detail: string) => (
    <div className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-2/40 px-3 py-2">
      <span
        className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
          ok === null ? 'bg-faint' : ok ? 'bg-break' : 'bg-warn'
        }`}
      />
      <div className="min-w-0">
        <p className="text-[11.5px] text-fg">{label}</p>
        <p className="truncate font-mono text-[10px] text-faint" title={detail}>
          {detail}
        </p>
      </div>
    </div>
  )

  if (error) {
    return (
      <p className="rounded-lg border border-warn/25 bg-warn/[0.07] px-3 py-2 text-[11px] text-warn/90">
        {error}
      </p>
    )
  }

  if (!info) {
    return (
      <div className="flex items-center gap-2 py-4 text-[11.5px] text-faint">
        <Loader2 size={13} className="animate-spin text-accent" /> Consultando el motor…
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {row('InnerTube — catálogo y metadatos', true, 'music.youtube.com · WEB_REMIX')}
      {row('yt-dlp — resolución de audio', info.ytdlp, info.ytdlp ? 'sidecar listo' : 'no encontrado')}
      {row('Proxy local con Range', true, info.proxy)}
      <p className="pt-1 text-[10.5px] leading-relaxed text-faint">
        Pulse v{info.version}. El audio nunca pasa por un servidor externo: yt-dlp
        obtiene la URL y un proxy en loopback la sirve al reproductor con soporte
        de seek.
      </p>
    </div>
  )
}

export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen)
  const tab = useUi((s) => s.settingsTab)
  const setTab = useUi((s) => s.openSettings)
  const close = useUi((s) => s.closeSettings)

  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const resetStats = useStore((s) => s.resetStats)

  const [exported, setExported] = useState(false)

  const exportData = () => {
    const raw = localStorage.getItem('focus-deck-v1') ?? '{}'
    const blob = new Blob([raw], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pulse-${todayKey()}.json`
    a.click()
    URL.revokeObjectURL(url)
    setExported(true)
    window.setTimeout(() => setExported(false), 1600)
  }

  const wipe = () => {
    if (!window.confirm('¿Borrar tareas, estadísticas y ajustes? No se puede deshacer.'))
      return
    localStorage.removeItem('focus-deck-v1')
    window.location.reload()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Ajustes"
      description="Todo se guarda solo, en este equipo."
    >
      <div className="mb-4 inline-flex rounded-full border border-line bg-surface-2/70 p-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3 py-1.5 text-[11.5px] font-medium transition ${
              tab === t.id
                ? 'bg-surface text-fg shadow-sm'
                : 'text-faint hover:text-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'focus' && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2.5">
            <NumberField
              label="Enfoque"
              value={settings.workMin}
              onChange={(workMin) => updateSettings({ workMin })}
            />
            <NumberField
              label="Corto"
              value={settings.shortMin}
              onChange={(shortMin) => updateSettings({ shortMin })}
            />
            <NumberField
              label="Largo"
              value={settings.longMin}
              onChange={(longMin) => updateSettings({ longMin })}
            />
          </div>

          <NumberField
            label="Pomodoros antes del descanso largo"
            value={settings.cyclesBeforeLong}
            min={2}
            max={8}
            onChange={(cyclesBeforeLong) => updateSettings({ cyclesBeforeLong })}
          />

          <div className="divider" />

          <div className="space-y-1">
            <Toggle
              label="Encadenar descansos"
              description="El descanso empieza solo al terminar un pomodoro."
              checked={settings.autoStartBreaks}
              onChange={(autoStartBreaks) => updateSettings({ autoStartBreaks })}
            />
            <Toggle
              label="Encadenar enfoque"
              description="Vuelve a arrancar solo al terminar el descanso."
              checked={settings.autoStartWork}
              onChange={(autoStartWork) => updateSettings({ autoStartWork })}
            />
            <Toggle
              label="Sonido al terminar"
              description="Una campanita suave, sin sobresaltos."
              checked={settings.soundOn}
              onChange={(soundOn) => updateSettings({ soundOn })}
            />
          </div>

          <p className="text-[10.5px] leading-relaxed text-faint">
            Cambiar una duración reinicia el temporizador si estás en ese modo.
          </p>
        </div>
      )}

      {tab === 'music' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ServerCog size={14} className="text-accent" />
            <span className="text-[12px] text-muted">Cadena de reproducción</span>
          </div>
          <EnginePanel />
          <div className="divider" />
          <label className="block">
            <span className="text-[10px] font-medium tracking-[0.12em] text-faint uppercase">
              Volumen de la radio
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.lofiVolume * 100)}
              onChange={(e) =>
                updateSettings({ lofiVolume: Number(e.target.value) / 100 })
              }
              className="mt-2 w-full"
              aria-label="Volumen de la radio en ajustes"
            />
          </label>
        </div>
      )}

      {tab === 'data' && (
        <div className="space-y-3">
          <button type="button" onClick={exportData} className="btn w-full">
            {exported ? <Check size={13} /> : <Download size={13} />}
            {exported ? 'Exportado' : 'Exportar datos (JSON)'}
          </button>

          <button
            type="button"
            onClick={() => {
              if (
                window.confirm('¿Reiniciar las estadísticas? Las tareas se mantienen.')
              ) {
                resetStats()
              }
            }}
            className="btn w-full"
          >
            <Trash2 size={13} /> Reiniciar estadísticas
          </button>

          <button
            type="button"
            onClick={wipe}
            className="btn w-full border-warn/25 text-warn hover:bg-warn/10"
          >
            <Trash2 size={13} /> Borrar todo
          </button>

          <p className="pt-1 text-[10.5px] leading-relaxed text-faint">
            Tareas, sesiones y ajustes viven en el almacenamiento local de la app.
          </p>
        </div>
      )}
    </Modal>
  )
}

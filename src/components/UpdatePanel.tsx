import { useEffect, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import {
  Check,
  Download,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react'
import { useUpdater } from '../store/useUpdater'
import { isDesktop } from '../lib/desktop'

export function UpdatePanel() {
  const status = useUpdater((s) => s.status)
  const version = useUpdater((s) => s.version)
  const notes = useUpdater((s) => s.notes)
  const progress = useUpdater((s) => s.progress)
  const error = useUpdater((s) => s.error)
  const check = useUpdater((s) => s.check)
  const install = useUpdater((s) => s.install)

  const [current, setCurrent] = useState<string | null>(null)

  useEffect(() => {
    if (!isDesktop()) return
    getVersion()
      .then(setCurrent)
      .catch(() => undefined)
  }, [])

  if (!isDesktop()) {
    return (
      <p className="text-[10.5px] leading-relaxed text-faint">
        Las actualizaciones automáticas solo funcionan en la app instalada.
      </p>
    )
  }

  const checking = status === 'checking'
  const busy = status === 'downloading' || status === 'ready'

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] text-fg">Pulse {current ? `v${current}` : ''}</p>
          <p className="text-[10.5px] text-faint">
            {status === 'current'
              ? 'Estás al día.'
              : status === 'available'
                ? `La versión ${version} está lista para instalar.`
                : status === 'error'
                  ? 'No se pudo comprobar la actualización.'
                  : 'Comprueba si hay una versión nueva.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void check()}
          disabled={checking || busy}
          className="btn shrink-0 px-2.5 py-1.5 text-[11.5px]"
        >
          {checking ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          {checking ? 'Buscando…' : 'Buscar'}
        </button>
      </div>

      {status === 'available' && (
        <div className="space-y-2 rounded-xl border border-accent/30 bg-accent/[0.06] px-3 py-2.5">
          <div className="flex items-center gap-2 text-[11.5px] text-accent">
            <Download size={13} />
            <span>Pulse {version}</span>
          </div>
          {notes && (
            <p className="scroll-thin max-h-24 overflow-y-auto whitespace-pre-wrap text-[10.5px] leading-relaxed text-muted">
              {notes}
            </p>
          )}
          <button
            type="button"
            onClick={() => void install()}
            className="btn btn-accent w-full py-1.5 text-[12px]"
          >
            Instalar y reiniciar
          </button>
        </div>
      )}

      {busy && (
        <div className="space-y-1.5 rounded-xl border border-line bg-surface-2/40 px-3 py-2.5">
          <div className="flex items-center justify-between text-[10.5px] text-muted">
            <span>
              {status === 'ready' ? 'Instalado, reiniciando…' : 'Descargando…'}
            </span>
            <span className="tnum">{Math.round(progress)}%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full bg-accent transition-[width] duration-200"
              style={{ width: `${Math.max(2, progress)}%` }}
            />
          </div>
        </div>
      )}

      {status === 'error' && error && (
        <div className="flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/[0.07] px-2.5 py-2 text-[10.5px] leading-relaxed text-warn/90">
          <TriangleAlert size={12} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}

      {status === 'current' && (
        <p className="flex items-center gap-1.5 text-[10.5px] text-break/80">
          <Check size={11} /> Sin actualizaciones pendientes.
        </p>
      )}

      <p className="text-[10px] leading-relaxed text-faint">
        Las versiones se publican en GitHub y se firman con la clave del
        proyecto. La descarga se verifica antes de instalar.
      </p>
    </div>
  )
}

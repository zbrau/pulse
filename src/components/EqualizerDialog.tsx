import { useMemo } from 'react'
import { RotateCcw } from 'lucide-react'
import { Modal } from './Modal'
import { useUi } from '../store/useUi'
import { EQ_PRESETS, useAudioFx } from '../store/useAudioFx'
import { EQ_BANDS, EQ_BAND_LABELS, EQ_MAX, EQ_MIN } from '../lib/audioGraph'

const W = 320
const H = 96
const PAD_X = 12
const PAD_Y = 10

const pointFor = (index: number, gain: number) => ({
  x: PAD_X + (index / (EQ_BANDS.length - 1)) * (W - PAD_X * 2),
  y: H / 2 - (Math.max(EQ_MIN, Math.min(EQ_MAX, gain)) / EQ_MAX) * (H / 2 - PAD_Y),
})

/** Curva suave (Catmull-Rom → Bézier) que pasa por las 5 bandas. */
function curvePath(gains: number[]): string {
  const points = gains.map((gain, index) => pointFor(index, gain))
  if (points.length === 0) return ''

  let path = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x} ${p2.y}`
  }
  return path
}

export function EqualizerDialog() {
  const open = useUi((state) => state.eqOpen)
  const close = useUi((state) => state.closeEq)

  const enabled = useAudioFx((state) => state.enabled)
  const gains = useAudioFx((state) => state.gains)
  const preset = useAudioFx((state) => state.preset)
  const toggleEnabled = useAudioFx((state) => state.toggleEnabled)
  const setBand = useAudioFx((state) => state.setBand)
  const setPreset = useAudioFx((state) => state.setPreset)
  const reset = useAudioFx((state) => state.reset)

  const curve = useMemo(() => curvePath(gains), [gains])
  const area = useMemo(() => {
    const points = gains.map((gain, index) => pointFor(index, gain))
    const first = points[0]
    const last = points[points.length - 1]
    return `${curve} L ${last.x} ${H / 2} L ${first.x} ${H / 2} Z`
  }, [curve, gains])

  const presetLabel =
    preset === 'custom'
      ? 'Personalizado'
      : (EQ_PRESETS.find((item) => item.id === preset)?.label ?? 'Plano')

  return (
    <Modal
      open={open}
      onClose={close}
      title="Ecualizador"
      description="Ajusta el sonido del reproductor de YouTube Music."
      widthClass="max-w-md"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/40 px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-fg">Ecualizador de 5 bandas</p>
            <p className="mt-0.5 truncate text-[10.5px] text-faint">
              {enabled ? `Perfil: ${presetLabel}` : 'Apagado · el audio va directo'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={enabled ? 'Desactivar ecualizador' : 'Activar ecualizador'}
            onClick={toggleEnabled}
            className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
              enabled ? 'border-accent/50 bg-accent/70' : 'border-line bg-surface-3'
            }`}
          >
            <span
              className={`absolute top-0.5 size-3.5 rounded-full bg-fg shadow transition-all ${
                enabled ? 'left-[19px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        <div
          className={`rounded-xl border border-line bg-surface-2/25 p-3 transition-opacity ${
            enabled ? '' : 'opacity-40'
          }`}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-24 w-full"
            role="img"
            aria-label={`Curva del ecualizador: ${presetLabel}`}
          >
            {[EQ_MAX, EQ_MAX / 2, 0, EQ_MIN / 2, EQ_MIN].map((gain) => {
              const y = pointFor(0, gain).y
              return (
                <line
                  key={gain}
                  x1={PAD_X}
                  x2={W - PAD_X}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth={gain === 0 ? 1 : 0.6}
                  strokeDasharray={gain === 0 ? undefined : '3 4'}
                  className="text-line"
                />
              )
            })}
            <path d={area} fill="rgba(137, 169, 204, 0.10)" />
            <path
              d={curve}
              fill="none"
              stroke="#89a9cc"
              strokeWidth={1.8}
              strokeLinecap="round"
            />
            {gains.map((gain, index) => {
              const point = pointFor(index, gain)
              return (
                <circle
                  key={index}
                  cx={point.x}
                  cy={point.y}
                  r={2.6}
                  fill="#0a0b0d"
                  stroke="#89a9cc"
                  strokeWidth={1.4}
                />
              )
            })}
          </svg>
          <div className="mt-1 flex justify-between px-0.5 text-[9px] text-faint">
            {EQ_BAND_LABELS.map((label) => (
              <span key={label} className="tnum">
                {label}
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-medium tracking-[0.14em] text-faint uppercase">
            Perfiles
          </p>
          <div className="flex flex-wrap gap-1.5">
            {EQ_PRESETS.map((item) => {
              const active = preset === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPreset(item.id)}
                  aria-pressed={active}
                  className={`chip transition-colors ${
                    active
                      ? 'border-accent/40 bg-accent/15 text-accent'
                      : 'hover:border-surface-3 hover:text-fg'
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className={`space-y-2.5 ${enabled ? '' : 'opacity-45'}`}>
          {EQ_BANDS.map((frequency, index) => {
            const value = gains[index] ?? 0
            return (
              <div
                key={frequency}
                className="grid grid-cols-[52px_1fr_52px] items-center gap-2"
              >
                <span className="tnum text-[10.5px] text-faint">
                  {EQ_BAND_LABELS[index]}
                </span>
                <input
                  type="range"
                  min={EQ_MIN}
                  max={EQ_MAX}
                  step={1}
                  value={value}
                  disabled={!enabled}
                  onChange={(event) => setBand(index, Number(event.target.value))}
                  aria-label={`Banda ${EQ_BAND_LABELS[index]}`}
                  aria-valuetext={`${value > 0 ? '+' : ''}${value} decibelios`}
                  className="w-full cursor-pointer accent-accent disabled:cursor-not-allowed"
                />
                <span
                  className={`tnum text-right font-mono text-[10.5px] ${
                    value !== 0 && enabled ? 'text-accent' : 'text-faint'
                  }`}
                >
                  {value > 0 ? '+' : ''}
                  {value} dB
                </span>
              </div>
            )
          })}
        </div>

        <div className="flex items-start justify-between gap-3 border-t border-line-soft pt-3">
          <p className="text-[10px] leading-relaxed text-faint">
            Sólo afecta a YouTube Music; la radio lofi tiene su propio control de
            volumen. Los ajustes se guardan en este equipo.
          </p>
          <button
            type="button"
            onClick={reset}
            className="btn shrink-0 px-2.5 py-1.5 text-[11px]"
            title="Volver al perfil plano"
          >
            <RotateCcw size={12} /> Plano
          </button>
        </div>
      </div>
    </Modal>
  )
}

import { useTranslation } from 'react-i18next'
import type { KeyboardEvent, PointerEvent } from 'react'
import { gammaLimits, neutralLevels, type Histogram, type LevelChannel, type Levels } from '../../image/adjust.js'
import { clamp } from '../../image/pixels.js'
import { Button } from '../../ui/Button.js'
import { Segmented } from '../../ui/Segmented.js'

const channelOptions: { value: LevelChannel; label: string }[] = [
  { value: 'rgb', label: 'RGB' },
  { value: 'r', label: 'R' },
  { value: 'g', label: 'G' },
  { value: 'b', label: 'B' }
]

const histogramHeight = 64

function histogramPath(bins: Uint32Array) {
  // The outermost bins often hold clipped pixels. They must not flatten the rest of the curve.
  let peak = 1
  for (let i = 1; i < 255; i++) peak = Math.max(peak, bins[i])
  let path = 'M0 ' + histogramHeight
  for (let i = 0; i < 256; i++) {
    const y = histogramHeight - Math.min(1, bins[i] / peak) * histogramHeight
    path += ' L' + i + ' ' + y.toFixed(1) + ' L' + (i + 1) + ' ' + y.toFixed(1)
  }
  return path + ' L256 ' + histogramHeight + ' Z'
}

type Handle = {
  name: string
  tone: 'black' | 'gray' | 'white'
  /** Position on the track, 0 … 1. */
  at: number
  value: number
  text: string
  min: number
  max: number
  /** Moves the handle to a track position. */
  onMove: (at: number) => void
  /** Steps the value by the given number of arrow-key steps. */
  onStep: (steps: number) => void
  onReset: () => void
}

function Track({ label, handles, gradient }: { label: string; handles: Handle[]; gradient?: boolean }) {
  const { t } = useTranslation()
  const move = (event: PointerEvent<HTMLDivElement>, handle: Handle) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const track = event.currentTarget.parentElement!.getBoundingClientRect()
    handle.onMove(clamp((event.clientX - track.left) / track.width, 0, 1))
  }
  const step = (event: KeyboardEvent, handle: Handle) => {
    const direction = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key]
    if (!direction) return
    event.preventDefault()
    handle.onStep(direction * (event.shiftKey ? 10 : 1))
  }
  return (
    <div className={'levels-track' + (gradient ? ' gradient' : '')} role="group" aria-label={label}>
      {handles.map((handle) => (
        <div
          key={handle.name}
          className={'levels-handle ' + handle.tone}
          style={{ left: handle.at * 100 + '%' }}
          role="slider"
          tabIndex={0}
          aria-label={handle.name}
          aria-valuemin={handle.min}
          aria-valuemax={handle.max}
          aria-valuenow={handle.value}
          aria-valuetext={handle.text}
          title={handle.name + ' · ' + t('Doppelklick setzt zurück')}
          onPointerDown={(event) => {
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            event.currentTarget.focus()
          }}
          onPointerMove={(event) => move(event, handle)}
          onKeyDown={(event) => step(event, handle)}
          onDoubleClick={handle.onReset}
        />
      ))}
    </div>
  )
}

type Props = {
  channel: LevelChannel
  levels: Levels
  counts?: Histogram
  onChannel: (channel: LevelChannel) => void
  onChange: (levels: Levels) => void
  onAuto: () => void
}

/** Histogram with input and output levels for one channel. */
export function LevelsEditor({ channel, levels, counts, onChannel, onChange, onAuto }: Props) {
  const { t } = useTranslation()
  const { inBlack, inWhite, gamma, outBlack, outWhite } = levels
  const set = (next: Partial<Levels>) => onChange({ ...levels, ...next })
  const span = inWhite - inBlack
  // The midtone handle sits where the curve reaches half brightness.
  const middle = (inBlack + span * 0.5 ** gamma) / 255
  const gammaAt = (at: number) => {
    const share = clamp((at * 255 - inBlack) / span, 0.01, 0.99)
    return Math.round(clamp(Math.log(share) / Math.log(0.5), gammaLimits.min, gammaLimits.max) * 100) / 100
  }
  const setGamma = (value: number) =>
    set({ gamma: clamp(Math.round(value * 100) / 100, gammaLimits.min, gammaLimits.max) })
  const point = (value: number, min: number, max: number) => clamp(Math.round(value), min, max)

  const input: Handle[] = [
    {
      name: t('Schwarzpunkt'),
      tone: 'black',
      at: inBlack / 255,
      value: inBlack,
      text: String(inBlack),
      min: 0,
      max: inWhite - 2,
      onMove: (at) => set({ inBlack: point(at * 255, 0, inWhite - 2) }),
      onStep: (steps) => set({ inBlack: point(inBlack + steps, 0, inWhite - 2) }),
      onReset: () => set({ inBlack: neutralLevels.inBlack })
    },
    {
      name: t('Mittelton'),
      tone: 'gray',
      at: middle,
      value: gamma,
      text: gamma.toFixed(2),
      min: gammaLimits.min,
      max: gammaLimits.max,
      onMove: (at) => set({ gamma: gammaAt(at) }),
      // To the right darkens, as the curve bends down.
      onStep: (steps) => setGamma(gamma - steps * 0.01),
      onReset: () => set({ gamma: neutralLevels.gamma })
    },
    {
      name: t('Weißpunkt'),
      tone: 'white',
      at: inWhite / 255,
      value: inWhite,
      text: String(inWhite),
      min: inBlack + 2,
      max: 255,
      onMove: (at) => set({ inWhite: point(at * 255, inBlack + 2, 255) }),
      onStep: (steps) => set({ inWhite: point(inWhite + steps, inBlack + 2, 255) }),
      onReset: () => set({ inWhite: neutralLevels.inWhite })
    }
  ]
  const output: Handle[] = [
    {
      name: t('Ausgabe Schwarz'),
      tone: 'black',
      at: outBlack / 255,
      value: outBlack,
      text: String(outBlack),
      min: 0,
      max: 255,
      onMove: (at) => set({ outBlack: point(at * 255, 0, 255) }),
      onStep: (steps) => set({ outBlack: point(outBlack + steps, 0, 255) }),
      onReset: () => set({ outBlack: neutralLevels.outBlack })
    },
    {
      name: t('Ausgabe Weiß'),
      tone: 'white',
      at: outWhite / 255,
      value: outWhite,
      text: String(outWhite),
      min: 0,
      max: 255,
      onMove: (at) => set({ outWhite: point(at * 255, 0, 255) }),
      onStep: (steps) => set({ outWhite: point(outWhite + steps, 0, 255) }),
      onReset: () => set({ outWhite: neutralLevels.outWhite })
    }
  ]

  return (
    <div className="levels">
      <div className="levels-head">
        <Segmented value={channel} options={channelOptions} onChange={onChannel} />
        <Button className="secondary compact" title={t('Tonwerte automatisch setzen')} onClick={onAuto}>
          {t('Auto')}
        </Button>
      </div>
      <svg
        className={'levels-histogram ' + channel}
        viewBox={'0 0 256 ' + histogramHeight}
        preserveAspectRatio="none"
        role="img"
        aria-label={t('Histogramm')}
      >
        {counts && <path d={histogramPath(counts[channel])} />}
      </svg>
      <Track label={t('Tonwertspreizung')} handles={input} />
      <div className="levels-values" aria-hidden="true">
        <span>{inBlack}</span>
        <span>{gamma.toFixed(2)}</span>
        <span>{inWhite}</span>
      </div>
      <Track label={t('Tonwertumfang')} handles={output} gradient />
      <div className="levels-values" aria-hidden="true">
        <span>{outBlack}</span>
        <span>{outWhite}</span>
      </div>
    </div>
  )
}

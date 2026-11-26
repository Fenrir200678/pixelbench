import { useMemo, useState } from 'react'
import type { Hires } from '../editor/generation.js'
import { initialScale, scaledSize, type Scale } from '../editor/upscale.js'
import { readStorage, writeStorage } from '../helpers/storage.js'
import type { Parameters, Profile, Status } from '../types/api.js'
import type { Notice, Tool } from '../types/editor.js'

type UpscaleSettings = { upscaler?: string; scale: Scale }
type HiresSettings = UpscaleSettings & {
  on: boolean
  strength: number
  steps: number
  tiled: boolean
  colorMatch: number
  // Empty sampler and scheduler settings keep the original render values.
  sampler: string
  scheduler: string
}
export type SessionUpscale = { upscale: UpscaleSettings; hires: HiresSettings }

export const hiresSamplingKeys = ['sampler', 'scheduler'] as const
const upscaleKey = 'pixelbench-upscale-v2'
const hiresKey = 'pixelbench-hires-v1'
const initialUpscale: UpscaleSettings = { scale: initialScale }
const initialHires: HiresSettings = {
  on: false,
  scale: initialScale,
  strength: 0.35,
  steps: 0,
  tiled: false,
  colorMatch: 0,
  sampler: '',
  scheduler: ''
}

export function useUpscaleSettings(
  tool: Tool,
  profile: Profile | undefined,
  status: Status | undefined,
  notice: Notice
) {
  const [upscale, setUpscale] = useState(() => ({
    ...initialUpscale,
    ...readStorage<Partial<UpscaleSettings>>(upscaleKey, {})
  }))
  const [hires, setHires] = useState(() => ({ ...initialHires, ...readStorage<Partial<HiresSettings>>(hiresKey, {}) }))
  const sessionUpscale = useMemo(() => ({ upscale, hires }), [upscale, hires])
  const upscalers = status?.upscalers ?? []
  const preferred = upscalers.find((file) => /ultrasharp/i.test(file)) ?? upscalers[0] ?? 'lanczos'
  const resolveUpscaler = (choice?: string) =>
    choice && (choice === 'lanczos' || upscalers.includes(choice)) ? choice : preferred
  const hiresUpscaler = resolveUpscaler(hires.upscaler)
  const hiresReady = status?.tiledUpscale !== false
  const colorMatchAvailable = Boolean(status?.colorMatch)
  const hiresAvailable = tool === 'create' && Boolean(profile?.img2img && profile.tools.includes('upscale'))
  const hiresActive = hiresAvailable && hires.on
  const hiresTiled = hiresActive && hires.tiled

  return {
    sessionUpscale,
    restoreUpscale(next: SessionUpscale) {
      setUpscale(next.upscale)
      setHires(next.hires)
    },
    upscale: { ...upscale, upscaler: resolveUpscaler(upscale.upscaler) },
    upscalers,
    hires: { ...hires, upscaler: hiresUpscaler },
    hiresAvailable,
    hiresActive,
    hiresTiled,
    hiresRunnable: !hiresTiled || hiresReady,
    hiresReady,
    colorMatchAvailable,
    // Regular and quick hires runs use the same upscaler, size rules and tiling capability.
    hiresFor(source: [number, number]): Hires | undefined {
      if (hires.tiled && !hiresReady) return undefined
      return {
        upscaler: hiresUpscaler,
        strength: hires.strength,
        steps: hires.steps,
        size: scaledSize(source, hires.scale),
        tiled: hires.tiled,
        colorMatch: colorMatchAvailable ? Number(hires.colorMatch) || 0 : 0
      }
    },
    hiresParameters(item: Profile, base: Parameters): Parameters {
      const next = { ...base }
      for (const key of hiresSamplingKeys) {
        const value = hires[key]
        if (value && item.parameters[key] && item.choices[key]?.includes(value)) next[key] = value
      }
      return next
    },
    updateUpscale(patch: Partial<UpscaleSettings>) {
      const next = { ...upscale, ...patch }
      setUpscale(next)
      if (!writeStorage(upscaleKey, next)) notice('Einstellungen konnten in diesem Browser nicht gespeichert werden.')
    },
    updateHires(patch: Partial<HiresSettings>) {
      const next = { ...hires, ...patch }
      setHires(next)
      if (!writeStorage(hiresKey, next)) notice('Einstellungen konnten in diesem Browser nicht gespeichert werden.')
    }
  }
}

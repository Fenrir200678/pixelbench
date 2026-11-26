import { useState } from 'react'
import {
  detailerOverrides,
  detectorTarget,
  initialDetailer,
  type DetailerSettings,
  type Detector
} from '../editor/detailer.js'
import { readStorage, writeStorage } from '../helpers/storage.js'
import type { Parameters, Profile, Status } from '../types/api.js'
import type { Notice, Tool } from '../types/editor.js'

const detailerKey = 'pixelbench-detailer-v1'

// Detailer settings in Erstellen. It re-renders with the profile's image to image, so it needs img2img.
export function useDetailer(tool: Tool, status: Status | undefined, profile: Profile | undefined, notice: Notice) {
  const [settings, setSettings] = useState<DetailerSettings>(() => ({
    ...initialDetailer,
    ...readStorage<Partial<DetailerSettings>>(detailerKey, {})
  }))
  const yoloModels = status?.yolo ?? []
  const checkpoint = status?.detectors?.[0]
  const model = yoloModels.find(({ name }) => name === settings.model) ?? yoloModels[0]
  // The chosen method only. Without its model the detailer stays off instead of switching methods silently.
  const detector: Detector | undefined =
    settings.method === 'sam3'
      ? checkpoint
        ? { kind: 'sam3', checkpoint }
        : undefined
      : model
        ? { kind: 'yolo', model: model.name, labels: model.labels }
        : undefined
  const upscalers = status?.upscalers ?? []
  // Without a chosen model the browser scales the crop: softer than a sharpening upscale model.
  const choice = upscalers.includes(settings.upscaler) ? settings.upscaler : 'lanczos'
  const upscaler = choice === 'lanczos' ? undefined : choice
  const available = tool === 'create' && Boolean(profile?.img2img)
  return {
    settings,
    detector,
    yoloModels,
    // What the detailer looks for, such as "face".
    target: detectorTarget(settings, detector),
    upscalers,
    // The combobox value, 'lanczos' without a model. upscaler: the model sent with the jobs.
    upscalerChoice: choice,
    upscaler,
    available,
    active: available && settings.on && Boolean(detector),
    // The render parameters with the detailer's own sampling on top.
    parametersFor(item: Profile, parameters: Parameters): Parameters {
      return { ...parameters, ...detailerOverrides(settings, item) }
    },
    update(patch: Partial<DetailerSettings>) {
      const next = { ...settings, ...patch }
      setSettings(next)
      if (!writeStorage(detailerKey, next)) notice('Einstellungen konnten in diesem Browser nicht gespeichert werden.')
    }
  }
}

export type Detailer = ReturnType<typeof useDetailer>

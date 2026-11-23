import { useState } from 'react'
import { initialDetailer, type DetailerSettings } from '../editor/detailer.js'
import { readStorage, writeStorage } from '../helpers/storage.js'
import type { Profile, Status } from '../types/api.js'
import type { Notice, Tool } from '../types/editor.js'

const detailerKey = 'pixelbench-detailer-v1'

// Detailer settings in Erstellen. It re-renders with the profile's image to image, so it needs img2img.
export function useDetailer(tool: Tool, status: Status | undefined, profile: Profile | undefined, notice: Notice) {
  const [settings, setSettings] = useState<DetailerSettings>(() => ({
    ...initialDetailer,
    ...readStorage<Partial<DetailerSettings>>(detailerKey, {})
  }))
  const detector = status?.detectors?.[0]
  const available = tool === 'create' && Boolean(profile?.img2img)
  return {
    settings,
    detector,
    available,
    active: available && settings.on && Boolean(detector),
    update(patch: Partial<DetailerSettings>) {
      const next = { ...settings, ...patch }
      setSettings(next)
      if (!writeStorage(detailerKey, next)) notice('Einstellungen konnten in diesem Browser nicht gespeichert werden.')
    }
  }
}

export type Detailer = ReturnType<typeof useDetailer>

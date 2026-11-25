import { useState } from 'react'
import { modelKey } from '../editor/models.js'
import { readStorage, writeStorage } from '../helpers/storage.js'
import type { Status } from '../types/api.js'
import type { Notice } from '../types/editor.js'

const storageKey = 'pixelbench-background-v1'
export const backgroundProfileId = 'remove-background'
// model: the chosen loader file. keepMask: the transparent area becomes the Inpaint mask when the variant is applied.
type Settings = { model: string; keepMask: boolean }

/** Background removal in Extras: the BiRefNet profile, the chosen file from its loader and the mask option. */
export function useBackgroundRemoval(status: Status | undefined, notice: Notice) {
  const [settings, setSettings] = useState<Settings>(() => ({
    model: '',
    keepMask: true,
    ...readStorage<Partial<Settings>>(storageKey, {})
  }))
  const profile = status?.profiles.find((item) => item.id === backgroundProfileId)
  const slot = profile?.models[0]
  const key = slot ? modelKey(slot) : ''
  const files = profile?.catalog[key] ?? []
  // Any file in the loader works. The recommended file comes first when nothing was chosen.
  const model = files.includes(settings.model) ? settings.model : (profile?.selected[key] ?? files[0])

  function update(patch: Partial<Settings>) {
    const next = { ...settings, ...patch }
    setSettings(next)
    if (!writeStorage(storageKey, next)) notice('Einstellungen konnten in diesem Browser nicht gespeichert werden.')
  }

  return {
    profile,
    files,
    model,
    models: model ? { [key]: model } : {},
    keepMask: settings.keepMask,
    // Missing nodes mean a ComfyUI without the core background removal nodes.
    blocked: Boolean(profile?.blockers.length),
    ready: Boolean(profile?.ready && model),
    setModel: (file: string) => update({ model: file }),
    setKeepMask: (keepMask: boolean) => update({ keepMask })
  }
}

export type BackgroundRemoval = ReturnType<typeof useBackgroundRemoval> & { canRun: boolean; run: () => void }

import i18n from '../i18n/index.js'
import { appMessage } from '../i18n/appMessages.js'
import type { ModelChoices, ModelSlot, Profile } from '../types/api.js'

export type SavedModels = Record<string, ModelChoices>
export const modelKey = (slot: ModelSlot) => slot.node + '.' + slot.input
export const isMainModel = (slot: ModelSlot) => slot.category === 'diffusion_models' || slot.category === 'checkpoints'

export function selectModels(profile: Profile, saved: SavedModels): ModelChoices {
  return Object.fromEntries(
    profile.models.flatMap((slot) => {
      const key = modelKey(slot)
      const file = saved[profile.id]?.[key] ?? profile.selected[key]
      return typeof file === 'string' ? [[key, file]] : []
    })
  )
}

export function modelProblems(profile: Profile, selected: ModelChoices) {
  return profile.models.flatMap((slot) => {
    const key = modelKey(slot)
    const file = selected[key]
    if (file && profile.catalog[key]?.includes(file)) return []
    const model = i18n.t(slot.label)
    const missing = profile.modelMissing[key]
    return [
      file
        ? i18n.t('{{model}} · ausgewählte Datei fehlt ({{file}}).', { model, file })
        : missing
          ? appMessage(missing)
          : i18n.t('Bitte {{model}} auswählen.', { model })
    ]
  })
}

export function profileReady(profile: Profile, choices: ModelChoices) {
  return profile.ready && modelProblems(profile, choices).length === 0
}

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

/** A model slot with no file anywhere in the search path. Rendered as a card instead of a sentence. */
export type MissingModel = { model: string; files: string[]; paths: string[]; note?: string }
export type Problem = string | MissingModel

const searchPathNote = /^\w+ in this instance’s search configuration$/

/** Splits the server's "Search path" text into folders. Remote instances report a note instead of folders. */
function parseSearchPath(raw: string): Pick<MissingModel, 'paths' | 'note'> {
  const path = raw.match(/Search path: ([\s\S]*)$/)?.[1] ?? ''
  if (searchPathNote.test(path)) return { paths: [], note: appMessage(path) }
  return { paths: path.split(' · ').filter(Boolean) }
}

export function modelProblems(profile: Profile, selected: ModelChoices): Problem[] {
  return profile.models.flatMap((slot): Problem[] => {
    const key = modelKey(slot)
    const file = selected[key]
    if (file && profile.catalog[key]?.includes(file)) return []
    const model = i18n.t(slot.label)
    const missing = profile.modelMissing[key]
    if (file) return [i18n.t('{{model}} · ausgewählte Datei fehlt ({{file}}).', { model, file })]
    if (missing) return [{ model, files: slot.files, ...parseSearchPath(missing) }]
    return [i18n.t('Bitte {{model}} auswählen.', { model })]
  })
}

export function profileReady(profile: Profile, choices: ModelChoices) {
  return profile.ready && modelProblems(profile, choices).length === 0
}

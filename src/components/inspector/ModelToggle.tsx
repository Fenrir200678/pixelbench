import { useTranslation } from 'react-i18next'
import { modelKey } from '../../editor/models.js'
import type { Workflow } from '../../hooks/useWorkflow.js'
import type { ModelSlot, Profile } from '../../types/api.js'
import { CollapsibleSection } from '../../ui/CollapsibleSection.js'
import { Icon } from '../../ui/Icon.js'
import { Segmented } from '../../ui/Segmented.js'
import { ParameterRow } from './RenderFields.js'

const basename = (file: string) => file.split(/[\\/]/).at(-1)?.toLowerCase() ?? ''

// The first file for an option, in the profile's recommended order, then any other loader file with the prefix.
function fileFor(profile: Profile, slot: ModelSlot, prefix: string) {
  const key = modelKey(slot)
  const files = [...(profile.candidates[key] ?? []), ...(profile.catalog[key] ?? [])]
  return files.find((file) => basename(file).startsWith(prefix.toLowerCase()))
}

/** One section per switchable fixed loader, such as an edit LoRA, with its variant switch and its own parameters. */
export function ModelToggleSections({ workflow }: { workflow: Workflow }) {
  const { profile } = workflow
  if (!profile) return null
  return profile.models
    .filter((slot) => slot.toggle?.length)
    .map((slot) => <ModelToggleSection key={modelKey(slot)} slot={slot} profile={profile} workflow={workflow} />)
}

function ModelToggleSection({ slot, profile, workflow }: { slot: ModelSlot; profile: Profile; workflow: Workflow }) {
  const { t } = useTranslation()
  const key = modelKey(slot)
  const options = slot.toggle ?? []
  const current = basename(workflow.choices[key] ?? '')
  const active = options.find((option) => current.startsWith(option.prefix.toLowerCase()))
  const parameters = Object.entries(profile.parameters).filter(([, field]) => field.section === slot.node)
  const id = 'toggle-' + key.replace(/\W/g, '-')
  return (
    <CollapsibleSection id={id} title={t(slot.title ?? slot.label)} summary={active ? t(active.label) : undefined}>
      <div className="stack" title={slot.hint ? t(slot.hint) : undefined}>
        <span className="label-row">
          <span id={id + '-label'}>{t(slot.label)}</span>
          {slot.docs && (
            <a className="doc-link" href={slot.docs} target="_blank" rel="noopener noreferrer">
              <Icon name="docs" />
              {t('Dokumentation')}
            </a>
          )}
        </span>
        <Segmented
          labelledBy={id + '-label'}
          value={active?.prefix ?? ''}
          options={options.map((option) => {
            const file = fileFor(profile, slot, option.prefix)
            return {
              value: option.prefix,
              label: t(option.label),
              title: file ? t(option.hint ?? option.label) + ' · ' + file : t('Keine Datei gefunden')
            }
          })}
          onChange={(prefix) => {
            const file = fileFor(profile, slot, prefix)
            if (file) workflow.chooseModel(key, file)
          }}
        />
      </div>
      {parameters.map(([name, field]) => (
        <ParameterRow key={name} workflow={workflow} name={name} label={field.label} />
      ))}
    </CollapsibleSection>
  )
}

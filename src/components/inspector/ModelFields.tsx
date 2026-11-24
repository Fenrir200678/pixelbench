import { useTranslation } from 'react-i18next'
import { isMainModel, modelKey, type MissingModel, type Problem } from '../../editor/models.js'
import { Combobox } from '../../ui/Combobox.js'
import type { Workflow } from '../../hooks/useWorkflow.js'
import { appMessage } from '../../i18n/appMessages.js'
import type { ModelSlot, Profile, Status } from '../../types/api.js'

/** Why the current profile cannot run yet. The profile picker itself lives in the top bar. */
export function ProfileNote({ workflow, status }: { workflow: Workflow; status?: Status }) {
  const { profile, problems } = workflow
  const warnings: Problem[] = profile ? [...profile.blockers.map((blocker) => appMessage(blocker)), ...problems] : []
  const statusText =
    status && (status.mode === 'external' || status.state === 'error') ? appMessage(status.message) : ''
  const items = statusText ? [statusText] : status?.state === 'ready' ? warnings : []
  return (
    <div id="profile-note" className="field-note warn profile-note" hidden={!items.length}>
      {items.map((item, index) =>
        typeof item === 'string' ? <p key={index}>{item}</p> : <MissingModelNote key={index} {...item} />
      )}
    </div>
  )
}

function MissingModelNote({ model, files, paths, note }: MissingModel) {
  const { t } = useTranslation()
  return (
    <div className="model-missing">
      <p className="model-missing-title">{t('{{model}} fehlt', { model })}</p>
      <ul className="model-missing-files" aria-label={t('Erwartete Dateien')}>
        {files.map((file) => (
          <li key={file}>{file}</li>
        ))}
      </ul>
      {(paths.length > 0 || note) && (
        <details className="model-missing-paths">
          <summary>{t('Suchpfad')}</summary>
          {note ? <p>{note}</p> : paths.map((path) => <code key={path}>{path}</code>)}
        </details>
      )}
    </div>
  )
}

export function ModelFields({ workflow, main }: { workflow: Workflow; main?: boolean }) {
  const { t } = useTranslation()
  const { profile, choices, chooseModel } = workflow
  if (!profile) return null
  const slots = profile.models.filter((slot) => isMainModel(slot) === Boolean(main))
  if (!slots.length) return null
  const alternate = slots.some((slot) => {
    const key = modelKey(slot)
    const file = choices[key]
    return file && profile.catalog[key]?.includes(file) && !profile.candidates[key]?.includes(file)
  })
  return (
    <>
      {slots.map((slot) => {
        const key = modelKey(slot)
        return (
          <ModelField
            key={key}
            slot={slot}
            profile={profile}
            value={choices[key]}
            hideLabel={Boolean(main && slots.length === 1)}
            onChange={(file) => chooseModel(key, file)}
          />
        )
      })}
      {alternate && (
        <p className="field-note">{t('Für weitere Loader-Dateien muss die Modellfamilie zum Workflow passen.')}</p>
      )}
    </>
  )
}

function ModelField({
  slot,
  profile,
  value,
  hideLabel,
  onChange
}: {
  slot: ModelSlot
  profile: Profile
  value?: string
  hideLabel: boolean
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const key = modelKey(slot)
  const recommended = profile.candidates[key] ?? []
  const catalog = profile.catalog[key] ?? []
  const selected = value && catalog.includes(value) ? value : ''
  const other = catalog.filter((file) => !recommended.includes(file))
  return (
    <label className="stack">
      <span className={hideLabel ? 'sr-only' : undefined}>{t(slot.label)}</span>
      <Combobox
        data-model={key}
        value={selected}
        title={selected}
        disabled={!catalog.length}
        placeholder={
          value && !selected
            ? value + t(' · fehlt')
            : catalog.length
              ? t('Datei auswählen …')
              : t('Keine Datei gefunden')
        }
        options={[
          ...recommended.map((file) => ({ value: file, group: t('Empfohlen') })),
          ...other.map((file) => ({ value: file, group: t('Weitere Loader-Dateien') }))
        ]}
        onChange={onChange}
      />
    </label>
  )
}

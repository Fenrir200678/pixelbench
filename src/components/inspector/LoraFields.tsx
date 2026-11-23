import { useTranslation } from 'react-i18next'
import type { LoraEntry, Workflow } from '../../hooks/useWorkflow.js'
import type { LoraFile } from '../../types/api.js'
import { Button } from '../../ui/Button.js'
import { Combobox } from '../../ui/Combobox.js'
import { NumberField } from '../../ui/NumberField.js'

// LoRAs whose header names the profile's family come first. Files without a known family stay selectable.
function grouped(files: LoraFile[], family?: string) {
  const matching = files.filter((file) => family && file.family === family)
  const other = files.filter((file) => !matching.includes(file))
  return { matching, other }
}

export function LoraFields({ workflow }: { workflow: Workflow }) {
  const { t } = useTranslation()
  const { profile, loras, loraFiles } = workflow
  if (!profile?.lora) return null
  const family = profile.lora.family
  const { matching, other } = grouped(loraFiles, family)
  const unused = [...matching, ...other].find((file) => !loras.some((entry) => entry.name === file.file))
  return (
    <div id="lora-settings" className="lora-fields">
      <h3 className="field-label">{t('LoRAs')}</h3>
      {loras.map((entry, index) => (
        <LoraRow key={entry.id} entry={entry} index={index} workflow={workflow} matching={matching} other={other} />
      ))}
      {workflow.loraVramRisk && (
        <p className="field-note warn">
          {t(
            'Im Speichermodus „VRAM bevorzugen“ legt ComfyUI für LoRAs eine Kopie der Modellgewichte zusätzlich im VRAM ab. Große Modelle laufen dann sehr langsam. Für LoRAs in den Einstellungen „Ausgewogen“ wählen.'
          )}
        </p>
      )}
      {loraFiles.length ? (
        <Button
          id="add-lora"
          className="quiet compact"
          icon="plus"
          disabled={!unused || loras.length >= 8}
          onClick={() => unused && workflow.addLora(unused.file)}
        >
          {t('LoRA hinzufügen')}
        </Button>
      ) : (
        <p className="field-note">
          {t('Keine LoRA-Dateien gefunden. Sie gehören unter „loras“ oder „Lora“ in einen Modell-Stammordner.')}
        </p>
      )}
    </div>
  )
}

function LoraRow({
  entry,
  index,
  workflow,
  matching,
  other
}: {
  entry: LoraEntry
  index: number
  workflow: Workflow
  matching: LoraFile[]
  other: LoraFile[]
}) {
  const { t } = useTranslation()
  const known = [...matching, ...other].find((file) => file.file === entry.name)
  const family = workflow.profile?.lora?.family
  const mismatch = known?.family && family && known.family !== family
  // The workflow's own LoRA loaders, such as an edit LoRA. Adding the same file here applies it twice.
  const builtIn = workflow.profile?.models.some(
    (slot) => slot.category === 'loras' && workflow.choices[slot.node + '.' + slot.input] === entry.name
  )
  const option = (file: LoraFile, group: string) => ({
    value: file.file,
    group,
    label:
      file.file + (!file.family ? ' · ' + t('Familie unbekannt') : file.family !== family ? ' · ' + file.family : '')
  })
  return (
    <div className="lora-row" data-disabled={!entry.enabled || undefined}>
      <div className="lora-head">
        <input
          type="checkbox"
          aria-label={t('LoRA {{index}} verwenden', { index: index + 1 })}
          checked={entry.enabled}
          onChange={(event) => workflow.updateLora(entry.id, { enabled: event.currentTarget.checked })}
        />
        <Combobox
          aria-label={t('LoRA {{index}}', { index: index + 1 })}
          value={entry.name}
          options={[
            ...(known ? [] : [{ value: entry.name, label: entry.name + ' · ' + t('fehlt') }]),
            ...matching.map((file) => option(file, t('Passend zum Profil'))),
            ...other.map((file) => option(file, t('Weitere')))
          ]}
          onChange={(name) => workflow.updateLora(entry.id, { name })}
        />
        <Button
          className="icon"
          icon="close"
          aria-label={t('LoRA entfernen')}
          title={t('LoRA entfernen')}
          onClick={() => workflow.removeLora(entry.id)}
        />
      </div>
      <NumberField
        id={'lora-strength-' + entry.id}
        label={t('Stärke')}
        value={entry.strength}
        min={-2}
        max={2}
        step={0.05}
        row
        slider
        disabled={!entry.enabled}
        onChange={(strength) => workflow.updateLora(entry.id, { strength })}
      />
      {builtIn && entry.enabled && (
        <p className="field-note warn">
          {t('Der Workflow lädt dieses LoRA bereits. Hier hinzugefügt wirkt es doppelt.')}
        </p>
      )}
      {mismatch && (
        <p className="field-note warn">{t('Laut Datei für {{family}} trainiert.', { family: known.family })}</p>
      )}
      {known?.trigger && (
        <p className="field-note">
          {t('Trigger')}: <code>{known.trigger}</code>
        </p>
      )}
    </div>
  )
}

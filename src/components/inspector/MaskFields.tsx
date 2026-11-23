import { useTranslation } from 'react-i18next'
import type { Workflow } from '../../hooks/useWorkflow.js'
import { NumberField } from '../../ui/NumberField.js'
import { CollapsibleSection } from '../../ui/CollapsibleSection.js'

export function MaskFields({
  workflow,
  opacity,
  onOpacity
}: {
  workflow: Workflow
  opacity: number
  onOpacity: (value: number) => void
}) {
  const { t } = useTranslation()
  const { auto, context, feather } = workflow.prefs
  const summary = [
    auto && !workflow.manualCrop && t('Kontext {{value}} px', { value: context }),
    t('Kante {{value}} px', { value: feather })
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <CollapsibleSection id="mask-settings" title={t('Maske')} summary={summary}>
      <NumberField
        id="context"
        label={t('Ausschnitt-Kontext')}
        value={workflow.prefs.context}
        disabled={!auto || workflow.manualCrop}
        title={t('Zusätzliche Umgebung um die Maske, die das Modell als Kontext erhält.')}
        row
        suffix="px"
        slider
        min={0}
        max={2048}
        onChange={(context) => workflow.updatePrefs({ context })}
      />
      {(!auto || workflow.manualCrop) && (
        <p className="field-note">
          {auto
            ? t('Wähle unter „Größe“ den automatischen Ausschnitt, um Kontextpixel hinzuzufügen.')
            : t('Aktiviere „Auto“ unter „Renderauflösung“ für den automatischen Maskenausschnitt.')}
        </p>
      )}
      <NumberField
        id="feather"
        label={t('Weiche Maskenkante')}
        value={workflow.prefs.feather}
        title={t('Weicher Übergang innerhalb des Pinselbereichs.')}
        row
        suffix="px"
        slider
        min={0}
        max={256}
        onChange={(feather) => workflow.updatePrefs({ feather })}
      />
      <label className="field-row">
        <span>{t('Deckkraft der Anzeige')}</span>
        <input
          id="opacity"
          type="range"
          min={0}
          max={100}
          value={opacity}
          onChange={(event) => onOpacity(event.currentTarget.valueAsNumber)}
        />
        <output id="opacity-value" aria-hidden="true">
          {opacity} %
        </output>
      </label>
    </CollapsibleSection>
  )
}

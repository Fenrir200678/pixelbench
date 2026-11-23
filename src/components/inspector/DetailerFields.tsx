import { useTranslation } from 'react-i18next'
import type { Detailer } from '../../hooks/useDetailer.js'
import { Button } from '../../ui/Button.js'
import { Icon } from '../../ui/Icon.js'
import { CollapsibleSection } from '../../ui/CollapsibleSection.js'
import { NumberField } from '../../ui/NumberField.js'

// ComfyUI's SAM3 guide: short noun phrases, commas between object types, ":N" per type.
const termsGuide = 'https://docs.comfy.org/tutorials/utility/video-segment-sam3'

// Detailer in Erstellen: finds objects such as faces with SAM3 and re-renders each one in a crop, like ADetailer.
export function DetailerFields({
  detailer,
  canApply,
  onApply
}: {
  detailer: Detailer
  canApply: boolean
  onApply: () => void
}) {
  const { t } = useTranslation()
  const { settings, update, detector } = detailer
  const on = settings.on
  const title = t('Detailer') + (on && settings.terms.trim() ? ' · ' + settings.terms.trim() : '')
  return (
    <CollapsibleSection id="detailer-settings" title={title} summary={on ? undefined : t('Aus')} defaultOpen={false}>
      <label className="check">
        <input
          id="use-detailer"
          type="checkbox"
          checked={on}
          disabled={!detector}
          onChange={(event) => update({ on: event.currentTarget.checked })}
        />{' '}
        {t('Beim Generieren anwenden')}
      </label>
      <div className="stack">
        <span className="label-row">
          <label htmlFor="detailer-terms">{t('Objekt-Prompt')}</label>
          <a className="doc-link" href={termsGuide} target="_blank" rel="noopener noreferrer">
            <Icon name="docs" />
            {t('SAM-Dokumentation')}
          </a>
        </span>
        <input
          id="detailer-terms"
          type="text"
          maxLength={200}
          placeholder="face, hand"
          title={t(
            'Kurze englische Beschreibung der Objekte, z. B. person, car, cat. Mit Komma mehrere, „face:2“ begrenzt die Treffer.'
          )}
          value={settings.terms}
          onChange={(event) => update({ terms: event.currentTarget.value })}
        />
      </div>
      <NumberField
        id="detailer-limit"
        label={t('Max. Treffer')}
        title={t('Höchstens so viele Objekte je Begriff')}
        value={settings.limit}
        min={1}
        max={8}
        row
        slider
        onChange={(limit) => update({ limit })}
      />
      <NumberField
        id="detailer-threshold"
        label={t('Erkennungsschwelle')}
        title={t('Niedriger findet mehr, auch Fehltreffer.')}
        value={settings.threshold}
        min={0.05}
        max={0.95}
        step={0.05}
        row
        slider
        onChange={(threshold) => update({ threshold })}
      />
      <NumberField
        id="detailer-strength"
        label={t('Stärke')}
        title={t('Stärke, mit der jedes Objekt neu gerendert wird.')}
        value={settings.strength}
        min={0.05}
        max={1}
        step={0.05}
        row
        slider
        onChange={(strength) => update({ strength })}
      />
      <label
        className="stack"
        title={t('Eigener Prompt für die Objekte, z. B. „detailed face, sharp eyes“. Leer verwendet den Hauptprompt.')}
      >
        <span>{t('Detailer-Prompt')}</span>
        <textarea
          id="detailer-prompt"
          rows={2}
          maxLength={16000}
          placeholder={t('Leer: Hauptprompt')}
          value={settings.prompt}
          onChange={(event) => update({ prompt: event.currentTarget.value })}
        />
      </label>
      <NumberField
        id="detailer-padding"
        label={t('Rand')}
        title={t('Bildkontext um jedes Objekt in Pixeln')}
        value={settings.padding}
        min={0}
        max={256}
        step={8}
        row
        slider
        suffix="px"
        onChange={(padding) => update({ padding })}
      />
      <NumberField
        id="detailer-grow"
        label={t('Maske erweitern')}
        title={t(
          'Vergrößert die erkannte Maske nach außen, damit Ränder wie Haaransatz und Kinn mit neu gerendert werden.'
        )}
        value={settings.grow}
        min={0}
        max={64}
        row
        slider
        suffix="px"
        onChange={(grow) => update({ grow })}
      />
      <NumberField
        id="detailer-feather"
        label={t('Übergang')}
        title={t('Breite des weichen Rands, mit dem jedes Objekt ins Bild zurückgeblendet wird.')}
        value={settings.feather}
        min={0}
        max={64}
        row
        slider
        suffix="px"
        onChange={(feather) => update({ feather })}
      />
      <p className="field-note">
        {detector
          ? t('Rendert jedes Objekt einzeln mit Modell, LoRAs und Seed des Renders. Um 0,4 bleibt das Gesicht ähnlich.')
          : t(
              'Der Detailer braucht ComfyUI mit SAM3 und das Modell „sam3.1_multiplex_fp16.safetensors“ unter „checkpoints“.'
            )}
      </p>
      <label
        className="check detailer-boxes"
        title={t(
          'Während der Erkennung sind die Rahmen immer zu sehen. Danach blendet diese Option sie auf der Detailer-Variante ein.'
        )}
      >
        <input
          id="detailer-boxes"
          type="checkbox"
          checked={settings.keepBoxes}
          onChange={(event) => update({ keepBoxes: event.currentTarget.checked })}
        />{' '}
        {t('Treffer im Bild anzeigen')}
      </label>
      <label
        className="check detailer-masks"
        title={t(
          'Beim Übernehmen der Detailer-Variante werden die erkannten Masken zur Maske für „Ersetzen“. Dort lassen sie sich nachmalen oder radieren.'
        )}
      >
        <input
          id="detailer-masks"
          type="checkbox"
          checked={settings.keepMasks}
          onChange={(event) => update({ keepMasks: event.currentTarget.checked })}
        />{' '}
        {t('Segmentierungsmasken behalten')}
      </label>
      <Button
        id="detailer-image"
        className="secondary compact detailer-apply"
        icon="detail"
        disabled={!canApply}
        title={t('Ohne neuen Render: die gewählte Variante oder das geöffnete Bild nachbessern')}
        onClick={onApply}
      >
        {' '}
        {t('Auf aktuelles Bild anwenden')}
      </Button>
    </CollapsibleSection>
  )
}

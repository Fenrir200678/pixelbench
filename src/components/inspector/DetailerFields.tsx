import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { detailerParameterKeys } from '../../editor/detailer.js'
import type { Detailer } from '../../hooks/useDetailer.js'
import type { Parameters, Profile } from '../../types/api.js'
import { Button } from '../../ui/Button.js'
import { Icon } from '../../ui/Icon.js'
import { CollapsibleSection } from '../../ui/CollapsibleSection.js'
import { Combobox } from '../../ui/Combobox.js'
import { NumberField } from '../../ui/NumberField.js'
import { Tabs } from '../../ui/Tabs.js'
import { ParameterInput } from './RenderFields.js'

// ComfyUI's SAM3 guide: short noun phrases, commas between object types, ":N" per type.
const termsGuide = 'https://docs.comfy.org/tutorials/utility/video-segment-sam3'

type DetailerTab = 'basic' | 'advanced'

// Own sampler, scheduler, steps and CFG for the objects. Starts from the render values and only lists what the
// profile exposes.
function DetailerSampling({
  detailer,
  profile,
  parameters
}: {
  detailer: Detailer
  profile?: Profile
  parameters: Parameters
}) {
  const { t } = useTranslation()
  const { settings, update } = detailer
  const keys = detailerParameterKeys.filter((key) => profile?.parameters[key])
  return (
    <div className="detailer-group">
      <h3>{t('Sampling')}</h3>
      <label
        className="check"
        title={t('Aus: Sampler, Scheduler, Steps und CFG des Renders. An: eigene Werte nur für die Objekte.')}
      >
        <input
          id="detailer-sampling"
          type="checkbox"
          checked={settings.sampling}
          disabled={!keys.length}
          onChange={(event) => {
            const sampling = event.currentTarget.checked
            // The first switch starts from the render values instead of profile defaults.
            const start = Object.fromEntries(
              keys.map((key) => [key, parameters[key] ?? profile!.parameters[key].default])
            )
            update({ sampling, parameters: sampling ? { ...start, ...settings.parameters } : settings.parameters })
          }}
        />{' '}
        {t('Eigene Sampling-Einstellungen')}
      </label>
      {!keys.length && <p className="field-note">{t('Dieses Profil hat feste Sampling-Einstellungen.')}</p>}
      {profile &&
        settings.sampling &&
        keys.map((key) => (
          <ParameterInput
            key={profile.id + key}
            id={'detailer-parameter-' + key}
            profile={profile}
            name={key}
            value={settings.parameters[key] ?? parameters[key] ?? profile.parameters[key].default}
            onChange={(value) => update({ parameters: { ...settings.parameters, [key]: value } })}
          />
        ))}
    </div>
  )
}

// Detailer in Erstellen: finds objects such as faces with a YOLO model or SAM3 and re-renders each one in a crop,
// like ADetailer.
export function DetailerFields({
  detailer,
  profile,
  parameters,
  canApply,
  onApply
}: {
  detailer: Detailer
  profile?: Profile
  parameters: Parameters
  canApply: boolean
  onApply: () => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<DetailerTab>('basic')
  const { settings, update, detector, upscalers, upscalerChoice, yoloModels, target } = detailer
  const on = settings.on
  const yolo = settings.method === 'yolo'
  const title = t('Detailer') + (on && target ? ' · ' + target : '')
  return (
    <CollapsibleSection id="detailer-settings" title={title} summary={on ? undefined : t('Aus')} defaultOpen={false}>
      <div className="ratio-chips scale-modes detailer-methods" role="group" aria-label={t('Erkennungsmethode')}>
        <Button
          id="detailer-yolo"
          className="quiet compact"
          aria-pressed={yolo}
          title={t('Schnell und auf der CPU. Findet feste Klassen wie Gesichter.')}
          onClick={() => update({ method: 'yolo' })}
        >
          YOLO
        </Button>
        <Button
          id="detailer-sam3"
          className="quiet compact"
          aria-pressed={!yolo}
          title={t('Findet beliebige Objekte per Text. Läuft in ComfyUI und braucht zusätzlich VRAM.')}
          onClick={() => update({ method: 'sam3' })}
        >
          SAM3
        </Button>
      </div>
      <label className="check detailer-toggle">
        <input
          id="use-detailer"
          type="checkbox"
          checked={on}
          disabled={!detector}
          onChange={(event) => update({ on: event.currentTarget.checked })}
        />{' '}
        {t('Beim Generieren anwenden')}
      </label>
      {!detector && (
        <p className="field-note">
          {yolo
            ? t(
                'Kein YOLO-Modell gefunden. Die Installation lädt Modelle für Gesichter und Hände nach „.runtime/models/yolo“.'
              )
            : t(
                'Der Detailer braucht ComfyUI mit SAM3 und das Modell „sam3.1_multiplex_fp16.safetensors“ unter „checkpoints“.'
              )}
        </p>
      )}
      <Tabs
        id="detailer-tabs"
        label={t('Detailer-Einstellungen')}
        value={tab}
        tabs={[
          { value: 'basic', label: t('Allgemein'), icon: 'detail' },
          {
            value: 'advanced',
            label: t('Erweitert'),
            icon: 'settings',
            marked: settings.sampling ? t('Eigene Sampling-Einstellungen sind aktiv.') : undefined
          }
        ]}
        onChange={setTab}
      >
        {tab === 'basic' ? (
          <>
            {yolo ? (
              <label
                className="stack"
                title={t(
                  'YOLO-Modell, das die Objekte findet. Weitere ONNX-Modelle kommen nach „.runtime/models/yolo“.'
                )}
              >
                <span>{t('Erkennungsmodell')}</span>
                <Combobox
                  id="detailer-model"
                  value={detector?.kind === 'yolo' ? detector.model : ''}
                  disabled={!yoloModels.length}
                  options={yoloModels.map(({ name, labels }) => ({
                    value: name,
                    label: labels.length ? name + ' · ' + labels.join(', ') : name
                  }))}
                  onChange={(model) => update({ model })}
                />
              </label>
            ) : (
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
            )}
            <label
              className="stack"
              title={t(
                'Eigener Prompt für die Objekte, z. B. „detailed face, sharp eyes“. Leer verwendet den Hauptprompt.'
              )}
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
            <p className="field-note">
              {t(
                'Rendert jedes Objekt einzeln mit Modell, LoRAs und Seed des Renders. Um 0,4 bleibt das Gesicht ähnlich.'
              )}
            </p>
            <div className="check-row">
              <label
                className="check"
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
                className="check"
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
                {yolo ? t('Erkennungsmasken behalten') : t('Segmentierungsmasken behalten')}
              </label>
            </div>
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
          </>
        ) : (
          <>
            <div className="detailer-group">
              <h3>{t('Erkennung')}</h3>
              <NumberField
                id="detailer-limit"
                label={t('Max. Treffer')}
                title={yolo ? t('Höchstens so viele Objekte je Klasse') : t('Höchstens so viele Objekte je Begriff')}
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
                value={yolo ? settings.yoloThreshold : settings.threshold}
                min={0.05}
                max={0.95}
                step={0.05}
                row
                slider
                onChange={(threshold) => update(yolo ? { yoloThreshold: threshold } : { threshold })}
              />
            </div>
            <div className="detailer-group">
              <h3>{t('Maske')}</h3>
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
            </div>
            <div className="detailer-group">
              <label
                className="stack"
                title={t(
                  'Vergrößert kleine Objekte vor dem Neurendern mit dem Upscale-Modell. Das hält die Vorlage scharf.'
                )}
              >
                <span>{t('Upscale-Modell')}</span>
                <Combobox
                  id="detailer-upscaler"
                  value={upscalerChoice}
                  options={[
                    ...upscalers.map((file) => ({ value: file })),
                    { value: 'lanczos', label: t('Ohne Modell (weicheres Inpainting)') }
                  ]}
                  onChange={(upscaler) => update({ upscaler })}
                />
              </label>
            </div>
            <DetailerSampling detailer={detailer} profile={profile} parameters={parameters} />
          </>
        )}
      </Tabs>
    </CollapsibleSection>
  )
}

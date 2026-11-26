import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { sizeLabel } from '../../editor/geometry.js'
import { hiresSamplingKeys, type Workflow } from '../../hooks/useWorkflow.js'
import type { Work } from '../../types/editor.js'
import { Button } from '../../ui/Button.js'
import { Combobox } from '../../ui/Combobox.js'
import { CollapsibleSection } from '../../ui/CollapsibleSection.js'
import { NumberField } from '../../ui/NumberField.js'
import { Tabs } from '../../ui/Tabs.js'
import { ScaleFields } from './UpscaleFields.js'

type HiresTab = 'basic' | 'advanced'

// Hires fix in Erstellen: enlarge the rendered image and re-render details, in the same job. General holds what
// changes from run to run, Advanced the pass's own color correction, sampling and tiling.
export function HiresFields({
  workflow,
  work,
  canApply,
  onApply
}: {
  workflow: Workflow
  work?: Work
  canApply: boolean
  onApply: () => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<HiresTab>('basic')
  const { hires, upscalers, profile, measurement, hiresSize } = workflow
  const on = hires.on
  const seedLocked = workflow.prefs.seedMode === 'fixed'
  const title = 'Hires-Fix' + (on && hiresSize ? ' · ' + sizeLabel(...hiresSize) + ' px' : '')
  const warning =
    workflow.hiresTiled && !workflow.hiresReady
      ? t('Der Hires-Fix braucht die Custom-Nodes „Ultimate SD Upscale“ in ComfyUI.')
      : workflow.hiresLarge && profile
        ? t('Über {{max}} px oder {{mp}} MP braucht {{profile}} ohne Kacheln viel VRAM und Zeit.', {
            max: profile.sizes.max,
            mp: String(Math.round(profile.sizes.area / 1e5) / 10).replace('.', ','),
            profile: profile.short
          })
        : undefined
  const custom = Boolean(
    (workflow.colorMatchAvailable && Number(hires.colorMatch) > 0) ||
    hires.steps > 0 ||
    hires.sampler ||
    hires.scheduler ||
    hires.tiled
  )
  return (
    <CollapsibleSection id="hires-settings" title={title} summary={on ? undefined : t('Aus')} defaultOpen={false}>
      <Tabs
        id="hires-tabs"
        label={t('Hires-Fix-Einstellungen')}
        value={tab}
        tabs={[
          { value: 'basic', label: t('Allgemein'), icon: 'upscale' },
          {
            value: 'advanced',
            label: t('Erweitert'),
            icon: 'settings',
            marked: custom ? t('Eigene Einstellungen für den Hires-Pass sind aktiv.') : undefined
          }
        ]}
        onChange={setTab}
      >
        {tab === 'basic' ? (
          <>
            <div className="check-row hires-checks">
              <label className="check">
                <input
                  id="use-hires"
                  type="checkbox"
                  checked={on}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked
                    workflow.updateHires({ on: checked })
                    // Usually the current variant is upscaled, so turning the hires fix on also locks its seed (opt-out).
                    if (checked && !seedLocked && workflow.seedValue !== undefined) workflow.toggleSeed()
                  }}
                />{' '}
                {t('Beim Generieren anwenden')}
              </label>
              {/* The same lock as under Render: keeps the seed of the last or selected variant for the hires run. */}
              <label
                className="check"
                title={seedLocked ? undefined : t('Seed der zuletzt erstellten oder gewählten Variante')}
              >
                <input
                  id="hires-seed-lock"
                  type="checkbox"
                  checked={seedLocked}
                  disabled={!seedLocked && workflow.seedValue === undefined}
                  onChange={workflow.toggleSeed}
                />{' '}
                {t('Seed fixieren')}
                <output className="check-value">{workflow.seedValue ?? '—'}</output>
              </label>
            </div>
            <div className="hires-scale">
              <ScaleFields
                id="hires"
                source={measurement?.effective}
                scale={hires.scale}
                onChange={(scale) => workflow.updateHires({ scale })}
              />
            </div>
            <NumberField
              id="hires-strength"
              label={t('Stärke')}
              title={t('Stärke, mit der das vergrößerte Bild neu gerendert wird.')}
              value={hires.strength}
              min={0.05}
              max={1}
              step={0.05}
              row
              slider
              onChange={(strength) => workflow.updateHires({ strength })}
            />
            <p className="field-note hires-strength-note">{t('Um 0,3 bleibt das Bild nah am ersten Render.')}</p>
            <label className="stack">
              <span>{t('Upscale-Modell')}</span>
              <Combobox
                id="hires-upscaler"
                value={hires.upscaler}
                options={[
                  ...upscalers.map((file) => ({ value: file })),
                  { value: 'lanczos', label: t('Lanczos (ohne Modell)') }
                ]}
                onChange={(upscaler) => workflow.updateHires({ upscaler })}
              />
            </label>
            {warning && <p className="field-note warn">{warning}</p>}
            {work && (
              <Button
                id="hires-image"
                className="secondary compact hires-apply"
                icon="upscale"
                disabled={!canApply}
                title={t('Ohne neuen Render: das geöffnete Bild hochskalieren und Details nachrendern')}
                onClick={onApply}
              >
                {' '}
                {t('Auf aktuelles Bild anwenden')}
              </Button>
            )}
          </>
        ) : (
          <HiresAdvanced workflow={workflow} />
        )}
      </Tabs>
    </CollapsibleSection>
  )
}

// Color correction, the pass's own steps, sampler and scheduler, and tiled rendering.
function HiresAdvanced({ workflow }: { workflow: Workflow }) {
  const { t } = useTranslation()
  const { hires, profile } = workflow
  const fixedSigmas = Boolean(profile?.img2img?.sigmas)
  const samplingKeys = hiresSamplingKeys.filter((key) => typeof profile?.parameters[key]?.default === 'string')
  return (
    <>
      {workflow.colorMatchAvailable && (
        <div className="detailer-group">
          <h3>{t('Farbkorrektur')}</h3>
          <NumberField
            id="hires-color-match"
            label={t('Stärke')}
            title={t('Gleicht die Farben des Ergebnisses an das Bild vor dem Hochskalieren an. 0 aus, 1 voll.')}
            value={Number(hires.colorMatch) || 0}
            min={0}
            max={1}
            step={0.05}
            row
            slider
            onChange={(colorMatch) => workflow.updateHires({ colorMatch })}
          />
        </div>
      )}
      <div className="detailer-group">
        <h3>{t('Sampling')}</h3>
        {!fixedSigmas && (
          <NumberField
            id="hires-steps"
            label={t('Hires-Schritte')}
            title={t('0 verwendet die Schritte unter „Render“.')}
            value={hires.steps}
            min={0}
            max={100}
            row
            slider
            onChange={(steps) => workflow.updateHires({ steps })}
          />
        )}
        {profile &&
          samplingKeys.map((key) => {
            const options = profile.choices[key] ?? []
            return (
              <label key={key} className="field-row">
                <span>{t(profile.parameters[key].label)}</span>
                <Combobox
                  id={'hires-' + key}
                  value={options.includes(hires[key]) ? hires[key] : ''}
                  options={[
                    { value: '', label: t('Wie beim Render') },
                    ...(key === 'sampler' ? [...options].sort((a, b) => a.localeCompare(b)) : options).map(
                      (option) => ({ value: option })
                    )
                  ]}
                  onChange={(value) => workflow.updateHires({ [key]: value })}
                />
              </label>
            )
          })}
        {fixedSigmas && !samplingKeys.length && (
          <p className="field-note">{t('Dieses Profil hat feste Sampling-Einstellungen.')}</p>
        )}
      </div>
      <div className="detailer-group">
        <h3>{t('Kacheln')}</h3>
        <label
          className="check"
          title={t('Ultimate SD Upscale rendert das Bild in Kacheln in der Zielgröße des Profils.')}
        >
          <input
            id="hires-tiled"
            type="checkbox"
            checked={hires.tiled}
            onChange={(event) => workflow.updateHires({ tiled: event.currentTarget.checked })}
          />{' '}
          {t('In Kacheln rendern')}
        </label>
      </div>
    </>
  )
}

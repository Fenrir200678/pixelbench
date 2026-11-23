import { useTranslation } from 'react-i18next'
import { sizeLabel } from '../../editor/geometry.js'
import type { Workflow } from '../../hooks/useWorkflow.js'
import { maxEdge } from '../../image/pixels.js'
import { Button } from '../../ui/Button.js'
import { NumberField } from '../../ui/NumberField.js'
import { Thumbnail } from '../../ui/Thumbnail.js'
import type { Frame } from '../../types/image.js'
import { CollapsibleSection } from '../../ui/CollapsibleSection.js'
import { RatioLock } from './RatioLock.js'

/** A shown variant that is not the source image, with the action that makes it the source. */
export type SourceSwitch = { variant: number; onUse: () => void }

export function CreateSizeFields({
  workflow,
  source,
  sourceSwitch
}: {
  workflow: Workflow
  source?: Frame
  sourceSwitch?: SourceSwitch
}) {
  const { t } = useTranslation()
  const { measurement } = workflow
  const summary = measurement && sizeLabel(...measurement.effective) + ' px'
  return (
    <>
      {workflow.templateAvailable && <TemplateFields workflow={workflow} source={source} sourceSwitch={sourceSwitch} />}
      <CollapsibleSection id="size-settings" title={t('Größe')} summary={summary}>
        {workflow.template ? <TemplateSize workflow={workflow} /> : <CreateSize workflow={workflow} />}
      </CollapsibleSection>
    </>
  )
}

const createRatios: [string, number][] = [
  ['1:1', 1],
  ['4:3', 4 / 3],
  ['3:2', 3 / 2],
  ['16:9', 16 / 9],
  ['3:4', 3 / 4],
  ['2:3', 2 / 3],
  ['9:16', 9 / 16]
]

function TemplateFields({
  workflow,
  source,
  sourceSwitch
}: {
  workflow: Workflow
  source?: Frame
  sourceSwitch?: SourceSwitch
}) {
  const { t } = useTranslation()
  const on = workflow.templateOn
  return (
    <CollapsibleSection
      id="template-settings"
      title="Img2Img"
      summary={on ? t('Stärke {{value}}', { value: workflow.prefs.strength }) : t('Aus')}
    >
      <label className="check">
        <input
          id="use-template"
          type="checkbox"
          checked={on}
          onChange={(event) => workflow.toggleTemplate(event.currentTarget.checked)}
        />{' '}
        {t('Aktuelles Bild als Vorlage für Img2Img verwenden')}
      </label>
      {source && (
        <div className="template-source" data-off={!on || undefined}>
          <Thumbnail frame={source} />
          <span>
            {t('Quellbild')} · {sizeLabel(source.w, source.h)} px
          </span>
        </div>
      )}
      {on && sourceSwitch && (
        <div className="template-switch" role="note">
          <p>{t('Img2Img verwendet das Quellbild, nicht die angezeigte Variante.')}</p>
          <Button className="secondary compact" icon="baseline" onClick={sourceSwitch.onUse}>
            {t('Variante {{n}} als Quelle verwenden', { n: sourceSwitch.variant })}
          </Button>
        </div>
      )}
      <NumberField
        id="template-strength"
        label={t('Stärke')}
        value={workflow.prefs.strength}
        min={0.05}
        max={1}
        step={0.05}
        row
        slider
        disabled={!on}
        onChange={(strength) => workflow.updatePrefs({ strength })}
      />
      <p className="field-note">
        {on
          ? t('Niedrig bleibt nah an der Vorlage, hoch wird freier.')
          : t('Aus: Das Bild entsteht nur aus dem Prompt.')}
      </p>
    </CollapsibleSection>
  )
}

function TemplateSize({ workflow }: { workflow: Workflow }) {
  const { t } = useTranslation()
  const { profile, measurement, prefs, template, templateSize } = workflow
  if (!template || !templateSize) return null
  const rule = profile?.sizes
  const slider = rule ? { min: rule.min, max: rule.max, step: rule.grid } : true
  const cropped =
    measurement && Math.abs(measurement.effective[0] / measurement.effective[1] / (template.w / template.h) - 1) > 0.01
  return (
    <div className="render-size">
      <div className="field-row">
        <span>{t('Vorlage')}</span>
        <output id="template-size">{sizeLabel(template.w, template.h)} px</output>
      </div>
      <div className="dimensions locked-dimensions">
        <NumberField
          id="template-w"
          label={t('Breite')}
          sliderLabel={t('Bildbreite')}
          min={1}
          max={maxEdge}
          value={templateSize[0]}
          slider={slider}
          commitOnBlur
          onChange={(value) => workflow.setTemplateDimension('w', value)}
        />
        <span>×</span>
        <NumberField
          id="template-h"
          label={t('Höhe')}
          sliderLabel={t('Bildhöhe')}
          min={1}
          max={maxEdge}
          value={templateSize[1]}
          slider={slider}
          commitOnBlur
          onChange={(value) => workflow.setTemplateDimension('h', value)}
        />
        <RatioLock
          id="template-lock"
          label={t('Seitenverhältnis der Vorlage halten')}
          locked={prefs.lock}
          onClick={() => workflow.toggleLock(!prefs.lock)}
        />
      </div>
      <div className="size-meta">
        <output id="effective-size" title={rule && t('{{grid}} px Raster', { grid: rule.grid })}>
          {measurement
            ? t('Wirksam ') + sizeLabel(...measurement.effective) + ' px' + (measurement.corrected ? ' ↺' : '')
            : '—'}
        </output>
        <div className="size-actions">
          <Button
            className="quiet compact"
            disabled={prefs.templateAuto}
            title={t('Auf die Zielfläche des Profils skalieren')}
            onClick={() => workflow.setTemplateAuto(true)}
          >
            Auto
          </Button>
          <Button className="quiet compact" onClick={workflow.fitTemplateSourceSize}>
            {t('Quellgröße')}
          </Button>
        </div>
      </div>
      {cropped && (
        <p className="field-note">{t('Die Vorlage wird mittig auf das neue Seitenverhältnis beschnitten.')}</p>
      )}
    </div>
  )
}

function CreateSize({ workflow }: { workflow: Workflow }) {
  const { t } = useTranslation()
  const { profile, measurement, prefs } = workflow
  const rule = profile?.sizes
  const slider = rule ? { min: rule.min, max: rule.max, step: rule.grid } : true
  const ratio = prefs.createW / prefs.createH
  return (
    <div className="render-size">
      <div className="ratio-chips" role="group" aria-label={t('Seitenverhältnis')}>
        {createRatios.map(([label, value]) => (
          <Button
            key={label}
            className="quiet compact"
            // Grid snapping shifts the ratio slightly, for example 3:2 becomes 1280 × 832 on a 64 px grid.
            aria-pressed={Math.abs(ratio / value - 1) < 0.04}
            disabled={!profile}
            onClick={() => workflow.chooseCreateRatio(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="dimensions locked-dimensions">
        <NumberField
          id="create-w"
          label={t('Breite')}
          sliderLabel={t('Bildbreite')}
          min={1}
          max={maxEdge}
          disabled={!profile}
          value={prefs.createW}
          slider={slider}
          commitOnBlur
          onChange={(value) => workflow.setCreateDimension('w', value)}
        />
        <Button
          className="icon swap-size"
          icon="swap"
          aria-label={t('Breite und Höhe tauschen')}
          title={t('Breite und Höhe tauschen')}
          disabled={!profile || prefs.createW === prefs.createH}
          onClick={workflow.swapCreateSize}
        />
        <NumberField
          id="create-h"
          label={t('Höhe')}
          sliderLabel={t('Bildhöhe')}
          min={1}
          max={maxEdge}
          disabled={!profile}
          value={prefs.createH}
          slider={slider}
          commitOnBlur
          onChange={(value) => workflow.setCreateDimension('h', value)}
        />
        <RatioLock
          id="create-lock"
          label={t('Seitenverhältnis sperren')}
          locked={prefs.lock}
          disabled={!profile}
          onClick={() => workflow.toggleLock(!prefs.lock)}
        />
      </div>
      {/* Only worth a line when the grid changes the requested size. */}
      {measurement?.corrected && (
        <div className="field-row">
          <span>{t('Renderauflösung')}</span>
          <output id="effective-size" title={rule && t('{{grid}} px Raster', { grid: rule.grid })}>
            {t('Wirksam ') + sizeLabel(...measurement.effective) + ' px ↺'}
          </output>
        </div>
      )}
    </div>
  )
}

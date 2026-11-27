import { useTranslation } from 'react-i18next'
import { frameChoices, setCropField, sizeOutpaint } from '../../editor/geometry.js'
import type { Workflow } from '../../hooks/useWorkflow.js'
import { expandedRect, maxEdge, maxPixels } from '../../image/pixels.js'
import type { Notice, Tool, Work } from '../../types/editor.js'
import type { Margins, Rect } from '../../types/image.js'
import { Button } from '../../ui/Button.js'
import { NumberField } from '../../ui/NumberField.js'
import { RatioLock } from './RatioLock.js'

export function FrameFields({
  work,
  workflow,
  onMargins,
  notice
}: {
  work?: Work
  workflow: Workflow
  onMargins: (value: Margins) => void
  notice: Notice
}) {
  const { t } = useTranslation()
  const image = work?.image
  const margins = work?.margins
  const target = work && expandedRect(work.image, work.margins)
  function update(axis: 'w' | 'h', value: number) {
    if (!image || !target || !margins) return
    const next = sizeOutpaint(image, margins, axis, value, workflow.frameRatio)
    if (!next) {
      notice('Der Zielrahmen darf bis zu 8192 px pro Seite und 24 MP groß sein.')
      return
    }
    onMargins(next)
    notice()
  }
  return (
    <>
      <div className="dimensions locked-dimensions">
        <NumberField
          id="frame-width"
          label={t('Breite')}
          sliderLabel={t('Zielbreite')}
          value={target?.w}
          disabled={!image}
          min={image?.w ?? 1}
          max={maxEdge}
          slider={{ max: target && Math.min(maxEdge, Math.floor(maxPixels / target.h)) }}
          commitOnBlur
          onChange={(w) => update('w', w)}
        />
        <span>×</span>
        <NumberField
          id="frame-height"
          label={t('Höhe')}
          sliderLabel={t('Zielhöhe')}
          value={target?.h}
          disabled={!image}
          min={image?.h ?? 1}
          max={maxEdge}
          slider={{ max: target && Math.min(maxEdge, Math.floor(maxPixels / target.w)) }}
          commitOnBlur
          onChange={(h) => update('h', h)}
        />
        <FrameLock workflow={workflow} disabled={!image} />
      </div>
      <NumberField
        id="transition"
        label={t('Übergang')}
        value={workflow.prefs.transition}
        title={t('Übergang innerhalb des Originals, nur entlang erweiterter Seiten.')}
        row
        suffix="px"
        slider
        min={0}
        max={256}
        onChange={(transition) => workflow.updatePrefs({ transition })}
      />
      {workflow.colorMatchAvailable && (
        <NumberField
          id="outpaint-color-match"
          label={t('Farbkorrektur')}
          title={t('Gleicht die Farben des Ergebnisses an das Ausgangsbild an. 0 aus, 1 voll.')}
          value={Number(workflow.prefs.outpaintColorMatch) || 0}
          min={0}
          max={1}
          step={0.05}
          row
          slider
          onChange={(outpaintColorMatch) => workflow.updatePrefs({ outpaintColorMatch })}
        />
      )}
    </>
  )
}

export function GenerationFrameFields({
  work,
  tool,
  workflow,
  onCrop
}: {
  work: Work
  tool: Tool
  workflow: Workflow
  onCrop: (value?: Rect) => void
}) {
  const { t } = useTranslation()
  const { crop, grid } = workflow
  if (!crop) return null
  const { image } = work
  const choices = frameChoices(work, tool, crop, workflow.prefs.auto)
  const maxWidth = image.w - crop.x
  const maxHeight = image.h - crop.y
  const field = (key: 'w' | 'h', label: string, min: number, max: number) => (
    <NumberField
      id={'generation-frame-' + key}
      label={label}
      value={crop[key]}
      min={min}
      max={max}
      step={grid}
      disabled={min === max}
      commitOnBlur
      onChange={(value) => onCrop(setCropField(image, crop, key, value, grid, workflow.frameRatio))}
    />
  )
  return (
    <>
      <div className="dimensions locked-dimensions">
        {field('w', t('Breite'), Math.min(grid, maxWidth), maxWidth)}
        <span>×</span>
        {field('h', t('Höhe'), Math.min(grid, maxHeight), maxHeight)}
        <FrameLock workflow={workflow} />
      </div>
      <div className="size-meta">
        <output>{t('{{grid}} px Raster', { grid })}</output>
        <div className="size-actions">
          <Button
            className="quiet compact"
            hidden={!choices.autoAvailable}
            disabled={choices.automatic}
            onClick={() => onCrop()}
          >
            {t('Automatischer Ausschnitt')}
          </Button>
          <Button className="quiet compact" disabled={choices.fullImage} onClick={() => onCrop(choices.fullCrop)}>
            {t('Ganzes Bild')}
          </Button>
        </div>
      </div>
      {tool === 'edit' && (crop.w !== image.w || crop.h !== image.h) && (
        <NumberField
          id="edit-feather"
          label={t('Randübergang')}
          title={t(
            'Blendet neue Ergebnisse nach innen mit dem Original. Bei kleinen Rahmen wird der Übergang automatisch begrenzt.'
          )}
          value={workflow.prefs.editFeather}
          row
          suffix="px"
          slider
          min={0}
          max={256}
          onChange={(editFeather) => workflow.updatePrefs({ editFeather })}
        />
      )}
    </>
  )
}

function FrameLock({ workflow, disabled }: { workflow: Workflow; disabled?: boolean }) {
  const { t } = useTranslation()
  return (
    <RatioLock
      id="frame-ratio-lock"
      label={t('Rahmenverhältnis sperren')}
      locked={Boolean(workflow.frameRatio)}
      disabled={disabled}
      onClick={workflow.toggleFrameRatio}
    />
  )
}

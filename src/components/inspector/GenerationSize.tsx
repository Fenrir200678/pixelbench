import { useTranslation } from 'react-i18next'
import { sizeLabel } from '../../editor/geometry.js'
import type { Workflow } from '../../hooks/useWorkflow.js'
import { maxEdge } from '../../image/pixels.js'
import type { Tool } from '../../types/editor.js'
import { NumberField } from '../../ui/NumberField.js'
import { RatioLock } from './RatioLock.js'

export function GenerationSize({ workflow, tool }: { workflow: Workflow; tool: Tool }) {
  const { t } = useTranslation()
  const { profile, measurement, prefs, toggleAuto, toggleLock, setDimension } = workflow
  const { auto, lock } = prefs
  const disabled = auto || !profile
  const rule = profile?.sizes
  const slider = rule ? { min: rule.min, max: rule.max, step: rule.grid } : true
  const effective = measurement
    ? t('Wirksam ') + sizeLabel(...measurement.effective) + ' px' + (measurement.corrected ? ' ↺' : '')
    : '—'
  const note =
    measurement && rule
      ? (measurement.corrected ? t('Korrigiert auf ') + rule.grid + t(' px Raster. ') : '') +
        (tool === 'inpaint' || workflow.manualCrop
          ? t('Ausschnitt ') + sizeLabel(measurement.crop.w, measurement.crop.h)
          : t('Export ') + sizeLabel(measurement.target.w, measurement.target.h)) +
        ' px'
      : undefined

  return (
    <div className="render-size">
      <div className="field-row">
        <span>{t('Renderauflösung')}</span>
        <output id="effective-size" title={note}>
          {effective}
        </output>
        <label className="check">
          <input
            id="auto-size"
            type="checkbox"
            checked={auto}
            onChange={(event) => toggleAuto(event.currentTarget.checked)}
          />{' '}
          Auto
        </label>
      </div>
      <div className="dimensions locked-dimensions" hidden={auto}>
        <NumberField
          id="gen-w"
          label={t('Breite')}
          sliderLabel={t('Generierungsbreite')}
          min={1}
          max={maxEdge}
          disabled={disabled}
          value={prefs.w}
          slider={slider}
          onChange={(value) => setDimension('w', value)}
        />
        <span>×</span>
        <NumberField
          id="gen-h"
          label={t('Höhe')}
          sliderLabel={t('Generierungshöhe')}
          min={1}
          max={maxEdge}
          disabled={disabled}
          value={prefs.h}
          slider={slider}
          onChange={(value) => setDimension('h', value)}
        />
        <RatioLock
          id="size-lock"
          label={t('Render-Seitenverhältnis sperren')}
          locked={lock}
          disabled={disabled}
          onClick={() => toggleLock(!lock)}
        />
      </div>
    </div>
  )
}

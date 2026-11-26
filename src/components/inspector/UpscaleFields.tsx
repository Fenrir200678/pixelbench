import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { sizeLabel } from '../../editor/geometry.js'
import { cropped, scaledSize, upscaleFactors, type Scale } from '../../editor/upscale.js'
import type { Workflow } from '../../hooks/useWorkflow.js'
import { maxEdge } from '../../image/pixels.js'
import type { Work } from '../../types/editor.js'
import { Button } from '../../ui/Button.js'
import { Combobox } from '../../ui/Combobox.js'
import { CollapsibleSection } from '../../ui/CollapsibleSection.js'
import { NumberField } from '../../ui/NumberField.js'
import { RatioLock } from './RatioLock.js'

const factorRange = [1, 4] as const
const factorLabel = (factor: number) => String(factor).replace('.', ',') + '×'

// "Skalieren um" a factor or "Skalieren auf" a size, as in Forge. Shared by Hochskalieren and the hires fix.
export function ScaleFields({
  id,
  source,
  scale,
  onChange
}: {
  id: string
  source?: [number, number]
  scale: Scale
  onChange: (scale: Scale) => void
}) {
  const { t } = useTranslation()
  const update = (patch: Partial<Scale>) => onChange({ ...scale, ...patch })
  const result = source && scaledSize(source, scale)
  const ratio = source ? source[1] / source[0] : 1
  return (
    <>
      <div className="ratio-chips scale-modes" role="group" aria-label={t('Skalierung')}>
        <Button
          id={id + '-by'}
          className="quiet compact"
          aria-pressed={scale.mode === 'by'}
          onClick={() => update({ mode: 'by' })}
        >
          {t('Skalieren um')}
        </Button>
        <Button
          id={id + '-to'}
          className="quiet compact"
          aria-pressed={scale.mode === 'to'}
          onClick={() => update({ mode: 'to' })}
        >
          {t('Skalieren auf')}
        </Button>
      </div>
      {scale.mode === 'by' ? (
        <>
          <NumberField
            id={id + '-factor'}
            label={t('Faktor')}
            value={scale.factor}
            min={factorRange[0]}
            max={factorRange[1]}
            step={0.25}
            row
            slider
            onChange={(factor) => update({ factor })}
          />
          {/* The presets as marks on the slider's scale, at the position of their value. */}
          <div className="factor-ticks" role="group" aria-label={t('Faktor')}>
            {upscaleFactors.map((factor) => (
              <button
                key={factor}
                type="button"
                aria-pressed={scale.factor === factor}
                style={{ '--at': (factor - factorRange[0]) / (factorRange[1] - factorRange[0]) } as CSSProperties}
                onClick={() => update({ factor })}
              >
                {factorLabel(factor)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="dimensions locked-dimensions">
          <NumberField
            id={id + '-w'}
            label={t('Breite')}
            sliderLabel={t('Bildbreite')}
            min={64}
            max={maxEdge}
            value={scale.w}
            slider={{ min: 64, max: maxEdge, step: 64 }}
            commitOnBlur
            onChange={(w) => update({ w })}
          />
          <span>×</span>
          <NumberField
            id={id + '-h'}
            label={t('Höhe')}
            sliderLabel={t('Bildhöhe')}
            min={64}
            max={maxEdge}
            value={scale.lock ? Math.round(scale.w * ratio) : scale.h}
            slider={{ min: 64, max: maxEdge, step: 64 }}
            commitOnBlur
            onChange={(h) => update(scale.lock ? { w: Math.round(h / ratio) } : { h })}
          />
          <RatioLock
            id={id + '-lock'}
            label={t('Seitenverhältnis des Bildes halten')}
            locked={scale.lock}
            onClick={() => update(scale.lock ? { lock: false, h: Math.round(scale.w * ratio) } : { lock: true })}
          />
        </div>
      )}
      <div className="field-row">
        <span>{t('Ergebnis')}</span>
        <output id={id + '-size'} title={source && sizeLabel(...source) + ' px'}>
          {result ? sizeLabel(...result) + ' px' : '—'}
        </output>
      </div>
      {source && result && cropped(source, result) && (
        <p className="field-note">{t('Das Bild wird mittig auf das neue Seitenverhältnis beschnitten.')}</p>
      )}
    </>
  )
}

// Hochskalieren: only the upscale model and the size. No diffusion model, prompt or seed.
export function UpscaleFields({ workflow, work }: { workflow: Workflow; work?: Work }) {
  const { t } = useTranslation()
  const { upscale, upscalers } = workflow
  const image = work?.image
  const result = image && scaledSize([image.w, image.h], upscale.scale)
  const summary = result
    ? sizeLabel(...result) + ' px'
    : upscale.scale.mode === 'by'
      ? factorLabel(upscale.scale.factor)
      : undefined
  return (
    <CollapsibleSection id="upscale-settings" title={t('Hochskalieren')} summary={summary}>
      <label className="stack">
        <span>{t('Upscale-Modell')}</span>
        <Combobox
          id="upscaler"
          value={upscale.upscaler}
          options={[
            ...upscalers.map((file) => ({ value: file })),
            { value: 'lanczos', label: t('Lanczos (ohne Modell)') }
          ]}
          onChange={(upscaler) => workflow.updateUpscale({ upscaler })}
        />
      </label>
      <ScaleFields
        id="upscale"
        source={image && [image.w, image.h]}
        scale={upscale.scale}
        onChange={(scale) => workflow.updateUpscale({ scale })}
      />
      <p className="field-note">
        {upscalers.length
          ? t('Vergrößert nur. Für mehr Details den Hires-Fix unter „Erstellen“ verwenden.')
          : t(
              'Kein Upscale-Modell gefunden. Es gehört unter „upscale_models“ oder „ESRGAN“ in einen Modell-Stammordner.'
            )}
      </p>
    </CollapsibleSection>
  )
}

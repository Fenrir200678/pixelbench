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

const factorLabel = (factor: number) => String(factor).replace('.', ',') + '×'

// "Skalieren um" a factor or "Skalieren auf" a size, as in Forge. Shared by Hochskalieren and the hires fix.
function ScaleFields({
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
          <div className="ratio-chips" role="group" aria-label={t('Faktor')}>
            {upscaleFactors.map((factor) => (
              <Button
                key={factor}
                className="quiet compact"
                aria-pressed={scale.factor === factor}
                onClick={() => update({ factor })}
              >
                {factorLabel(factor)}
              </Button>
            ))}
          </div>
          <NumberField
            id={id + '-factor'}
            label={t('Faktor')}
            value={scale.factor}
            min={1}
            max={4}
            step={0.25}
            row
            slider
            onChange={(factor) => update({ factor })}
          />
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

// Hires fix in Erstellen: enlarge the rendered image and re-render details in tiles, in the same job.
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
  const { hires, upscalers, profile, measurement, hiresSize } = workflow
  const on = hires.on
  const seedLocked = workflow.prefs.seedMode === 'fixed'
  const fixedSigmas = Boolean(profile?.img2img?.sigmas)
  const title = 'Hires-Fix' + (on && hiresSize ? ' · ' + sizeLabel(...hiresSize) + ' px' : '')
  return (
    <CollapsibleSection id="hires-settings" title={title} summary={on ? undefined : t('Aus')} defaultOpen={false}>
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
      <div className="field-row hires-seed">
        <label className="check">
          <input
            id="hires-seed-lock"
            type="checkbox"
            checked={seedLocked}
            disabled={!seedLocked && workflow.seedValue === undefined}
            onChange={workflow.toggleSeed}
          />{' '}
          {t('Seed fixieren')}
        </label>
        <output title={seedLocked ? undefined : t('Seed der zuletzt erstellten oder gewählten Variante')}>
          {workflow.seedValue ?? '—'}
        </output>
      </div>
      <label className="stack">
        <span>{t('Upscale-Modell')}</span>
        <Combobox
          id="hires-upscaler"
          value={hires.upscaler ?? ''}
          disabled={!upscalers.length}
          placeholder={upscalers.length ? undefined : t('Kein Upscale-Modell gefunden')}
          options={upscalers.map((file) => ({ value: file }))}
          onChange={(upscaler) => workflow.updateHires({ upscaler })}
        />
      </label>
      <ScaleFields
        id="hires"
        source={measurement?.effective}
        scale={hires.scale}
        onChange={(scale) => workflow.updateHires({ scale })}
      />
      <NumberField
        id="hires-strength"
        label={t('Details')}
        title={t('Stärke, mit der das vergrößerte Bild in Kacheln neu gerendert wird.')}
        value={hires.strength}
        min={0.05}
        max={1}
        step={0.05}
        row
        slider
        onChange={(strength) => workflow.updateHires({ strength })}
      />
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
      <p className="field-note">
        {workflow.hiresTiled && !workflow.hiresReady
          ? t('Der Hires-Fix braucht die Custom-Nodes „Ultimate SD Upscale“ in ComfyUI.')
          : workflow.hiresLarge && profile
            ? t('Über {{max}} px oder {{mp}} MP braucht {{profile}} ohne Kacheln viel VRAM und Zeit.', {
                max: profile.sizes.max,
                mp: String(Math.round(profile.sizes.area / 1e5) / 10).replace('.', ','),
                profile: profile.short
              })
            : t('Um 0,3 bleibt das Bild nah am ersten Render.')}
      </p>
      {work && (
        <Button
          id="hires-image"
          className="secondary compact"
          icon="upscale"
          disabled={!canApply}
          title={t('Ohne neuen Render: das geöffnete Bild hochskalieren und Details nachrendern')}
          onClick={onApply}
        >
          {' '}
          {t('Hires-Fix auf geöffnetes Bild anwenden')}
        </Button>
      )}
    </CollapsibleSection>
  )
}

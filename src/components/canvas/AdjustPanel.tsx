import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { adjustmentLimits, neutralAdjustments, type AdjustmentKey, type LevelChannel } from '../../image/adjust.js'
import type { AdjustmentsState } from '../../hooks/useAdjustments.js'
import { Button } from '../../ui/Button.js'
import { LevelsEditor } from './LevelsEditor.js'

// Labels are German message keys.
const rows: { key: AdjustmentKey; label: string }[] = [
  { key: 'brightness', label: 'Helligkeit' },
  { key: 'contrast', label: 'Kontrast' },
  { key: 'saturation', label: 'Sättigung' },
  { key: 'hue', label: 'Farbton' },
  { key: 'temperature', label: 'Farbtemperatur' },
  { key: 'sharpness', label: 'Schärfe' }
]

const format = (key: AdjustmentKey, value: number) => (key === 'hue' ? value + '°' : (value > 0 ? '+' : '') + value)

/** Floating panel over the canvas with the image adjustments of the open image. */
export function AdjustPanel({ adjustments }: { adjustments: AdjustmentsState }) {
  const { t } = useTranslation()
  const { values, set } = adjustments
  const [channel, setChannel] = useState<LevelChannel>('rgb')
  return (
    <section
      id="adjust-panel"
      className="adjust-panel"
      aria-label={t('Bildanpassungen')}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          adjustments.cancel()
        } else if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type === 'range') {
          event.preventDefault()
          adjustments.apply()
        }
      }}
    >
      <header className="adjust-header">
        <h2>{t('Bildanpassungen')}</h2>
        <label className="check" title={t('Vorschau ein- oder ausblenden (V)')}>
          <input
            type="checkbox"
            checked={adjustments.showPreview}
            onChange={(event) => adjustments.setShowPreview(event.currentTarget.checked)}
          />
          {t('Vorschau')}
        </label>
      </header>
      <LevelsEditor
        channel={channel}
        levels={values.levels[channel]}
        counts={adjustments.counts}
        onChannel={setChannel}
        onChange={(levels) => adjustments.setLevels(channel, levels)}
        onAuto={adjustments.autoLevel}
      />
      {rows.map(({ key, label }) => {
        const limits = adjustmentLimits[key]
        return (
          <label key={key} className="adjust-row" title={t('Doppelklick setzt zurück')}>
            <span>{t(label)}</span>
            <input
              type="range"
              min={limits.min}
              max={limits.max}
              step={limits.step}
              value={values[key]}
              onChange={(event) => set(key, event.currentTarget.valueAsNumber)}
              onDoubleClick={() => set(key, neutralAdjustments[key])}
            />
            <output>{format(key, values[key])}</output>
          </label>
        )
      })}
      {adjustments.masked && <p className="adjust-note">{t('Wirkt nur im maskierten Bereich.')}</p>}
      <div className="adjust-actions">
        <Button className="secondary" disabled={adjustments.neutral} onClick={adjustments.reset}>
          {t('Zurücksetzen')}
        </Button>
        <Button className="secondary" onClick={adjustments.cancel}>
          {t('Abbrechen')}
        </Button>
        <Button className="primary" disabled={adjustments.neutral} onClick={adjustments.apply}>
          {t('Anwenden')}
        </Button>
      </div>
    </section>
  )
}

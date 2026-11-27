import { useTranslation } from 'react-i18next'
import { brushLimits, canvasKeys } from '../../editor/tools.js'
import { modKey } from '../../helpers/platform.js'
import { Button } from '../../ui/Button.js'
import { RatioLock } from '../inspector/RatioLock.js'

/** Frame shortcuts shown while the generation frame tool is active. */
export type FrameControls = {
  size?: string
  locked: boolean
  onLock: () => void
  /** Missing for outpainting, where the frame cannot shrink below the image. */
  full?: { active: boolean; onClick: () => void }
  auto?: { active: boolean; onClick: () => void }
}

const shortcutLabel = (t: (key: string) => string) => (label: string, key: string) =>
  label + ' (' + key.replace('Shift+', t('Umschalt') + '+') + ')'

export function FrameOptions({ frame }: { frame: FrameControls }) {
  const { t } = useTranslation()
  const { size, locked, onLock, full, auto } = frame
  return (
    <>
      {size && (
        <output className="tool-option-value" aria-label={t('Rahmengröße')}>
          {size} px
        </output>
      )}
      <RatioLock id="toolbar-frame-lock" label={t('Rahmenverhältnis sperren')} locked={locked} onClick={onLock} />
      {full && (
        <Button
          id="frame-full"
          className="quiet compact tool-option"
          icon="full-frame"
          aria-label={t('Ganzes Bild')}
          title={t('Rahmen auf das ganze Bild setzen')}
          disabled={full.active}
          onClick={full.onClick}
        >
          <span>{t('Ganzes Bild')}</span>
        </Button>
      )}
      {auto && (
        <Button
          id="frame-auto"
          className="quiet compact tool-option"
          icon="auto-frame"
          aria-label={t('Automatischer Ausschnitt')}
          title={t('Automatischer Ausschnitt')}
          disabled={auto.active}
          onClick={auto.onClick}
        >
          <span>{t('Automatisch')}</span>
        </Button>
      )}
    </>
  )
}

export function BrushSize({ size, onSize }: { size: number; onSize: (size: number) => void }) {
  const { t } = useTranslation()
  const shortcut = shortcutLabel(t)
  return (
    <label
      className="brush-range"
      title={
        shortcut(t('Pinselgröße'), canvasKeys.smallerBrush + ' / ' + canvasKeys.largerBrush) +
        ' · ' +
        t('{{mod}} + Mausrad auf der Bildfläche', { mod: modKey(t) })
      }
    >
      <span className="sr-only">{t('Pinselgröße')}</span>
      <input
        id="brush-size"
        type="range"
        aria-keyshortcuts={canvasKeys.smallerBrush + ' ' + canvasKeys.largerBrush}
        min={brushLimits.min}
        max={brushLimits.max}
        value={size}
        onChange={(event) => onSize(event.currentTarget.valueAsNumber)}
      />
      <output id="brush-value" aria-hidden="true">
        {size} px
      </output>
    </label>
  )
}

export function MaskOptions({
  showMask,
  canToggleMask,
  hasMask,
  onToggleMask,
  onClearMask
}: {
  showMask: boolean
  canToggleMask: boolean
  hasMask: boolean
  onToggleMask: () => void
  onClearMask: () => void
}) {
  const { t } = useTranslation()
  const shortcut = shortcutLabel(t)
  return (
    <>
      <Button
        id="toggle-mask"
        className="icon"
        icon={showMask ? 'eye' : 'eye-off'}
        aria-label={t('Maskenanzeige')}
        aria-keyshortcuts={canvasKeys.mask}
        aria-pressed={showMask}
        title={shortcut(showMask ? t('Maske ausblenden') : t('Maske einblenden'), canvasKeys.mask)}
        disabled={!canToggleMask}
        onClick={onToggleMask}
      />
      <Button
        id="canvas-clear-mask"
        className="quiet compact tool-option"
        icon="trash"
        aria-label={t('Maske leeren')}
        aria-keyshortcuts={canvasKeys.clearMask}
        title={shortcut(t('Maske leeren'), canvasKeys.clearMask)}
        disabled={!hasMask}
        onClick={onClearMask}
      >
        <span>{t('Maske leeren')}</span>
      </Button>
    </>
  )
}

export function PaintOptions({
  color,
  hasDrawing,
  onColor,
  onDelete
}: {
  color: string
  hasDrawing: boolean
  onColor: (color: string) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <input
        id="brush-color"
        className="brush-color"
        type="color"
        aria-label={t('Pinselfarbe')}
        title={t('Pinselfarbe')}
        value={color}
        onChange={(event) => onColor(event.currentTarget.value)}
      />
      <Button
        id="delete-drawing"
        className="quiet compact tool-option"
        icon="trash"
        aria-label={t('Zeichenebene löschen')}
        title={t('Zeichenebene löschen')}
        disabled={!hasDrawing}
        onClick={onDelete}
      >
        <span>{t('Zeichnung löschen')}</span>
      </Button>
    </>
  )
}

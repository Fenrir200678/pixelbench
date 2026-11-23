import { useTranslation } from 'react-i18next'
import { brushLimits, canvasKeys } from '../../editor/tools.js'
import type { Tool } from '../../types/editor.js'
import { Button } from '../../ui/Button.js'

type Props = {
  tool: Tool
  loaded: boolean
  pan: boolean
  frameMode: boolean
  canFrame: boolean
  painting: boolean
  paintBrush: boolean
  hasDrawing: boolean
  brushColor: string
  hasMask: boolean
  showMask: boolean
  canToggleMask: boolean
  canSetBaseline: boolean
  eraser: boolean
  brushSize: number
  canAdjust: boolean
  adjusting: boolean
  onAdjust: () => void
  onPan: () => void
  onFrame: () => void
  onEraser: (erase: boolean) => void
  onSelectBrush: (paint: boolean) => void
  onBrushColor: (color: string) => void
  onDeleteDrawing: () => void
  onToggleMask: () => void
  onClearMask: () => void
  onBrush: (size: number) => void
  onBaseline: () => void
}

export function CanvasToolbar({
  tool,
  loaded,
  pan,
  frameMode,
  canFrame,
  painting,
  paintBrush,
  hasDrawing,
  brushColor,
  hasMask,
  showMask,
  canToggleMask,
  canSetBaseline,
  eraser,
  brushSize,
  canAdjust,
  adjusting,
  onAdjust,
  onPan,
  onFrame,
  onEraser,
  onSelectBrush,
  onBrushColor,
  onDeleteDrawing,
  onToggleMask,
  onClearMask,
  onBrush,
  onBaseline
}: Props) {
  const { t } = useTranslation()
  const inpaint = tool === 'inpaint'
  // Create and upscale work on the whole image without frames or drawing.
  const create = tool === 'create' || tool === 'upscale'
  const shortcut = (label: string, key: string) => label + ' (' + key.replace('Shift+', t('Umschalt') + '+') + ')'

  return (
    <div id="canvas-tools" className="canvas-tools" role="group" aria-label={t('Canvas-Leiste')} hidden={!loaded}>
      <div className="canvas-tool-group" role="group" aria-label={t('Canvas-Werkzeuge')}>
        <Button
          id="pan"
          className="icon"
          icon="hand"
          aria-label={t('Hand')}
          aria-keyshortcuts={canvasKeys.hand + ' Space'}
          aria-pressed={pan}
          title={shortcut(t('Hand'), canvasKeys.hand + ' / ' + t('Leertaste'))}
          onClick={onPan}
        />
        <Button
          id="generation-frame-tool"
          className="icon"
          icon="frame"
          aria-label={t('Generierungsrahmen bearbeiten')}
          aria-keyshortcuts={canvasKeys.frame}
          aria-pressed={frameMode}
          title={shortcut(t('Generierungsrahmen verschieben und skalieren'), canvasKeys.frame)}
          disabled={!canFrame}
          hidden={create}
          onClick={onFrame}
        />
        <Button
          id="paint-brush"
          className="icon"
          icon="brush"
          aria-label={t('Pinsel')}
          aria-keyshortcuts={canvasKeys.brush}
          aria-pressed={painting && paintBrush && !eraser}
          title={shortcut(t('Pinsel'), canvasKeys.brush) + ' · ' + t('Rechts gedrückt halten zum Radieren')}
          hidden={create}
          onClick={() => onSelectBrush(true)}
        />
        <Button
          id="brush"
          className="icon"
          icon="mask"
          aria-label={t('Maskenpinsel')}
          aria-keyshortcuts={canvasKeys.maskBrush}
          aria-pressed={painting && !paintBrush && !eraser}
          title={shortcut(t('Maskenpinsel'), canvasKeys.maskBrush) + ' · ' + t('Rechts gedrückt halten zum Radieren')}
          hidden={!inpaint}
          onClick={() => onSelectBrush(false)}
        />
        <Button
          id="eraser"
          className="icon"
          icon="eraser"
          aria-label={t('Radierer')}
          aria-keyshortcuts={canvasKeys.eraser}
          aria-pressed={painting && eraser}
          title={shortcut(t('Radierer'), canvasKeys.eraser)}
          hidden={!inpaint && !paintBrush}
          onClick={() => onEraser(true)}
        />
      </div>
      <div
        id="brush-tools"
        className="canvas-tool-group"
        role="group"
        aria-label={t('Pinselgröße')}
        hidden={!inpaint && !paintBrush}
      >
        <label
          className="brush-range"
          title={
            shortcut(t('Pinselgröße'), canvasKeys.smallerBrush + ' / ' + canvasKeys.largerBrush) +
            ' · ' +
            t('Strg + Mausrad auf der Bildfläche')
          }
        >
          <span className="sr-only">{t('Pinselgröße')}</span>
          <input
            id="brush-size"
            type="range"
            aria-keyshortcuts={canvasKeys.smallerBrush + ' ' + canvasKeys.largerBrush}
            min={brushLimits.min}
            max={brushLimits.max}
            value={brushSize}
            onChange={(event) => onBrush(event.currentTarget.valueAsNumber)}
          />
          <output id="brush-value" aria-hidden="true">
            {brushSize} px
          </output>
        </label>
      </div>
      <div className="canvas-tool-group" role="group" aria-label={t('Zeichenebene')} hidden={create}>
        <Button
          id="add-drawing"
          className="icon"
          icon="layers"
          aria-label={t('Zeichenebene erstellen')}
          title={t('Zeichenebene erstellen')}
          disabled={hasDrawing}
          onClick={() => onSelectBrush(true)}
        />
        <input
          id="brush-color"
          className="brush-color"
          type="color"
          aria-label={t('Pinselfarbe')}
          title={t('Pinselfarbe')}
          value={brushColor}
          onChange={(event) => onBrushColor(event.currentTarget.value)}
        />
        <Button
          id="delete-drawing"
          className="icon"
          icon="trash"
          aria-label={t('Zeichenebene löschen')}
          title={t('Zeichenebene löschen')}
          disabled={!hasDrawing}
          onClick={onDeleteDrawing}
        />
      </div>
      <div className="canvas-tool-group" role="group" aria-label={t('Maske')} hidden={!inpaint}>
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
          className="icon"
          icon="trash"
          aria-label={t('Maske leeren')}
          aria-keyshortcuts={canvasKeys.clearMask}
          title={shortcut(t('Maske leeren'), canvasKeys.clearMask)}
          disabled={!hasMask}
          onClick={onClearMask}
        />
      </div>
      <div className="canvas-tool-group" role="group" aria-label={t('Bildanpassungen')}>
        <Button
          id="adjust"
          className="icon"
          icon="adjust"
          aria-label={t('Bildanpassungen')}
          aria-keyshortcuts={canvasKeys.adjust}
          aria-pressed={adjusting}
          aria-controls="adjust-panel"
          title={shortcut(t('Bildanpassungen'), canvasKeys.adjust)}
          disabled={!canAdjust}
          onClick={onAdjust}
        />
      </div>
      <div className="canvas-tool-group" role="group" aria-label={t('Startbild')}>
        <Button
          id="variant-baseline"
          className="icon"
          icon="baseline"
          aria-label={t('Als Startbild setzen')}
          aria-keyshortcuts={canvasKeys.baseline}
          title={shortcut(t('Als Startbild setzen'), canvasKeys.baseline)}
          disabled={!canSetBaseline}
          onClick={onBaseline}
        />
      </div>
    </div>
  )
}

/** Zoom and fit, shown in the status bar below the canvas. */
export function ZoomControls({
  zoom,
  onZoom,
  onFit
}: {
  zoom: number
  onZoom: (direction: -1 | 0 | 1) => void
  onFit: () => void
}) {
  const { t } = useTranslation()
  const shortcut = (label: string, key: string) => label + ' (' + key.replace('Shift+', t('Umschalt') + '+') + ')'
  return (
    <div id="zoom-controls" className="zoom-controls" role="group" aria-label={t('Ansicht')}>
      <Button
        id="zoom-out"
        className="icon"
        icon="minus"
        aria-label={t('Verkleinern')}
        aria-keyshortcuts={canvasKeys.zoomOut}
        title={shortcut(t('Verkleinern'), canvasKeys.zoomOut)}
        onClick={() => onZoom(-1)}
      />
      <Button
        id="actual"
        className="zoom-value"
        aria-label={t('{{percent}} % Zoom · Auf 100 % zoomen', { percent: Math.round(zoom * 100) })}
        aria-keyshortcuts={canvasKeys.zoomActual}
        title={
          shortcut(t('Auf 100 % zoomen'), canvasKeys.zoomActual) +
          '\n' +
          t('Mausrad · Zoom   /   Leertaste + Ziehen · Verschieben')
        }
        onClick={() => onZoom(0)}
      >
        {Math.round(zoom * 100)} %
      </Button>
      <Button
        id="zoom-in"
        className="icon"
        icon="plus"
        aria-label={t('Vergrößern')}
        aria-keyshortcuts="plus"
        title={shortcut(t('Vergrößern'), canvasKeys.zoomIn)}
        onClick={() => onZoom(1)}
      />
      <Button
        id="fit"
        className="icon"
        icon="fit"
        aria-label={t('Einpassen')}
        aria-keyshortcuts={canvasKeys.fit}
        title={shortcut(t('Ansicht einpassen'), canvasKeys.fit)}
        onClick={onFit}
      />
    </div>
  )
}

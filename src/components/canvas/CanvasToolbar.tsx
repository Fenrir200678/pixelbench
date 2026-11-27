import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { canvasKeys } from '../../editor/tools.js'
import type { Tool } from '../../types/editor.js'
import { Button } from '../../ui/Button.js'
import { BrushSize, FrameOptions, MaskOptions, PaintOptions, type FrameControls } from './ToolOptions.js'

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
  /** Shortcuts for the generation frame, shown while the frame tool is active. */
  frame?: FrameControls
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
  /** Variant strip controls shown at the left edge of the bar. */
  leading?: ReactNode
  /** Variant actions shown at the right edge of the bar. */
  actions?: ReactNode
}

type Context = 'frame' | 'mask' | 'paint' | undefined

export function CanvasToolbar(props: Props) {
  const { tool, loaded, pan, frameMode, canFrame, painting, paintBrush, eraser, leading, actions } = props
  const { t } = useTranslation()
  const inpaint = tool === 'inpaint'
  // Create and upscale work on the whole image without frames or drawing.
  const create = tool === 'create' || tool === 'upscale'
  const shortcut = (label: string, key: string) => label + ' (' + key.replace('Shift+', t('Umschalt') + '+') + ')'
  let context: Context
  if (frameMode) context = props.frame ? 'frame' : undefined
  else if (painting && paintBrush) context = 'paint'
  else if (painting && inpaint) context = 'mask'

  return (
    <div id="canvas-tools" className="canvas-tools" role="group" aria-label={t('Canvas-Leiste')} hidden={!loaded}>
      <div className="canvas-tool-row">
        <div className="canvas-tool-side">
          <div className="canvas-tool-lead">{leading}</div>
          <div className="canvas-tool-group" role="group" aria-label={t('Canvas-Werkzeuge')}>
            <Button
              id="pan"
              className="icon"
              icon="hand"
              aria-label={t('Hand')}
              aria-keyshortcuts={canvasKeys.hand + ' Space'}
              aria-pressed={pan}
              title={shortcut(t('Hand'), canvasKeys.hand + ' / ' + t('Leertaste'))}
              onClick={props.onPan}
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
              onClick={props.onFrame}
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
              onClick={() => props.onSelectBrush(true)}
            />
            <Button
              id="brush"
              className="icon"
              icon="mask"
              aria-label={t('Maskenpinsel')}
              aria-keyshortcuts={canvasKeys.maskBrush}
              aria-pressed={painting && !paintBrush && !eraser}
              title={
                shortcut(t('Maskenpinsel'), canvasKeys.maskBrush) + ' · ' + t('Rechts gedrückt halten zum Radieren')
              }
              hidden={!inpaint}
              onClick={() => props.onSelectBrush(false)}
            />
            <Button
              id="eraser"
              className="icon"
              icon="eraser"
              aria-label={t('Radierer')}
              aria-keyshortcuts={canvasKeys.eraser}
              aria-pressed={painting && eraser}
              title={shortcut(t('Radierer'), canvasKeys.eraser)}
              // Stays visible so the tool buttons keep their place when the paint brush is off.
              disabled={!inpaint && !paintBrush}
              hidden={create}
              onClick={() => props.onEraser(true)}
            />
          </div>
        </div>
        <div id="tool-options" className="canvas-tool-options" role="group" aria-label={t('Werkzeugoptionen')}>
          <ToolContext context={context} {...props} />
        </div>
        <div className="canvas-tool-side end">
          <div className="canvas-tool-group" role="group" aria-label={t('Bild')}>
            <Button
              id="adjust"
              className="icon"
              icon="adjust"
              aria-label={t('Bildanpassungen')}
              aria-keyshortcuts={canvasKeys.adjust}
              aria-pressed={props.adjusting}
              aria-controls="adjust-panel"
              title={shortcut(t('Bildanpassungen'), canvasKeys.adjust)}
              disabled={!props.canAdjust}
              onClick={props.onAdjust}
            />
            <Button
              id="variant-baseline"
              className="icon"
              icon="baseline"
              aria-label={t('Als Startbild setzen')}
              aria-keyshortcuts={canvasKeys.baseline}
              title={shortcut(t('Als Startbild setzen'), canvasKeys.baseline)}
              disabled={!props.canSetBaseline}
              onClick={props.onBaseline}
            />
          </div>
          <div className="canvas-tool-actions" role="group" aria-label={t('Übernehmen')}>
            {actions}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Options of the active canvas tool. Only one tool's options are shown at a time. */
function ToolContext({ context, ...props }: Props & { context: Context }) {
  const { t } = useTranslation()
  if (context === 'frame' && props.frame) return <FrameOptions frame={props.frame} />
  if (context === 'paint')
    return (
      <>
        <BrushSize size={props.brushSize} onSize={props.onBrush} />
        <PaintOptions
          color={props.brushColor}
          hasDrawing={props.hasDrawing}
          onColor={props.onBrushColor}
          onDelete={props.onDeleteDrawing}
        />
      </>
    )
  if (context === 'mask')
    return (
      <>
        <BrushSize size={props.brushSize} onSize={props.onBrush} />
        <MaskOptions
          showMask={props.showMask}
          canToggleMask={props.canToggleMask}
          hasMask={props.hasMask}
          onToggleMask={props.onToggleMask}
          onClearMask={props.onClearMask}
        />
      </>
    )
  // The slot is never empty: tools without options explain what they do instead.
  const hint = props.pan ? t('Ziehen zum Verschieben, Mausrad zum Zoomen') : t('Kein Werkzeug gewählt')
  return (
    <span className="tool-option-hint" title={hint}>
      {hint}
    </span>
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

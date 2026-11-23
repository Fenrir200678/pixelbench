import { useTranslation } from 'react-i18next'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction
} from 'react'
import { fitView, sizeLabel } from '../../editor/geometry.js'
import { brushLimits } from '../../editor/tools.js'
import { useCanvasGestures } from '../../hooks/useCanvasGestures.js'
import type { Drawing, Mask } from '../../image/mask.js'
import { clamp, expandedRect } from '../../image/pixels.js'
import { Viewport } from '../../image/viewport.js'
import type { Tool, Work } from '../../types/editor.js'
import type { Detection, Frame, Margins, Rect, Stroke } from '../../types/image.js'
import { Button } from '../../ui/Button.js'
import { Icon } from '../../ui/Icon.js'

type Props = {
  viewRef: RefObject<Viewport | null>
  work?: Work
  original?: Frame
  /** Drawn in place of the open image, such as the live adjustment preview. */
  preview?: CanvasImageSource
  /** Floating content over the canvas, such as the adjustment panel. */
  overlay?: ReactNode
  createSize?: [number, number]
  candidate?: Frame
  compareSource?: Frame
  // Detailer boxes of the shown variant.
  detections?: Detection[]
  /** Before/after state of the shown variant. Undefined when the variant has no source to compare with. */
  compare?: { before: boolean; onChange: (before: boolean) => void }
  stageMode?: string
  mask?: Mask
  drawing?: Drawing
  brushColor?: string
  tool: Tool
  crop?: Rect
  grid: number
  frameRatio?: number
  frameMode: boolean
  pan: boolean
  eraser: boolean
  brushSize: number
  opacity: number
  showMask: boolean
  openDisabled: boolean
  onStroke: (stroke: Stroke, layer: Mask | Drawing) => void
  onMargins: (next: Margins) => void
  onCrop: (next: Rect) => void
  onBrush: Dispatch<SetStateAction<number>>
  onZoomChanged: (scale: number) => void
  onRevealMask: () => void
  onOpen: () => void
  onDrop: (file: File) => void
}

export function CanvasStage({
  viewRef,
  work,
  original,
  preview,
  overlay,
  createSize,
  candidate,
  compareSource,
  detections,
  compare,
  stageMode,
  mask,
  drawing,
  brushColor,
  tool,
  crop,
  grid,
  frameRatio,
  frameMode,
  pan,
  eraser,
  brushSize,
  opacity,
  showMask,
  openDisabled,
  onStroke,
  onMargins,
  onCrop,
  onBrush,
  onZoomChanged,
  onRevealMask,
  onOpen,
  onDrop
}: Props) {
  const { t } = useTranslation()
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const lastFitted = useRef<Frame>(undefined)
  const [dropping, setDropping] = useState(false)
  const image = work?.image
  const hasBrush = Boolean(image && (tool === 'inpaint' || (brushColor && drawing)))
  const hasMask = Boolean(work?.strokes.length)
  const canPaint = hasBrush && !candidate
  const maskOverlay = tool === 'inpaint' && canPaint && showMask ? mask?.surface : undefined
  const gestures = useCanvasGestures(viewRef, {
    work,
    candidate,
    mask,
    drawing,
    brushColor,
    tool,
    crop,
    grid,
    frameRatio,
    frameMode,
    pan,
    eraser,
    brushSize,
    onRevealMask: tool === 'inpaint' && !brushColor && hasMask && (!canPaint || !showMask) ? onRevealMask : undefined,
    onStroke,
    onMargins,
    onCrop
  })
  const brushErase = eraser || gestures.rightErasing

  useLayoutEffect(() => {
    const viewport = new Viewport(canvas.current!, onZoomChanged)
    viewRef.current = viewport
    return () => {
      viewRef.current = null
      lastFitted.current = undefined
      viewport.destroy()
    }
  }, [viewRef, onZoomChanged])

  const margins = work?.margins
  const showCrop = Boolean(
    !candidate &&
    tool !== 'outpaint' &&
    tool !== 'create' &&
    tool !== 'upscale' &&
    (frameMode || work?.crop || (tool === 'inpaint' && hasMask))
  )
  useLayoutEffect(() => {
    const outpaintBox = !candidate && image && margins && tool === 'outpaint' ? expandedRect(image, margins) : undefined
    viewRef.current?.set({
      image: candidate ?? image,
      preview: candidate ? undefined : preview,
      original: compareSource,
      detections,
      box:
        outpaintBox ?? (showCrop && crop && image ? { ...crop, x: image.x + crop.x, y: image.y + crop.y } : undefined),
      cropFrame: showCrop,
      editBox: !pan && Boolean((outpaintBox && !brushColor) || (showCrop && frameMode)),
      mask: maskOverlay,
      drawing: candidate ? undefined : drawing,
      opacity: opacity / 100,
      brush:
        canPaint && !frameMode
          ? { size: brushSize, erase: brushErase, color: brushColor, area: outpaintBox }
          : undefined,
      pan
    })
  }, [
    viewRef,
    image,
    preview,
    margins,
    candidate,
    compareSource,
    detections,
    tool,
    crop,
    showCrop,
    frameMode,
    maskOverlay,
    drawing,
    brushColor,
    opacity,
    canPaint,
    brushSize,
    brushErase,
    pan
  ])

  // Center a newly opened image once it is shown. In Create without a template, wait until it appears.
  useLayoutEffect(() => {
    if (original && work && original !== lastFitted.current) {
      lastFitted.current = original
      fitView(viewRef.current, tool, work)
    }
  }, [viewRef, original, tool, work])

  // Created variants have no document to fit to. Refit when the result size changes.
  const candidateSize = !work && candidate ? candidate.w + 'x' + candidate.h : undefined
  useLayoutEffect(() => {
    if (candidateSize) fitView(viewRef.current, tool, undefined, candidate)
    // Selecting another variant of the same size keeps the zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRef, candidateSize])

  const hasImage = Boolean(image || candidate)
  useEffect(() => {
    if (!hasImage) return
    const element = stage.current!
    function wheel(event: WheelEvent) {
      const viewport = viewRef.current
      if (!viewport) return
      event.preventDefault()
      const at = viewport.point(event)
      const delta = -event.deltaY * (event.deltaMode === 1 ? 0.065 : 0.0017)
      if (hasBrush && !frameMode && event.ctrlKey && event.target === viewport.element) {
        if (delta === 0) return
        viewport.updateCursor(at)
        onBrush((size) => {
          const next = Math.round(size * Math.exp(delta))
          const changed = next === size ? size + Math.sign(delta) : next
          return clamp(changed, brushLimits.min, brushLimits.max)
        })
        return
      }
      viewport.zoom(viewport.scale * Math.exp(delta), at)
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [viewRef, hasImage, hasBrush, frameMode, onBrush])

  const modeLabel = showCrop && crop ? t('Generierungsrahmen') + ' · ' + sizeLabel(crop.w, crop.h) + ' px' : stageMode

  return (
    <div
      id="stage"
      className="stage"
      ref={stage}
      onContextMenu={(event) => event.preventDefault()}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setDropping(true)
      }}
      onDragLeave={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget))
          setDropping(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDropping(false)
        const file = event.dataTransfer.files[0]
        if (file) onDrop(file)
      }}
    >
      <canvas
        id="stage-canvas"
        ref={canvas}
        tabIndex={0}
        aria-label={t('Bildfläche zum Zeichnen und Maskieren')}
        {...gestures.handlers}
      />
      {createSize && !candidate && (
        <div id="create-empty" className="empty">
          <div
            className="empty-glyph create-frame"
            style={{
              width: Math.round(200 * Math.min(1, createSize[0] / createSize[1])),
              height: Math.round(200 * Math.min(1, createSize[1] / createSize[0]))
            }}
          >
            <span className="corners" />
            <Icon name="create" />
          </div>
          <h1>{t('Neues Bild erstellen')}</h1>
          <p>
            {t('Beschreibe das Bild rechts im Prompt und starte die Generierung.')}{' '}
            {t('Oder zieh ein Bild hierher, um es als Vorlage für Img2Img zu nutzen.')}
          </p>
          <Button className="secondary" icon="folder" disabled={openDisabled} onClick={onOpen}>
            {' '}
            {t('Vorlage öffnen')}
          </Button>
          <small>{sizeLabel(...createSize)} px</small>
        </div>
      )}
      <div id="empty" className="empty" hidden={hasImage || Boolean(createSize)}>
        <div className="empty-glyph">
          <span className="corners" />
          <Icon name="image" />
        </div>
        <h1>{t('Ein Bild öffnen')}</h1>
        <p>{t('Ziehe dein Bild hierher oder wähle eine Datei.')}</p>
        <Button id="empty-open" className="secondary" icon="folder" disabled={openDisabled} onClick={onOpen}>
          {' '}
          {t('Datei auswählen')}
        </Button>
        <small>{t('PNG, JPG oder WebP')}</small>
      </div>
      <div id="drop-overlay" className="drop-overlay" hidden={!dropping}>
        {t('Bild hier ablegen')}
      </div>
      <div id="stage-mode" className="stage-mode" hidden={!modeLabel}>
        {modeLabel}
      </div>
      {overlay}
      {compare && (
        <div id="compare-state" className="compare-state" role="group" aria-label={t('Vorher / Nachher')}>
          <button
            type="button"
            aria-pressed={compare.before}
            title={t('Vorher anzeigen (V)')}
            onClick={() => compare.onChange(true)}
          >
            {t('Vorher')}
          </button>
          <button
            type="button"
            aria-pressed={!compare.before}
            title={t('Nachher anzeigen (V)')}
            onClick={() => compare.onChange(false)}
          >
            {t('Nachher')}
          </button>
          <kbd aria-hidden="true">V</kbd>
        </div>
      )}
    </div>
  )
}

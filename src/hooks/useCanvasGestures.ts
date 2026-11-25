import { useRef, useState, type PointerEvent } from 'react'
import { dragCrop, dragMargins } from '../editor/geometry.js'
import type { Drawing, Mask } from '../image/mask.js'
import { clamp, expandedRect, validSize } from '../image/pixels.js'
import type { Handle, Viewport } from '../image/viewport.js'
import type { Tool, Work } from '../types/editor.js'
import type { Frame, Margins, Point, Rect, Stroke } from '../types/image.js'

type Drag =
  | { kind: 'pan'; last: Point; revealOnClick: boolean }
  | { kind: 'brush'; stroke: Stroke; layer: Mask | Drawing; area: Rect }
  | { kind: 'frame'; handle: Handle | 'move'; start: Point; margins: Margins }
  | { kind: 'crop'; handle: Handle | 'move'; start: Point; crop: Rect }

type Options = {
  work?: Work
  candidate?: Frame
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
  onRevealMask?: () => void
  onStroke: (stroke: Stroke, layer: Mask | Drawing) => void
  onMargins: (margins: Margins) => void
  onCrop: (crop: Rect) => void
}

export function useCanvasGestures(viewRef: React.RefObject<Viewport | null>, options: Options) {
  const drag = useRef<{ pointer: number; work: Frame; action: Drag }>(undefined)
  const [rightErasing, setRightErasing] = useState(false)
  const {
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
    onRevealMask,
    onStroke,
    onMargins,
    onCrop
  } = options

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const view = viewRef.current
    const rightErase =
      event.button === 2 && (Boolean(brushColor) || tool === 'inpaint') && !frameMode && !pan && !candidate
    // Created variants have no document. The canvas can only be panned then.
    const image = work?.image ?? candidate
    if (!view || !image || drag.current || (event.button !== 0 && event.button !== 1 && !rightErase)) return
    const at = view.point(event.nativeEvent)
    const point = view.world(at)
    let action: Drag | undefined
    const revealOnClick = event.button === 0 && Boolean(onRevealMask)
    if (
      !work ||
      event.button === 1 ||
      pan ||
      candidate ||
      (!frameMode && !brushColor && (tool === 'edit' || revealOnClick))
    ) {
      action = { kind: 'pan', last: at, revealOnClick }
      view.setPanning(true)
    } else if (tool === 'outpaint' && !brushColor) {
      const handle = view.handle(at) ?? (view.canMoveBox(at) ? 'move' : undefined)
      if (handle) action = { kind: 'frame', handle, start: point, margins: work.margins }
    } else if (frameMode && crop) {
      const handle = view.handle(at) ?? (view.canMoveBox(at) ? 'move' : undefined)
      if (handle) action = { kind: 'crop', handle, start: point, crop }
    } else if (!frameMode) {
      const layer = brushColor ? drawing : mask
      const area = tool === 'outpaint' ? expandedRect(image, work.margins) : image
      if (!layer || point.x < area.x || point.x >= area.x + area.w || point.y < area.y || point.y >= area.y + area.h)
        return
      const stroke = {
        erase: eraser || rightErase,
        size: brushSize,
        color: brushColor,
        points: [{ x: point.x - image.x, y: point.y - image.y }]
      }
      action = { kind: 'brush', stroke, layer, area }
      if (rightErase) {
        setRightErasing(true)
        onRevealMask?.()
      }
      layer.paint(stroke, 0)
      view.invalidate()
    }
    if (!action) return
    drag.current = { pointer: event.pointerId, work: image, action }
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const view = viewRef.current
    if (!view) return
    const at = view.point(event.nativeEvent)
    view.updateCursor(at)
    const active = drag.current
    if (!active || active.pointer !== event.pointerId || active.work !== (work?.image ?? candidate)) return
    const { action } = active
    if (action.kind === 'pan') {
      const dx = at.x - action.last.x
      const dy = at.y - action.last.y
      if (action.revealOnClick && Math.hypot(dx, dy) < 4) return
      action.revealOnClick = false
      view.move(dx, dy)
      action.last = at
      return
    }
    if (!work) return
    const point = view.world(at)
    const { image } = work
    if (action.kind === 'brush') {
      const { stroke, area } = action
      stroke.points.push({
        x: clamp(point.x, area.x - stroke.size, area.x + area.w + stroke.size) - image.x,
        y: clamp(point.y, area.y - stroke.size, area.y + area.h + stroke.size) - image.y
      })
      action.layer.paint(stroke, stroke.points.length - 1)
      view.invalidate()
    } else if (action.kind === 'crop' && crop) {
      const next = dragCrop(
        image,
        action.crop,
        action.handle,
        Math.round(point.x - action.start.x),
        Math.round(point.y - action.start.y),
        grid,
        frameRatio
      )
      if (next.x !== crop.x || next.y !== crop.y || next.w !== crop.w || next.h !== crop.h) onCrop(next)
    } else if (action.kind === 'frame') {
      const dx = Math.round(point.x - action.start.x),
        dy = Math.round(point.y - action.start.y)
      const next = dragMargins(image, action.margins, action.handle, dx, dy, frameRatio, grid)
      const { w, h } = expandedRect(image, next)
      if (validSize(w, h)) onMargins(next)
    }
  }

  function finish(event: PointerEvent<HTMLCanvasElement>) {
    const active = drag.current
    if (!active || active.pointer !== event.pointerId) return
    drag.current = undefined
    setRightErasing(false)
    const { action } = active
    if (action.kind === 'brush' && active.work === work?.image && (action.layer === mask || action.layer === drawing))
      onStroke(action.stroke, action.layer)
    if (action.kind === 'pan') {
      viewRef.current?.setPanning(false)
      if (action.revealOnClick && event.type === 'pointerup' && active.work === work?.image) onRevealMask?.()
    }
  }

  return {
    rightErasing,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
      onPointerLeave: () => viewRef.current?.updateCursor()
    }
  }
}

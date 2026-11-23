import type { Detection, Frame, Point, Rect } from '../types/image.js'
import { canvas, context2d, surface } from './canvas.js'
import type { Drawing } from './mask.js'
import { drawDetections } from './detections.js'
import { clamp } from './pixels.js'

export type Handle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
export type Presentation = {
  image?: Frame
  // Drawn in place of the image at its position and size, such as the live adjustment preview.
  preview?: CanvasImageSource
  original?: Frame
  box?: Rect
  cropFrame?: boolean
  editBox?: boolean
  mask?: HTMLCanvasElement
  drawing?: Drawing
  opacity?: number
  brush?: { size: number; erase: boolean; color?: string; area?: Rect }
  pan: boolean
  // Detailer boxes in image pixels.
  detections?: Detection[]
}

// Canvas colors come from the design tokens in style/tokens.css, so themes also restyle the stage drawing.
const themeTokens = {
  checkerA: '--canvas-checker-a',
  checkerB: '--canvas-checker-b',
  frame: '--canvas-frame',
  frameActive: '--canvas-frame-active',
  selection: '--canvas-selection',
  selectionSoft: '--canvas-selection-soft',
  selectionHalo: '--canvas-selection-halo',
  handleFill: '--canvas-handle-fill',
  handleStroke: '--canvas-handle-stroke',
  cursorHalo: '--canvas-cursor-halo',
  cursor: '--canvas-cursor',
  cursorErase: '--canvas-cursor-erase',
  detection: '--canvas-detection',
  detectionText: '--canvas-detection-text',
  font: '--font-mono'
} as const
type CanvasTheme = Record<keyof typeof themeTokens, string>

function readTheme(element: Element): CanvasTheme {
  const style = getComputedStyle(element)
  return Object.fromEntries(
    Object.entries(themeTokens).map(([key, token]) => [key, style.getPropertyValue(token).trim() || '#808080'])
  ) as CanvasTheme
}

export class Viewport {
  scale = 1
  offset: Point = { x: 0, y: 0 }
  private cursor?: Point
  private animation?: number
  private readonly observer: ResizeObserver
  private presentation: Presentation = { pan: false }
  private dragging = false
  private checker?: CanvasPattern
  private checkerColors = ''
  private context: CanvasRenderingContext2D

  constructor(
    readonly element: HTMLCanvasElement,
    private zoomChanged: (scale: number) => void
  ) {
    this.context = context2d(element)
    this.observer = new ResizeObserver(() => this.invalidate())
    this.observer.observe(element)
  }

  destroy() {
    this.observer.disconnect()
    if (this.animation !== undefined) cancelAnimationFrame(this.animation)
  }

  set(presentation: Presentation) {
    this.presentation = presentation
    if (this.cursor) this.updateCursor(this.cursor)
    else this.updateCursor()
    this.invalidate()
  }

  setPanning(dragging: boolean) {
    this.dragging = dragging
    this.updateCursor(this.cursor)
  }

  fit(rect: Rect) {
    const width = this.element.clientWidth,
      height = this.element.clientHeight
    const room = Math.min(width, height) > 450 ? 100 : 68
    this.scale = Math.min(1, (width - room) / rect.w, (height - room) / rect.h)
    this.scale = Math.max(0.015, this.scale)
    this.offset = {
      x: (width - rect.w * this.scale) / 2 - rect.x * this.scale,
      y: (height - rect.h * this.scale) / 2 - rect.y * this.scale
    }
    this.zoomChanged(this.scale)
    this.invalidate()
  }

  zoom(next: number, pivot = { x: this.element.clientWidth / 2, y: this.element.clientHeight / 2 }) {
    const at = this.world(pivot)
    this.scale = clamp(next, 0.015, 24)
    this.offset = { x: pivot.x - at.x * this.scale, y: pivot.y - at.y * this.scale }
    this.zoomChanged(this.scale)
    this.invalidate()
  }

  move(dx: number, dy: number) {
    this.offset.x += dx
    this.offset.y += dy
    this.invalidate()
  }

  screen(point: Point): Point {
    return { x: point.x * this.scale + this.offset.x, y: point.y * this.scale + this.offset.y }
  }

  world(point: Point): Point {
    return { x: (point.x - this.offset.x) / this.scale, y: (point.y - this.offset.y) / this.scale }
  }

  point(event: MouseEvent): Point {
    const box = this.element.getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }

  handle(point: Point): Handle | undefined {
    const { box, editBox } = this.presentation
    if (!box || !editBox) return
    for (const [key, p] of this.handles(box)) {
      if (Math.abs(point.x - p.x) <= 9 && Math.abs(point.y - p.y) <= 9) return key
    }
  }

  canMoveBox(point: Point) {
    const { box, cropFrame, editBox } = this.presentation
    return Boolean(box && cropFrame && editBox && this.inside(point, box))
  }

  updateCursor(p?: Point) {
    this.cursor = p
    const handle = p && this.handle(p)
    this.element.style.cursor =
      this.presentation.pan || this.dragging
        ? 'grab'
        : handle
          ? handle + '-resize'
          : p && this.canMoveBox(p)
            ? 'move'
            : p && this.presentation.brush && this.inside(p, this.presentation.brush.area)
              ? 'none'
              : 'default'
    this.invalidate()
  }

  invalidate() {
    if (this.animation !== undefined) return
    this.animation = requestAnimationFrame(() => {
      this.animation = undefined
      this.draw()
    })
  }

  private inside(p: Point, rect: Rect | undefined = this.presentation.image) {
    if (!rect) return false
    const { x, y } = this.world(p)
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
  }

  private handles(box: Rect): [Handle, Point][] {
    const { x, y } = this.screen(box)
    const w = box.w * this.scale,
      h = box.h * this.scale
    return [
      ['nw', { x, y }],
      ['n', { x: x + w / 2, y }],
      ['ne', { x: x + w, y }],
      ['w', { x, y: y + h / 2 }],
      ['e', { x: x + w, y: y + h / 2 }],
      ['sw', { x, y: y + h }],
      ['s', { x: x + w / 2, y: y + h }],
      ['se', { x: x + w, y: y + h }]
    ]
  }

  private checkerPattern(theme: CanvasTheme) {
    const colors = theme.checkerA + theme.checkerB
    if (!this.checker || colors !== this.checkerColors) {
      const tile = canvas(16, 16)
      const context = context2d(tile)
      context.fillStyle = theme.checkerA
      context.fillRect(0, 0, 16, 16)
      context.fillStyle = theme.checkerB
      context.fillRect(0, 0, 8, 8)
      context.fillRect(8, 8, 8, 8)
      this.checker = this.context.createPattern(tile, 'repeat')!
      this.checkerColors = colors
    }
    return this.checker
  }

  private draw() {
    const c = this.element,
      ctx = this.context,
      dpr = window.devicePixelRatio
    const W = Math.round(c.clientWidth * dpr),
      H = Math.round(c.clientHeight * dpr)
    if (c.width !== W || c.height !== H) {
      c.width = W
      c.height = H
    }
    const { image, preview, original, box, cropFrame, editBox, mask, drawing, opacity, brush, pan, detections } =
      this.presentation
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, c.clientWidth, c.clientHeight)
    if (!image) return
    const theme = readTheme(c)
    const checker = this.checkerPattern(theme)
    const frame = !cropFrame && box ? box : image
    const start = this.screen(frame)
    ctx.fillStyle = checker
    ctx.fillRect(start.x, start.y, frame.w * this.scale, frame.h * this.scale)
    this.drawImage(image, preview)
    if (drawing) {
      const { x, y, w, h } = drawing.area
      const p = this.screen({ x: image.x + x, y: image.y + y })
      ctx.save()
      ctx.beginPath()
      ctx.rect(start.x, start.y, frame.w * this.scale, frame.h * this.scale)
      ctx.clip()
      ctx.drawImage(drawing.surface, p.x, p.y, w * this.scale, h * this.scale)
      ctx.restore()
    }
    // Before/after shows the source in full, so switching is an instant flip instead of a split.
    if (original) {
      ctx.fillStyle = checker
      ctx.fillRect(start.x, start.y, frame.w * this.scale, frame.h * this.scale)
      this.drawImage(original)
    }
    if (mask && opacity) {
      const p = this.screen(image)
      ctx.globalAlpha = opacity
      ctx.drawImage(mask, p.x, p.y, image.w * this.scale, image.h * this.scale)
      ctx.globalAlpha = 1
    }
    ctx.lineWidth = 1
    ctx.strokeStyle = box && !cropFrame ? theme.frameActive : theme.frame
    ctx.strokeRect(start.x - 0.5, start.y - 0.5, frame.w * this.scale + 1, frame.h * this.scale + 1)
    if (box) {
      const outline = cropFrame ? box : image
      const outlineStart = this.screen(outline)
      ctx.setLineDash(cropFrame ? [6, 4] : [4, 4])
      if (cropFrame) {
        ctx.strokeStyle = theme.selectionHalo
        ctx.lineWidth = 3
        ctx.strokeRect(outlineStart.x, outlineStart.y, outline.w * this.scale, outline.h * this.scale)
        ctx.lineWidth = 1
      }
      ctx.strokeStyle = cropFrame ? theme.selection : theme.selectionSoft
      ctx.strokeRect(outlineStart.x, outlineStart.y, outline.w * this.scale, outline.h * this.scale)
      ctx.setLineDash([])
      for (const [, p] of editBox && !pan ? this.handles(box) : []) {
        ctx.fillStyle = theme.handleFill
        ctx.fillRect(p.x - 4, p.y - 4, 8, 8)
        ctx.strokeStyle = theme.handleStroke
        ctx.strokeRect(p.x - 4, p.y - 4, 8, 8)
      }
    }
    if (detections?.length) {
      const { detection, detectionText, selectionHalo, font } = theme
      const style = { box: detection, halo: selectionHalo, label: detection, text: detectionText, font }
      drawDetections(ctx, detections, this.screen(image), this.scale, style)
    }
    if (brush && !pan && !this.dragging && this.cursor && this.inside(this.cursor, brush.area)) {
      const { x, y } = this.cursor,
        radius = Math.max(1, (brush.size * this.scale) / 2)
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.strokeStyle = theme.cursorHalo
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.strokeStyle = brush.erase ? theme.cursorErase : (brush.color ?? theme.cursor)
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x - 3, y)
      ctx.lineTo(x + 3, y)
      ctx.moveTo(x, y - 3)
      ctx.lineTo(x, y + 3)
      ctx.stroke()
    }
  }

  private drawImage(image: Frame, source: CanvasImageSource = surface(image)) {
    const p = this.screen(image)
    this.context.imageSmoothingEnabled = this.scale < 2
    this.context.drawImage(source, p.x, p.y, image.w * this.scale, image.h * this.scale)
  }
}

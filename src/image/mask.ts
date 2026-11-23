import type { Rect, Stroke } from '../types/image.js'
import { canvas } from './canvas.js'
import { bounds } from './pixels.js'

export class PaintLayer {
  readonly surface: HTMLCanvasElement
  readonly context: CanvasRenderingContext2D

  constructor(
    readonly w: number,
    readonly h: number,
    strokes: Stroke[],
    x = 0,
    y = 0,
    willReadFrequently = false
  ) {
    this.surface = canvas(w, h)
    this.context = this.surface.getContext('2d', { willReadFrequently })!
    this.context.translate(-x, -y)
    for (const s of strokes) {
      if (s.mask) this.paint(s, 0)
      for (let i = 0; i < s.points.length; i++) this.paint(s, i)
    }
  }

  paint(stroke: Stroke, index: number) {
    const c = this.context
    if (stroke.mask) {
      c.drawImage(stroke.mask, 0, 0)
      return
    }
    c.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over'
    c.lineWidth = stroke.size
    c.lineCap = 'round'
    c.fillStyle = c.strokeStyle = stroke.color ?? '#ff7687'
    const point = stroke.points[index]
    c.beginPath()
    if (index === 0) {
      c.arc(point.x, point.y, stroke.size / 2, 0, Math.PI * 2)
      c.fill()
    } else {
      const prev = stroke.points[index - 1]
      c.moveTo(prev.x, prev.y)
      c.lineTo(point.x, point.y)
      c.stroke()
    }
    c.globalCompositeOperation = 'source-over'
  }
}

// A painted mask from a binary one, in the brush color, so it can be erased and extended like strokes.
export function maskStroke(alpha: Uint8ClampedArray, w: number, h: number): Stroke {
  const surface = canvas(w, h)
  const data = new ImageData(w, h)
  for (let i = 0; i < alpha.length; i++) {
    if (!alpha[i]) continue
    const p = i * 4
    data.data.set([0xff, 0x76, 0x87, alpha[i]], p)
  }
  surface.getContext('2d')!.putImageData(data, 0, 0)
  return { erase: false, size: 0, points: [], mask: surface }
}

export class Mask extends PaintLayer {
  private cached?: { alpha: Uint8ClampedArray; box?: Rect }

  constructor(w: number, h: number, strokes: Stroke[]) {
    super(w, h, strokes, 0, 0, true)
  }

  override paint(stroke: Stroke, index: number) {
    this.cached = undefined
    super.paint(stroke, index)
  }

  get() {
    if (!this.cached) {
      const pixels = this.context.getImageData(0, 0, this.w, this.h).data
      const alpha = new Uint8ClampedArray(this.w * this.h)
      for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3]
      this.cached = { alpha, box: bounds(alpha, this.w, this.h) }
    }
    return this.cached
  }
}

export class Drawing extends PaintLayer {
  constructor(
    readonly area: Rect,
    strokes: Stroke[]
  ) {
    super(area.w, area.h, strokes, area.x, area.y)
  }
}

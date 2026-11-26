import type { Rect } from '../types/image.js'

/** A YOLO detection in image pixels with its class index. */
export type YoloBox = Rect & { score: number; label: number }
/** Where the image sits in the square model input: its scale and the gray margins on the left and top. */
export type Letterbox = { size: number; scale: number; x: number; y: number }

// Ultralytics' letterbox: the image scaled to fit the square input, centered between gray margins.
export function letterbox(w: number, h: number, size: number): Letterbox {
  const scale = Math.min(size / w, size / h)
  return { size, scale, x: (size - w * scale) / 2, y: (size - h * scale) / 2 }
}

function overlap(a: Rect, b: Rect) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (w <= 0 || h <= 0) return 0
  return (w * h) / (a.w * a.h + b.w * b.h - w * h)
}

// Non-maximum suppression: of overlapping boxes with the same class, only the best one stays.
export function suppress(boxes: YoloBox[], limit = 0.45) {
  const kept: YoloBox[] = []
  for (const box of [...boxes].sort((a, b) => b.score - a.score))
    if (kept.every((other) => other.label !== box.label || overlap(other, box) <= limit)) kept.push(box)
  return kept
}

/**
 * Boxes in image pixels from a YOLO detection output, best first. Two layouts exist: [1, 4 + classes, anchors] with
 * center boxes and one score per class (YOLOv8, YOLO11), which needs suppression, and [1, detections, 6] with
 * corners, score and class (YOLOv10, YOLO26 and exports with built-in NMS).
 */
export function decodeYolo(
  data: ArrayLike<number>,
  dims: readonly number[],
  fit: Letterbox,
  image: { w: number; h: number },
  threshold: number
): YoloBox[] {
  if (dims.length !== 3 || dims[0] !== 1) throw new Error('Unbekanntes Ausgabeformat des YOLO-Modells.')
  const boxes: YoloBox[] = []
  const add = (x1: number, y1: number, x2: number, y2: number, score: number, label: number) => {
    const left = Math.max(0, (x1 - fit.x) / fit.scale)
    const top = Math.max(0, (y1 - fit.y) / fit.scale)
    const right = Math.min(image.w, (x2 - fit.x) / fit.scale)
    const bottom = Math.min(image.h, (y2 - fit.y) / fit.scale)
    if (right - left >= 1 && bottom - top >= 1)
      boxes.push({ x: left, y: top, w: right - left, h: bottom - top, score, label })
  }
  if (dims[2] === 6) {
    for (let row = 0; row < dims[1]; row++) {
      const at = row * 6
      if (data[at + 4] >= threshold)
        add(data[at], data[at + 1], data[at + 2], data[at + 3], data[at + 4], Math.round(data[at + 5]))
    }
    return boxes.sort((a, b) => b.score - a.score)
  }
  const [, channels, anchors] = dims
  if (channels < 5) throw new Error('Unbekanntes Ausgabeformat des YOLO-Modells.')
  for (let anchor = 0; anchor < anchors; anchor++) {
    let score = 0
    let label = 0
    for (let channel = 4; channel < channels; channel++) {
      const value = data[channel * anchors + anchor]
      if (value > score) {
        score = value
        label = channel - 4
      }
    }
    if (score < threshold) continue
    const cx = data[anchor]
    const cy = data[anchors + anchor]
    const w = data[2 * anchors + anchor]
    const h = data[3 * anchors + anchor]
    add(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, score, label)
  }
  return suppress(boxes)
}

/** At most limit boxes per class, the best ones. The input is sorted best first. */
export function bestPerClass(boxes: YoloBox[], limit: number) {
  const counts = new Map<number, number>()
  return boxes.filter((box) => {
    const count = counts.get(box.label) ?? 0
    counts.set(box.label, count + 1)
    return count < limit
  })
}

/** A filled rectangle as a binary mask, like ADetailer's masks for box models. */
export function boxMask(box: Rect, w: number, h: number) {
  const mask = new Uint8ClampedArray(w * h)
  const left = Math.max(0, Math.floor(box.x))
  const right = Math.min(w, Math.ceil(box.x + box.w))
  const top = Math.max(0, Math.floor(box.y))
  const bottom = Math.min(h, Math.ceil(box.y + box.h))
  for (let y = top; y < bottom; y++) mask.fill(255, y * w + left, y * w + right)
  return mask
}

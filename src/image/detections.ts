import type { Detection, Point, Rect } from '../types/image.js'

export type DetectionStyle = { box: string; halo: string; label: string; text: string; font: string }

const tagHeight = 16
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

// The first free spot for a tag: above the box, right-aligned above it, inside its top, below it.
// When all of them collide with earlier tags, the tag stacks upward above the box.
export function placeTag(box: Rect, width: number, placed: Rect[]): Rect {
  const above = box.y - tagHeight
  const candidates = [
    { x: box.x, y: above },
    { x: box.x + box.w - width, y: above },
    { x: box.x, y: box.y },
    { x: box.x, y: box.y + box.h }
  ]
    .filter((spot) => spot.y >= 0)
    .map((spot) => ({ ...spot, w: width, h: tagHeight }))
  const free = candidates.find((tag) => placed.every((other) => !overlaps(tag, other)))
  if (free) return free
  const tag = { x: box.x, y: Math.max(0, above), w: width, h: tagHeight }
  while (placed.some((other) => overlaps(tag, other)) && tag.y >= tagHeight) tag.y -= tagHeight
  return tag
}

// Detailer boxes on the stage, like ADetailer's preview: a frame per object and a tag with term and score.
// origin: the screen position of the image's top left corner. scale: screen pixels per image pixel.
export function drawDetections(
  ctx: CanvasRenderingContext2D,
  detections: Detection[],
  origin: Point,
  scale: number,
  style: DetectionStyle
) {
  ctx.save()
  ctx.font = '600 11px ' + style.font
  ctx.textBaseline = 'middle'
  const boxes = detections.map(({ x, y, w, h }) => ({
    x: Math.round(origin.x + x * scale) + 0.5,
    y: Math.round(origin.y + y * scale) + 0.5,
    w: Math.round(w * scale),
    h: Math.round(h * scale)
  }))
  for (const box of boxes) {
    ctx.lineWidth = 3
    ctx.strokeStyle = style.halo
    ctx.strokeRect(box.x, box.y, box.w, box.h)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = style.box
    ctx.strokeRect(box.x, box.y, box.w, box.h)
  }
  // Tags after all boxes, so no frame crosses a tag.
  const placed: Rect[] = []
  detections.forEach(({ term, score }, index) => {
    const text = term + ' ' + score.toFixed(2)
    const tag = placeTag(boxes[index], Math.ceil(ctx.measureText(text).width) + 8, placed)
    placed.push(tag)
    ctx.fillStyle = style.label
    ctx.fillRect(tag.x - 0.5, tag.y, tag.w, tag.h)
    ctx.fillStyle = style.text
    ctx.fillText(text, tag.x + 3.5, tag.y + tagHeight / 2)
  })
  ctx.restore()
}

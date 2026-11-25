import {
  automaticSize,
  clamp,
  cropForMask,
  expandedRect,
  fitSize,
  maxEdge,
  maxPixels,
  validSize
} from '../image/pixels.js'
import type { Handle, Viewport } from '../image/viewport.js'
import type { Profile } from '../types/api.js'
import type { Tool, Work } from '../types/editor.js'
import type { Margins, Rect } from '../types/image.js'

export const sizeLabel = (w: number, h: number) => w + ' × ' + h
export const emptyMargins = (): Margins => ({ left: 0, top: 0, right: 0, bottom: 0 })

export function fitView(view: Viewport | null, tool: Tool, work?: Work, candidate?: Rect) {
  const rect = candidate ?? (work && (tool === 'outpaint' ? expandedRect(work.image, work.margins) : work.image))
  if (view && rect) view.fit(rect)
}

export function suggestExpansion(image: Rect): Margins {
  const right = Math.max(
    0,
    Math.min(Math.max(64, Math.round(image.w * 0.2)), maxEdge - image.w, Math.floor(maxPixels / image.h) - image.w)
  )
  return { ...emptyMargins(), right }
}

type Axis = 'w' | 'h'

function lockedSize(axis: Axis, value: number, ratio: number, maxW: number, maxH: number, minW = 1, minH = 1) {
  const h = clamp(axis === 'w' ? value / ratio : value, Math.max(minH, minW / ratio), Math.min(maxH, maxW / ratio))
  return { w: clamp(Math.round(h * ratio), minW, maxW), h: clamp(Math.round(h), minH, maxH) }
}

function resizeIntent(handle: Handle, dx: number, dy: number, w: number, h: number) {
  const dw = handle.includes('w') ? -dx : handle.includes('e') ? dx : 0
  const dh = handle.includes('n') ? -dy : handle.includes('s') ? dy : 0
  const axis: Axis = Math.abs(dw / w) >= Math.abs(dh / h) ? 'w' : 'h'
  return { axis, value: axis === 'w' ? w + dw : h + dh }
}

export function sizeOutpaint(image: Rect, margins: Margins, axis: Axis, value: number, ratio?: number) {
  const target = expandedRect(image, margins)
  target[axis] = Math.max(image[axis], value)
  const { w, h } = ratio ? lockedSize(axis, value, ratio, maxEdge, maxEdge, image.w, image.h) : target
  if (!validSize(w, h)) return
  const left = Math.min(margins.left, w - image.w)
  const top = Math.min(margins.top, h - image.h)
  return { left, top, right: w - image.w - left, bottom: h - image.h - top }
}

// Snaps a frame edge length to the model grid. Lengths at the minimum (the image itself) stay untouched.
function snapLength(value: number, min: number, grid: number) {
  if (value <= min) return min
  const max = Math.floor(maxEdge / grid) * grid
  return Math.max(min, Math.min(Math.round(value / grid) * grid, max))
}

export function dragMargins(
  image: Rect,
  margins: Margins,
  handle: Handle | 'move',
  dx: number,
  dy: number,
  ratio?: number,
  grid = 1
) {
  if (handle === 'move') {
    // Shift the frame while keeping its size; the image must stay inside.
    const left = clamp(margins.left - snap(dx, grid), 0, margins.left + margins.right)
    const top = clamp(margins.top - snap(dy, grid), 0, margins.top + margins.bottom)
    return {
      left,
      top,
      right: margins.left + margins.right - left,
      bottom: margins.top + margins.bottom - top
    }
  }
  if (ratio && (dx || dy)) {
    const target = expandedRect(image, margins)
    const horizontal = handle.includes('w') ? 'left' : 'right'
    const vertical = handle.includes('n') ? 'top' : 'bottom'
    const minW = target.w - margins[horizontal]
    const minH = target.h - margins[vertical]
    const { axis, value } = resizeIntent(handle, dx, dy, target.w, target.h)
    const { w, h } = lockedSize(axis, value, ratio, maxEdge, maxEdge, minW, minH)
    return {
      ...margins,
      [horizontal]: snapLength(w, minW, grid) - minW,
      [vertical]: snapLength(h, minH, grid) - minH
    }
  }
  const next = { ...margins }
  const edge = (margin: number, other: number, length: number) =>
    snapLength(length + margin, length + other, grid) - length - other
  if (handle.includes('w')) next.left = edge(margins.left - dx, margins.right, image.w)
  if (handle.includes('e')) next.right = edge(margins.right + dx, margins.left, image.w)
  if (handle.includes('n')) next.top = edge(margins.top - dy, margins.bottom, image.h)
  if (handle.includes('s')) next.bottom = edge(margins.bottom + dy, margins.top, image.h)
  return next
}

export function generationCrop(work: Work, tool: Tool, box: Rect | undefined, context: number): Rect {
  if (tool !== 'outpaint' && work.crop) return work.crop
  if (tool === 'inpaint' && box) return cropForMask(box, work.image, context)
  const { w, h } = tool === 'outpaint' ? expandedRect(work.image, work.margins) : work.image
  return { x: 0, y: 0, w, h }
}

const snap = (value: number, grid: number) => Math.round(value / grid) * grid

function resizeCrop(length: number, available: number, grid: number) {
  const max = Math.floor(available / grid) * grid
  return max > 0 ? clamp(snap(length, grid), grid, max) : available
}

export function dragCrop(
  image: Rect,
  crop: Rect,
  handle: Handle | 'move',
  dx: number,
  dy: number,
  grid: number,
  ratio?: number
): Rect {
  if (handle === 'move') {
    return {
      ...crop,
      x: clamp(crop.x + snap(dx, grid), 0, image.w - crop.w),
      y: clamp(crop.y + snap(dy, grid), 0, image.h - crop.h)
    }
  }
  if (ratio && (dx || dy)) {
    const west = handle.includes('w')
    const east = handle.includes('e')
    const north = handle.includes('n')
    const south = handle.includes('s')
    const maxW = west ? crop.x + crop.w : east ? image.w - crop.x : image.w
    const maxH = north ? crop.y + crop.h : south ? image.h - crop.y : image.h
    const { axis, value } = resizeIntent(handle, dx, dy, crop.w, crop.h)
    const { w, h } = resizeLockedCrop(axis, value, ratio, maxW, maxH, grid)
    const x = west ? crop.x + crop.w - w : east ? crop.x : clamp(crop.x + Math.round((crop.w - w) / 2), 0, image.w - w)
    const y = north
      ? crop.y + crop.h - h
      : south
        ? crop.y
        : clamp(crop.y + Math.round((crop.h - h) / 2), 0, image.h - h)
    return { x, y, w, h }
  }
  const next = { ...crop }
  if (dx && handle.includes('w')) {
    const right = crop.x + crop.w
    next.w = resizeCrop(crop.w - dx, right, grid)
    next.x = right - next.w
  }
  if (dx && handle.includes('e')) next.w = resizeCrop(crop.w + dx, image.w - crop.x, grid)
  if (dy && handle.includes('n')) {
    const bottom = crop.y + crop.h
    next.h = resizeCrop(crop.h - dy, bottom, grid)
    next.y = bottom - next.h
  }
  if (dy && handle.includes('s')) next.h = resizeCrop(crop.h + dy, image.h - crop.y, grid)
  return next
}

function resizeLockedCrop(axis: Axis, value: number, ratio: number, maxW: number, maxH: number, grid: number) {
  const { w, h } = lockedSize(axis, value, ratio, maxW, maxH)
  return { w: resizeCrop(w, maxW, grid), h: resizeCrop(h, maxH, grid) }
}

export function setCropField(image: Rect, crop: Rect, field: Axis, value: number, grid: number, ratio?: number): Rect {
  const maxW = image.w - crop.x
  const maxH = image.h - crop.y
  return ratio
    ? { ...crop, ...resizeLockedCrop(field, value, ratio, maxW, maxH, grid) }
    : { ...crop, [field]: resizeCrop(value, field === 'w' ? maxW : maxH, grid) }
}

// Text to image: the requested size snapped to the profile rules. The output covers the whole target.
export function measureCreate(profile: Profile, w: number, h: number) {
  const effective = fitSize(w, h, profile.sizes)
  const target = { x: 0, y: 0, w: effective[0], h: effective[1] }
  return { crop: target, target, auto: effective, effective, corrected: effective[0] !== w || effective[1] !== h }
}

export function createSize(ratio: number, target: number): [number, number] {
  return [Math.round(target * Math.sqrt(ratio)), Math.round(target / Math.sqrt(ratio))]
}

// Upscaling keeps the aspect ratio. The factor shrinks to stay within 4×, 8192 px per side and 24 MP.
export function measure(work: Work, tool: Tool, profile: Profile, crop: Rect, manualSize?: [number, number]) {
  const target = tool === 'outpaint' ? expandedRect(work.image, work.margins) : work.image
  const auto = automaticSize(crop, profile.sizes.target)
  const requested = manualSize ?? auto
  const effective = fitSize(...requested, profile.sizes)
  return { crop, target, auto, effective, corrected: effective.some((n, i) => n !== requested[i]) }
}

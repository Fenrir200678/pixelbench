import type { Frame, Margins, Rect, SizeRule } from '../types/image.js'

export const maxEdge = 8192
export const maxPixels = 24_000_000
export const validSize = (w: number, h: number) =>
  [w, h].every((n) => Number.isInteger(n) && n > 0 && n <= maxEdge) && w * h <= maxPixels
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

export function fitSize(w: number, h: number, rule: SizeRule): [number, number] {
  const { grid, min, max, area } = rule
  const scale = Math.min(1, max / Math.max(w, h), Math.sqrt(area / (w * h)))
  const snap = (n: number) => clamp(Math.round((n * scale) / grid) * grid, min, max)
  let W = snap(w),
    H = snap(h)
  while (W * H > area) {
    if ((W / w >= H / h && W > min) || H === min) W -= grid
    else H -= grid
  }
  return [W, H]
}

export function automaticSize(rect: Rect, target: number): [number, number] {
  const scale = Math.min(Math.max(1, 512 / Math.min(rect.w, rect.h)), target / Math.sqrt(rect.w * rect.h))
  return [Math.max(1, Math.round(rect.w * scale)), Math.max(1, Math.round(rect.h * scale))]
}

export function bounds(alpha: Uint8ClampedArray, w: number, h: number): Rect | undefined {
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      if (!alpha[row + x]) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

export function cropForMask(box: Rect, frame: Rect, padding: number): Rect {
  const x = Math.max(0, box.x - padding),
    y = Math.max(0, box.y - padding)
  return { x, y, w: Math.min(frame.w, box.x + box.w + padding) - x, h: Math.min(frame.h, box.y + box.h + padding) - y }
}

export function cutMask(source: Uint8ClampedArray, width: number, crop: Rect) {
  const result = new Uint8ClampedArray(crop.w * crop.h)
  for (let y = 0; y < crop.h; y++) {
    const index = (y + crop.y) * width + crop.x
    result.set(source.subarray(index, index + crop.w), y * crop.w)
  }
  return result
}

export function maskIntersects(alpha: Uint8ClampedArray, width: number, box: Rect, crop: Rect) {
  const left = Math.max(box.x, crop.x)
  const top = Math.max(box.y, crop.y)
  const right = Math.min(box.x + box.w, crop.x + crop.w)
  const bottom = Math.min(box.y + box.h, crop.y + crop.h)
  if (left >= right || top >= bottom) return false
  if (left === box.x && top === box.y && right - left === box.w && bottom - top === box.h) return true
  for (let y = top; y < bottom; y++) {
    const end = y * width + right
    for (let i = y * width + left; i < end; i++) {
      if (alpha[i]) return true
    }
  }
  return false
}

export function featherInward(source: Uint8ClampedArray, w: number, h: number, radius: number) {
  if (!radius) return source
  // The zero border also treats a mask clipped by the crop as an edge.
  const stride = w + 2
  const distance = new Uint16Array(stride * (h + 2))
  const result = new Uint8ClampedArray(source.length)
  const straight = 3,
    diagonal = 4
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!source[y * w + x]) continue
      const i = (y + 1) * stride + x + 1
      distance[i] = Math.min(
        distance[i - 1] + straight,
        distance[i - stride] + straight,
        distance[i - stride - 1] + diagonal,
        distance[i - stride + 1] + diagonal
      )
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const p = y * w + x
      if (!source[p]) continue
      const i = (y + 1) * stride + x + 1
      const nearest = Math.min(
        distance[i],
        distance[i + 1] + straight,
        distance[i + stride] + straight,
        distance[i + stride - 1] + diagonal,
        distance[i + stride + 1] + diagonal
      )
      distance[i] = nearest
      // The mask boundary lies halfway between the masked and unmasked pixel centers.
      const t = Math.min(1, (nearest / straight - 0.5) / radius)
      result[p] = source[p] * t * t * (3 - 2 * t)
    }
  }
  return result
}

// Grows a mask by radius pixels with a chamfer distance, the outward counterpart of featherInward.
export function growMask(source: Uint8ClampedArray, w: number, h: number, radius: number) {
  if (radius <= 0) return source
  const straight = 3,
    diagonal = 4
  const far = 0xffff
  const distance = new Uint16Array(w * h).fill(far)
  for (let i = 0; i < source.length; i++) if (source[i]) distance[i] = 0
  const relax = (i: number, j: number, cost: number) => {
    if (distance[j] + cost < distance[i]) distance[i] = distance[j] + cost
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (x > 0) relax(i, i - 1, straight)
      if (y > 0) {
        relax(i, i - w, straight)
        if (x > 0) relax(i, i - w - 1, diagonal)
        if (x < w - 1) relax(i, i - w + 1, diagonal)
      }
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      if (x < w - 1) relax(i, i + 1, straight)
      if (y < h - 1) {
        relax(i, i + w, straight)
        if (x < w - 1) relax(i, i + w + 1, diagonal)
        if (x > 0) relax(i, i + w - 1, diagonal)
      }
    }
  }
  const limit = radius * straight
  const result = new Uint8ClampedArray(source.length)
  for (let i = 0; i < result.length; i++) if (distance[i] <= limit) result[i] = 255
  return result
}

export function expandedRect(frame: Rect, margins: Margins): Rect {
  return {
    x: frame.x - margins.left,
    y: frame.y - margins.top,
    w: frame.w + margins.left + margins.right,
    h: frame.h + margins.top + margins.bottom
  }
}

export function outpaintMask(frame: Rect, target: Rect, transition: number) {
  const mask = new Uint8ClampedArray(target.w * target.h).fill(255)
  const left = frame.x - target.x,
    top = frame.y - target.y
  const right = target.w - left - frame.w,
    bottom = target.h - top - frame.h
  for (let y = 0; y < frame.h; y++) {
    for (let x = 0; x < frame.w; x++) {
      const distance = Math.min(
        left ? x : Infinity,
        right ? frame.w - x - 1 : Infinity,
        top ? y : Infinity,
        bottom ? frame.h - y - 1 : Infinity
      )
      mask[(y + top) * target.w + x + left] =
        transition && distance < transition ? 255 * (1 - distance / transition) : 0
    }
  }
  return mask
}

export function editTransitionMask(image: Rect, crop: Rect, transition: number) {
  function ramp(length: number, start: boolean, end: boolean) {
    const width = Math.min(transition, Math.floor(length / 4))
    const weights = new Float32Array(length).fill(1)
    for (let i = 0; i < width; i++) {
      const t = i / width
      const weight = t * t * (3 - 2 * t)
      if (start) weights[i] = weight
      if (end) weights[length - 1 - i] = weight
    }
    return weights
  }

  const horizontal = ramp(crop.w, crop.x > 0, crop.x + crop.w < image.w)
  const vertical = ramp(crop.h, crop.y > 0, crop.y + crop.h < image.h)
  const mask = new Uint8ClampedArray(crop.w * crop.h)
  for (let y = 0; y < crop.h; y++) {
    for (let x = 0; x < crop.w; x++) {
      mask[y * crop.w + x] = 255 * horizontal[x] * vertical[y]
    }
  }
  return mask
}

export function blend(
  base: Uint8ClampedArray,
  patch: Uint8ClampedArray,
  baseWidth: number,
  region: Rect,
  mask: Uint8ClampedArray
) {
  for (let y = 0; y < region.h; y++) {
    for (let x = 0; x < region.w; x++) {
      const i = y * region.w + x
      if (!mask[i]) continue
      const p = i * 4
      const d = ((y + region.y) * baseWidth + x + region.x) * 4
      if (mask[i] === 255) {
        base.set(patch.subarray(p, p + 4), d)
        continue
      }
      const f = mask[i] / 255
      const a = base[d + 3] * (1 - f),
        b = patch[p + 3] * f
      const alpha = a + b
      if (alpha) for (let c = 0; c < 3; c++) base[d + c] = (base[d + c] * a + patch[p + c] * b) / alpha
      base[d + 3] = alpha
    }
  }
  return base
}

export function placeOriginal(frame: Frame, target: Rect) {
  const region = { ...frame, x: frame.x - target.x, y: frame.y - target.y }
  return replaceRegion(new Uint8ClampedArray(target.w * target.h * 4), frame.pixels, target.w, region)
}

export function replaceRegion(base: Uint8ClampedArray, patch: Uint8ClampedArray, width: number, region: Rect) {
  const stride = region.w * 4
  for (let row = 0; row < region.h; row++) {
    base.set(patch.subarray(row * stride, (row + 1) * stride), ((region.y + row) * width + region.x) * 4)
  }
  return base
}

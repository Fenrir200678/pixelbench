import type { Frame, Rect } from '../types/image.js'

export const context2d = (canvas: HTMLCanvasElement) => canvas.getContext('2d')!
export function canvas(w: number, h: number) {
  const result = document.createElement('canvas')
  result.width = w
  result.height = h
  return result
}

const surfaces = new WeakMap<Frame, HTMLCanvasElement>()
export function surface(frame: Frame) {
  let result = surfaces.get(frame)
  if (!result) {
    result = canvas(frame.w, frame.h)
    // ImageData may only be rendered here. The original channels stay in Frame.pixels.
    context2d(result).putImageData(new ImageData(new Uint8ClampedArray(frame.pixels), frame.w, frame.h), 0, 0)
    surfaces.set(frame, result)
  }
  return result
}

// Model input: ComfyUI's LoadImage drops alpha, so transparent pixels would turn black. Use neutral gray instead.
export function flattened(source: CanvasImageSource, w: number, h: number) {
  const result = canvas(w, h)
  const ctx = context2d(result)
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, w, h)
  return result
}

export function resized(source: CanvasImageSource, w: number, h: number) {
  const result = canvas(w, h)
  const ctx = context2d(result)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, w, h)
  return result
}

export function maskSurface(mask: Uint8ClampedArray, w: number, h: number, channel: 'gray' | 'alpha' = 'gray') {
  const result = canvas(w, h)
  const data = new ImageData(w, h)
  for (let i = 0; i < mask.length; i++) {
    const p = i * 4
    if (channel === 'gray') data.data[p] = data.data[p + 1] = data.data[p + 2] = mask[i]
    data.data[p + 3] = channel === 'alpha' ? mask[i] : 255
  }
  context2d(result).putImageData(data, 0, 0)
  return result
}

export function outpaintSource(frame: Frame, target: Rect) {
  const result = canvas(target.w, target.h)
  const ctx = context2d(result)
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, target.w, target.h)
  ctx.drawImage(surface(frame), frame.x - target.x, frame.y - target.y)
  return result
}

export function cropSource(frame: Frame, crop: Rect) {
  const result = canvas(crop.w, crop.h)
  context2d(result).drawImage(surface(frame), crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h)
  return result
}

export function pixelsAtSize(frame: Frame, w: number, h: number) {
  if (frame.w === w && frame.h === h) return frame.pixels
  return context2d(resized(surface(frame), w, h)).getImageData(0, 0, w, h).data
}

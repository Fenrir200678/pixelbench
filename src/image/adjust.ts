import type { Frame } from '../types/image.js'

export type LevelChannel = 'rgb' | 'r' | 'g' | 'b'
export const levelChannels: LevelChannel[] = ['rgb', 'r', 'g', 'b']

/** Levels of one channel: input black and white point, midtone gamma and output range, in 0 … 255. */
export type Levels = { inBlack: number; inWhite: number; gamma: number; outBlack: number; outWhite: number }
export const neutralLevels: Readonly<Levels> = { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 }
export const gammaLimits = { min: 0.1, max: 9.99 }

/** Basic image adjustments. Every value is neutral at its default. */
export type Adjustments = {
  /** -100 … 100 */
  brightness: number
  /** -100 … 100 */
  contrast: number
  /** -100 … 100, -100 is grayscale */
  saturation: number
  /** -180 … 180 degrees */
  hue: number
  /** -100 (cool) … 100 (warm) */
  temperature: number
  /** Gaussian blur sigma in image pixels, 0 … 10. Softens oversharpened images, the counterpart to sharpness. */
  blur: number
  /** 0 … 100 */
  sharpness: number
  /** Applied after the other tone settings: first the combined channel, then each color channel. */
  levels: Readonly<Record<LevelChannel, Levels>>
}

export type AdjustmentKey = Exclude<keyof Adjustments, 'levels'>

export const neutralAdjustments: Readonly<Adjustments> = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  temperature: 0,
  blur: 0,
  sharpness: 0,
  levels: { rgb: neutralLevels, r: neutralLevels, g: neutralLevels, b: neutralLevels }
}

export const adjustmentLimits: Record<AdjustmentKey, { min: number; max: number; step: number }> = {
  brightness: { min: -100, max: 100, step: 1 },
  contrast: { min: -100, max: 100, step: 1 },
  saturation: { min: -100, max: 100, step: 1 },
  hue: { min: -180, max: 180, step: 1 },
  temperature: { min: -100, max: 100, step: 1 },
  blur: { min: 0, max: 10, step: 0.1 },
  sharpness: { min: 0, max: 100, step: 1 }
}

const sliderKeys = Object.keys(adjustmentLimits) as AdjustmentKey[]
const levelKeys = Object.keys(neutralLevels) as (keyof Levels)[]

export const isNeutralLevels = (l: Levels) => levelKeys.every((key) => l[key] === neutralLevels[key])

export const isNeutral = (a: Adjustments) =>
  sliderKeys.every((key) => a[key] === neutralAdjustments[key]) &&
  levelChannels.every((channel) => isNeutralLevels(a.levels[channel]))

/** Maps a value in 0 … 255 through one channel's levels. */
export function levelValue(l: Levels, v: number) {
  const x = Math.min(1, Math.max(0, (v - l.inBlack) / Math.max(1, l.inWhite - l.inBlack)))
  return l.outBlack + x ** (1 / l.gamma) * (l.outWhite - l.outBlack)
}

// Per-channel tone curve: temperature, brightness and contrast, then the levels.
function toneTables(a: Adjustments) {
  const shift = a.brightness * 1.275
  const factor = ((100 + a.contrast) / 100) ** 2
  const warmth = a.temperature * 0.3
  const { rgb } = a.levels
  return (['r', 'g', 'b'] as const).map((channel, index) => {
    const offset = [warmth, 0, -warmth][index]
    const own = a.levels[channel]
    const table = new Uint8ClampedArray(256)
    for (let v = 0; v < 256; v++) {
      const toned = Math.min(255, Math.max(0, (v + offset + shift - 127.5) * factor + 127.5))
      table[v] = levelValue(own, levelValue(rgb, toned))
    }
    return table
  })
}

export type Histogram = Record<LevelChannel, Uint32Array>

/** Counts per value for each color channel and for luminance (as rgb). Transparent pixels are skipped. */
export function histogram(pixels: Uint8ClampedArray): Histogram {
  const result = {
    rgb: new Uint32Array(256),
    r: new Uint32Array(256),
    g: new Uint32Array(256),
    b: new Uint32Array(256)
  }
  for (let i = 0; i < pixels.length; i += 4) {
    if (!pixels[i + 3]) continue
    const r = pixels[i],
      g = pixels[i + 1],
      b = pixels[i + 2]
    result.r[r]++
    result.g[g]++
    result.b[b]++
    result.rgb[Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)]++
  }
  return result
}

/** Black and white point that stretch the color channels together, ignoring the outer clip share of pixels. */
export function autoLevels(counts: Histogram, clip = 0.001): Levels {
  let black = 255,
    white = 0
  for (const channel of ['r', 'g', 'b'] as const) {
    const bins = counts[channel]
    const limit = bins.reduce((sum, n) => sum + n, 0) * clip
    let low = 0,
      high = 255
    for (let sum = bins[0]; low < 255 && sum <= limit; sum += bins[++low]);
    for (let sum = bins[255]; high > 0 && sum <= limit; sum += bins[--high]);
    black = Math.min(black, low)
    white = Math.max(white, high)
  }
  return white - black < 2 ? { ...neutralLevels } : { ...neutralLevels, inBlack: black, inWhite: white }
}

// Saturation and hue rotation as one 3×3 matrix, the luminance-preserving math of CSS feColorMatrix.
function colorMatrix(a: Adjustments) {
  const s = 1 + a.saturation / 100
  const saturate = [
    0.213 + 0.787 * s,
    0.715 - 0.715 * s,
    0.072 - 0.072 * s,
    0.213 - 0.213 * s,
    0.715 + 0.285 * s,
    0.072 - 0.072 * s,
    0.213 - 0.213 * s,
    0.715 - 0.715 * s,
    0.072 + 0.928 * s
  ]
  const angle = (a.hue * Math.PI) / 180,
    c = Math.cos(angle),
    n = Math.sin(angle)
  const rotate = [
    0.213 + c * 0.787 - n * 0.213,
    0.715 - c * 0.715 - n * 0.715,
    0.072 - c * 0.072 + n * 0.928,
    0.213 - c * 0.213 + n * 0.143,
    0.715 + c * 0.285 + n * 0.14,
    0.072 - c * 0.072 - n * 0.283,
    0.213 - c * 0.213 - n * 0.787,
    0.715 - c * 0.715 + n * 0.715,
    0.072 + c * 0.928 + n * 0.072
  ]
  const m = new Float64Array(9)
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++)
      for (let k = 0; k < 3; k++) m[row * 3 + col] += rotate[row * 3 + k] * saturate[k * 3 + col]
  return m
}

// 3×3 box blur of the color channels, separable, with clamped edges.
function boxBlur(source: Uint8ClampedArray, w: number, h: number) {
  const row = new Float32Array(source.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = (y * w + Math.max(0, x - 1)) * 4,
        m = (y * w + x) * 4,
        r = (y * w + Math.min(w - 1, x + 1)) * 4
      for (let c = 0; c < 3; c++) row[m + c] = source[l + c] + source[m + c] + source[r + c]
    }
  }
  const result = new Float32Array(source.length)
  for (let y = 0; y < h; y++) {
    const up = Math.max(0, y - 1) * w,
      down = Math.min(h - 1, y + 1) * w
    for (let x = 0; x < w; x++) {
      const m = (y * w + x) * 4
      for (let c = 0; c < 3; c++) result[m + c] = (row[(up + x) * 4 + c] + row[m + c] + row[(down + x) * 4 + c]) / 9
    }
  }
  return result
}

function sharpen(pixels: Uint8ClampedArray, w: number, h: number, sharpness: number) {
  const amount = (sharpness / 100) * 2
  const blurred = boxBlur(pixels, w, h)
  const result = new Uint8ClampedArray(pixels)
  for (let i = 0; i < pixels.length; i += 4)
    for (let c = 0; c < 3; c++) result[i + c] = pixels[i + c] + amount * (pixels[i + c] - blurred[i + c])
  return result
}

// Gaussian blur of the color channels, separable, with clamped edges. Alpha stays.
type Line = { count: number; length: number; step: number; start: (line: number) => number }

const rows = (w: number, h: number): Line => ({ count: h, length: w, step: 4, start: (y) => y * w * 4 })
const columns = (w: number, h: number): Line => ({ count: w, length: h, step: w * 4, start: (x) => x * 4 })

function gaussianKernel(sigma: number) {
  const radius = Math.max(1, Math.ceil(sigma * 3))
  const kernel = new Float32Array(radius * 2 + 1)
  let sum = 0
  for (let k = -radius; k <= radius; k++) sum += kernel[k + radius] = Math.exp(-(k * k) / (2 * sigma * sigma))
  return kernel.map((weight) => weight / sum)
}

// Copies one line's color channels, interleaved, into buf with radius edge pixels repeated on both sides.
function padLine(source: Float32Array, line: Line, base: number, radius: number, buf: Float32Array) {
  const last = line.length - 1
  for (let i = -radius; i <= last + radius; i++) {
    const from = base + Math.min(last, Math.max(0, i)) * line.step,
      to = (i + radius) * 3
    buf[to] = source[from]
    buf[to + 1] = source[from + 1]
    buf[to + 2] = source[from + 2]
  }
}

function convolve(source: Float32Array, line: Line, kernel: Float32Array) {
  const result = new Float32Array(source)
  const radius = (kernel.length - 1) / 2
  const buf = new Float32Array((line.length + radius * 2) * 3)
  for (let l = 0; l < line.count; l++) {
    const base = line.start(l)
    padLine(source, line, base, radius, buf)
    for (let i = 0; i < line.length; i++) {
      let r = 0,
        g = 0,
        b = 0
      for (let k = 0, p = i * 3; k < kernel.length; k++, p += 3) {
        const weight = kernel[k]
        r += weight * buf[p]
        g += weight * buf[p + 1]
        b += weight * buf[p + 2]
      }
      const out = base + i * line.step
      result[out] = r
      result[out + 1] = g
      result[out + 2] = b
    }
  }
  return result
}

// Box filter with a running sum, so its cost does not grow with the radius.
function box(source: Float32Array, line: Line, radius: number) {
  const result = new Float32Array(source)
  const size = radius * 2 + 1
  const buf = new Float32Array((line.length + radius * 2 + 1) * 3)
  for (let l = 0; l < line.count; l++) {
    const base = line.start(l)
    padLine(source, line, base, radius, buf)
    let r = 0,
      g = 0,
      b = 0
    for (let p = 0; p < size * 3; p += 3) {
      r += buf[p]
      g += buf[p + 1]
      b += buf[p + 2]
    }
    for (let i = 0; i < line.length; i++) {
      const out = base + i * line.step,
        add = (i + size) * 3,
        drop = i * 3
      result[out] = r / size
      result[out + 1] = g / size
      result[out + 2] = b / size
      r += buf[add] - buf[drop]
      g += buf[add + 1] - buf[drop + 1]
      b += buf[add + 2] - buf[drop + 2]
    }
  }
  return result
}

// Radii of three box filters that together approximate a Gaussian of this sigma.
function boxRadii(sigma: number, passes = 3) {
  let lower = Math.floor(Math.sqrt((12 * sigma * sigma) / passes + 1))
  if (lower % 2 === 0) lower--
  const lowerCount = Math.round(
    (12 * sigma * sigma - passes * lower * lower - 4 * passes * lower - 3 * passes) / (-4 * lower - 4)
  )
  return Array.from({ length: passes }, (_, i) => ((i < lowerCount ? lower : lower + 2) - 1) / 2)
}

// Exact kernel for small sigmas, three box passes for large ones.
function gaussianBlur(pixels: Uint8ClampedArray, w: number, h: number, sigma: number) {
  if (sigma <= 0) return new Uint8ClampedArray(pixels)
  let data = Float32Array.from(pixels)
  if (sigma <= 2) {
    const kernel = gaussianKernel(sigma)
    data = convolve(convolve(data, rows(w, h), kernel), columns(w, h), kernel)
  } else {
    for (const radius of boxRadii(sigma)) data = box(box(data, rows(w, h), radius), columns(w, h), radius)
  }
  return Uint8ClampedArray.from(data)
}

/**
 * Applies the adjustments to straight RGBA pixels and returns a new array. Alpha stays as it is.
 * scale is the size of these pixels relative to the image, so a downscaled preview blurs alike.
 */
export function adjust(pixels: Uint8ClampedArray, w: number, h: number, a: Adjustments, scale = 1) {
  if (isNeutral(a)) return new Uint8ClampedArray(pixels)
  const [red, green, blue] = toneTables(a)
  const colored = a.saturation !== 0 || a.hue !== 0
  const m = colored ? colorMatrix(a) : undefined
  let result = new Uint8ClampedArray(pixels.length)
  for (let i = 0; i < pixels.length; i += 4) {
    const r = red[pixels[i]],
      g = green[pixels[i + 1]],
      b = blue[pixels[i + 2]]
    if (m) {
      result[i] = m[0] * r + m[1] * g + m[2] * b
      result[i + 1] = m[3] * r + m[4] * g + m[5] * b
      result[i + 2] = m[6] * r + m[7] * g + m[8] * b
    } else {
      result[i] = r
      result[i + 1] = g
      result[i + 2] = b
    }
    result[i + 3] = pixels[i + 3]
  }
  if (a.blur > 0) result = gaussianBlur(result, w, h, a.blur * scale)
  if (a.sharpness > 0) result = sharpen(result, w, h, a.sharpness)
  return result
}

/** A new frame with the adjustments applied, only inside mask (w×h alpha) when one is given. */
export function adjustFrame(frame: Frame, a: Adjustments, mask?: Uint8ClampedArray, scale = 1): Frame {
  const adjusted = adjust(frame.pixels, frame.w, frame.h, a, scale)
  if (mask) {
    // Alpha is unchanged by adjust, so a soft mask is a plain mix of the color channels.
    for (let i = 0; i < mask.length; i++) {
      const f = mask[i] / 255
      if (f === 1) continue
      const p = i * 4
      for (let c = 0; c < 3; c++) adjusted[p + c] = frame.pixels[p + c] + (adjusted[p + c] - frame.pixels[p + c]) * f
    }
  }
  return { ...frame, pixels: adjusted }
}

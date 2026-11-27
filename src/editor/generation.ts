import { api } from '../api/client.js'
import {
  canvas,
  context2d,
  cropSource,
  flattened,
  maskSurface,
  outpaintSource,
  pixelsAtSize,
  resized,
  surface
} from '../image/canvas.js'
import { asBase64, frameFromRawResponse } from '../image/files.js'
import type { Drawing } from '../image/mask.js'
import {
  blend,
  cutMask,
  editTransitionMask,
  featherInward,
  outpaintMask,
  placeOriginal,
  replaceRegion
} from '../image/pixels.js'
import type { LoraChoice, ModelChoices, Parameters, Profile } from '../types/api.js'
import type { Tool } from '../types/editor.js'
import type { Detection, Frame, Rect } from '../types/image.js'

export type Request = {
  profile: string
  tool: Tool
  seed: number
  size: [number, number]
  prompt: string
  negative: string
  image?: string
  mask?: string
  reference?: string
  references?: string[]
  parameters: Parameters
  models?: Record<string, string>
  loras?: LoraChoice[]
  strength?: number
  upscaler?: string
  hires?: Hires
  // Seed variance strength, 0 or missing is off.
  variance?: number
  // Color correction toward the template or source image, 0 or missing is off.
  colorMatch?: number
  // Outpaint: the original image as color reference, since the request image has gray filler.
  colorReference?: string
}
// Hires fix: enlarge to size with the upscale model, then re-render. Steps 0 keeps the render steps.
// tiled: Ultimate SD Upscale instead of one image to image pass at the target size.
// colorMatch: color correction toward the source image, 0 or missing is off.
export type Hires = {
  upscaler: string
  strength: number
  steps: number
  size: [number, number]
  tiled: boolean
  colorMatch?: number
}
// Plain Extras jobs (upscaler, background removal) have no prompt or seed worth showing or storing.
export const seedless = (request: Request) => request.tool === 'upscale' && !request.hires
export type Prepared = { request: Request; source?: Frame; target: Rect; crop: Rect; effectiveMask?: Uint8ClampedArray }
// before: the template scaled to the result, so compare lines up when image to image changes the size.
// detections: what the detailer found and re-rendered, shown as boxes on the canvas.
// mask: the detailer segmentation in image pixels, used as the inpaint mask when the variant is applied.
export type Variant = {
  id: string
  frame: Frame
  prepared: Prepared
  before?: Frame
  detections?: Detection[]
  mask?: Uint8ClampedArray
}
type Inputs = {
  source?: Frame
  crop: Rect
  target: Rect
  size: [number, number]
  brushMask?: Uint8ClampedArray
  drawing?: Drawing
  edge: number
  profile: Profile
  tool: Tool
  seed: number
  prompt: string
  negative: string
  parameters: Parameters
  models: ModelChoices
  loras?: LoraChoice[]
  strength?: number
  upscaler?: string
  hires?: Hires
  variance?: number
  colorMatch?: number
  references?: Frame[]
}

// The largest centered area of the template with the output aspect ratio.
export function templateArea(source: Rect, w: number, h: number): Rect {
  const scale = Math.min(source.w / w, source.h / h)
  const cw = Math.min(source.w, Math.round(w * scale))
  const ch = Math.min(source.h, Math.round(h * scale))
  return { x: Math.floor((source.w - cw) / 2), y: Math.floor((source.h - ch) / 2), w: cw, h: ch }
}

const requestFields = (inputs: Inputs) => ({
  profile: inputs.profile.id,
  tool: inputs.tool,
  size: inputs.size,
  seed: inputs.seed,
  prompt: inputs.prompt,
  negative: inputs.negative,
  parameters: inputs.parameters,
  models: inputs.models,
  loras: inputs.profile.lora && inputs.loras?.length ? inputs.loras : undefined,
  hires: inputs.hires,
  variance: inputs.variance || undefined
})

export type Side = 'top' | 'bottom' | 'left' | 'right'

// The sides of the frame that the outpaint target extends.
export function outpaintSides(frame: Rect, target: Rect): Side[] {
  const sides: [boolean, Side][] = [
    [frame.y > target.y, 'top'],
    [frame.y + frame.h < target.y + target.h, 'bottom'],
    [frame.x > target.x, 'left'],
    [frame.x + frame.w < target.x + target.w, 'right']
  ]
  return sides.filter(([extended]) => extended).map(([, side]) => side)
}

// Reference images go to the encoder at most 1024 px on the long edge, on a 32 px grid.
export function referenceImage(frame: Frame) {
  const scale = Math.min(1, 1024 / Math.max(frame.w, frame.h))
  const snap = (n: number) => Math.max(32, Math.round((n * scale) / 32) * 32)
  return asBase64(resized(surface(frame), snap(frame.w), snap(frame.h)))
}

export async function prepare(inputs: Inputs): Promise<Prepared> {
  const { crop, target, size, brushMask, drawing, profile, tool } = inputs
  // Text to image has no source pixels. The result replaces the whole target.
  if (!inputs.source) return { target, crop, request: requestFields(inputs) }
  const source = inputs.source
  const [w, h] = size
  if (tool === 'upscale') {
    // The server enlarges the whole image, with the plain upscaler or as a hires fix with a create profile.
    const image = await asBase64(flattened(surface(source), source.w, source.h))
    return { source, target, crop, request: { ...requestFields(inputs), image, upscaler: inputs.upscaler } }
  }
  if (tool === 'create') {
    // Image to image: the whole template, cropped to the output ratio from the center and scaled to the output size.
    const image = await asBase64(flattened(cropSource(source, templateArea(source, w, h)), w, h))
    return {
      source,
      target,
      crop,
      request: {
        ...requestFields(inputs),
        image,
        strength: inputs.strength,
        colorMatch: inputs.colorMatch || undefined
      }
    }
  }
  let rawMask, effectiveMask
  const cropped = crop.w !== source.w || crop.h !== source.h
  let input
  if (tool === 'inpaint') {
    if (!brushMask) throw new Error('Markiere zuerst einen Bereich.')
    input = cropSource(source, crop)
    rawMask = cutMask(brushMask, source.w, crop)
    if (!rawMask.some(Boolean)) throw new Error('Markiere einen Bereich innerhalb des Generierungsrahmens.')
    effectiveMask = featherInward(rawMask, crop.w, crop.h, inputs.edge)
  } else if (tool === 'outpaint') {
    input = outpaintSource(source, target)
    // The sampler regenerates the whole transition band, so the new content runs through it without a seam.
    // The soft ramp only blends the result back over the original.
    effectiveMask = outpaintMask(source, target, inputs.edge)
    rawMask = effectiveMask.map((value) => (value ? 255 : 0))
  } else {
    input = cropped || drawing ? cropSource(source, crop) : surface(source)
    if (cropped && inputs.edge > 0) effectiveMask = editTransitionMask(source, crop, inputs.edge)
  }
  if (drawing) {
    const guide = rawMask ? canvas(crop.w, crop.h) : input
    const ctx = context2d(guide)
    ctx.drawImage(
      drawing.surface,
      source.x + drawing.area.x - target.x - crop.x,
      source.y + drawing.area.y - target.y - crop.y
    )
    if (rawMask) {
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(maskSurface(rawMask, crop.w, crop.h, 'alpha'), 0, 0)
      context2d(input).drawImage(guide, 0, 0)
    }
  }
  const image = asBase64(flattened(input, w, h))
  const colorMatch = tool === 'inpaint' || tool === 'outpaint' ? inputs.colorMatch || undefined : undefined
  const colorReference = colorMatch && tool === 'outpaint' ? referenceImage(source) : undefined
  const mask = rawMask ? asBase64(resized(maskSurface(rawMask, crop.w, crop.h), w, h)) : undefined
  const references = await Promise.all((profile.reference ? (inputs.references ?? []) : []).map(referenceImage))
  return {
    source,
    target,
    crop,
    effectiveMask,
    request: {
      ...requestFields(inputs),
      image: await image,
      mask: await mask,
      references,
      colorMatch,
      colorReference: await colorReference
    }
  }
}

export async function collect(path: string, prepared: Prepared): Promise<Variant> {
  const raster = await frameFromRawResponse(await fetch(path + '/image?raw=1'))
  const { source, request, target, crop, effectiveMask } = prepared
  const patch = pixelsAtSize(raster, crop.w, crop.h)
  let pixels = patch
  if (effectiveMask && source) {
    const base = request.tool === 'outpaint' ? placeOriginal(source, target) : new Uint8ClampedArray(source.pixels)
    pixels = blend(base, patch, target.w, crop, effectiveMask)
  } else if (source && (crop.w !== target.w || crop.h !== target.h)) {
    pixels = replaceRegion(new Uint8ClampedArray(source.pixels), patch, target.w, crop)
  }
  await api(path + '/release', {}).catch(() => {})
  const before =
    (request.tool === 'create' || request.tool === 'upscale') && source
      ? {
          ...target,
          pixels: context2d(
            resized(cropSource(source, templateArea(source, target.w, target.h)), target.w, target.h)
          ).getImageData(0, 0, target.w, target.h).data
        }
      : undefined
  return { id: path, frame: { ...target, pixels }, prepared, before }
}

import { api } from '../api/client.js'
import type { Runner, Stage } from '../hooks/useGeneration.js'
import { cropSource, flattened, maskSurface, resized, surface } from '../image/canvas.js'
import { asBase64, frameFromRawResponse } from '../image/files.js'
import { bounds, cropForMask, cutMask, featherInward, fitSize, growMask } from '../image/pixels.js'
import type { LoraChoice, Parameters, Profile } from '../types/api.js'
import type { Frame, Rect } from '../types/image.js'
import { collect, type Prepared, type Variant } from './generation.js'

// Detailer like ADetailer: SAM3 finds objects such as faces, then each one is re-rendered in a crop at the
// profile's target size with masked image to image and blended back.
export type DetailerSettings = {
  on: boolean
  // Comma-separated SAM3 terms. "face:2" overrides the limit for one term.
  terms: string
  limit: number
  threshold: number
  // Empty: the main prompt.
  prompt: string
  strength: number
  // Context around the object in source pixels.
  padding: number
  grow: number
  feather: number
  // Keep the boxes on the detailer variant after the run. While it runs, they are always shown.
  keepBoxes: boolean
  // Keep the union of the detected masks on the result. Applying it makes them the inpaint mask.
  keepMasks: boolean
  // Upscale model for small crops. Empty or 'lanczos': plain browser scaling.
  upscaler: string
}
export const initialDetailer: DetailerSettings = {
  on: false,
  terms: 'face',
  limit: 4,
  threshold: 0.5,
  prompt: '',
  strength: 0.4,
  padding: 32,
  grow: 8,
  feather: 8,
  keepBoxes: false,
  keepMasks: false,
  upscaler: ''
}
// The render inputs every detail job shares. Each object gets the seed plus its index.
export type DetailBase = {
  profile: Profile
  prompt: string
  negative: string
  seed: number
  parameters: Parameters
  models: Record<string, string>
  loras?: LoraChoice[]
  // Enlarges small crops on the server before sampling. Missing: the browser scales them.
  upscaler?: string
}
// Below this enlargement the upscale model adds little over plain scaling.
const minModelUpscale = 1.25
type Region = { crop: Rect; mask: Uint8ClampedArray; size: [number, number] }

// The crop around one object mask and its render size: at least the profile's target area, but never smaller than
// the crop itself (up to the profile's limits), so large objects are not rendered at a lower resolution.
export function detailRegion(alpha: Uint8ClampedArray, image: Rect, settings: DetailerSettings, profile: Profile) {
  const box = bounds(alpha, image.w, image.h)
  if (!box) return undefined
  const crop = cropForMask(box, image, Math.max(settings.padding, settings.grow + settings.feather))
  const mask = growMask(cutMask(alpha, image.w, crop), crop.w, crop.h, settings.grow)
  const scale = Math.max(1, profile.sizes.target / Math.sqrt(crop.w * crop.h))
  const size = fitSize(Math.round(crop.w * scale), Math.round(crop.h * scale), profile.sizes)
  return { crop, mask, size } satisfies Region
}

async function prepareDetail(
  source: Frame,
  region: Region,
  settings: DetailerSettings,
  base: DetailBase,
  index: number
): Promise<Prepared> {
  const { crop, mask, size } = region
  const [w, h] = size
  // A browser upscale of a small crop is blurry, and the sampler keeps that blur. The upscale model keeps detail.
  const enlarge = base.upscaler && Math.min(w / crop.w, h / crop.h) >= minModelUpscale ? base.upscaler : undefined
  const image = enlarge
    ? flattened(cropSource(source, crop), crop.w, crop.h)
    : flattened(cropSource(source, crop), w, h)
  return {
    source,
    target: { x: source.x, y: source.y, w: source.w, h: source.h },
    crop,
    effectiveMask: featherInward(mask, crop.w, crop.h, settings.feather),
    request: {
      profile: base.profile.id,
      tool: 'create',
      size,
      seed: base.seed + index,
      prompt: settings.prompt.trim() || base.prompt,
      negative: base.negative,
      parameters: base.parameters,
      models: base.models,
      loras: base.loras,
      strength: settings.strength,
      upscaler: enlarge,
      image: await asBase64(image),
      mask: await asBase64(resized(maskSurface(mask, crop.w, crop.h), w, h))
    }
  }
}

// One binary mask per detected object, at the size of the detection image.
async function detect(runner: Runner, frame: Frame, settings: DetailerSettings, detector: string) {
  const done = await runner.job({
    tool: 'detect',
    image: await asBase64(flattened(surface(frame), frame.w, frame.h)),
    terms: settings.terms,
    limit: settings.limit,
    threshold: settings.threshold,
    detector
  })
  if (!done) return undefined
  try {
    const masks: Uint8ClampedArray[] = []
    for (let index = 0; index < (done.job.masks ?? 0); index++) {
      const mask = await frameFromRawResponse(await fetch(done.path + '/image?raw=1&index=' + index))
      if (mask.w !== frame.w || mask.h !== frame.h) throw new Error('Die Erkennungsmaske passt nicht zum Bild.')
      const alpha = new Uint8ClampedArray(mask.w * mask.h)
      for (let i = 0; i < alpha.length; i++) if (mask.pixels[i * 4] > 127) alpha[i] = 255
      masks.push(alpha)
    }
    return { masks, detections: done.job.detections }
  } finally {
    await api(done.path + '/release', {}).catch(() => {})
  }
}

function unionMask(masks: Uint8ClampedArray[], length: number) {
  const union = new Uint8ClampedArray(length)
  for (const mask of masks) for (let i = 0; i < length; i++) if (mask[i]) union[i] = 255
  return union
}

// source: a fixed image, otherwise the previous variant of the run. The result keeps the original for comparison.
export function detailStage(settings: DetailerSettings, base: DetailBase, detector: string, source?: Frame): Stage {
  return async (runner, previous) => {
    const frame = source ?? previous?.frame
    if (!frame) return undefined
    const found = await detect(runner, frame, settings, detector)
    if (!found) return undefined
    runner.showDetections(found.detections)
    const regions = found.masks.flatMap((alpha) => detailRegion(alpha, frame, settings, base.profile) ?? [])
    if (!regions.length) {
      runner.notice('Detailer: keine Treffer für „{{terms}}“.', true, { terms: settings.terms })
      return undefined
    }
    let current = frame
    let last: Variant | undefined
    for (const [index, region] of regions.entries()) {
      const prepared = await prepareDetail(current, region, settings, base, index)
      const done = await runner.job(prepared.request)
      if (!done) return undefined
      last = await collect(done.path, prepared)
      current = last.frame
    }
    if (!last) return undefined
    const origin = previous?.prepared ?? last.prepared
    const result: Variant = { id: last.id, frame: current, prepared: { ...origin, source: frame }, before: frame }
    result.detections = found.detections
    if (settings.keepMasks) result.mask = unionMask(found.masks, frame.w * frame.h)
    return result
  }
}

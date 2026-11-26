import { api } from '../api/client.js'
import type { Runner, Stage } from '../hooks/useGeneration.js'
import { cropSource, flattened, maskSurface, resized, surface } from '../image/canvas.js'
import { asBase64, frameFromRawResponse } from '../image/files.js'
import { bounds, cropForMask, cutMask, featherInward, fitSize, growMask } from '../image/pixels.js'
import { bestPerClass, boxMask } from '../image/yolo.js'
import type { LoraChoice, Parameters, Profile } from '../types/api.js'
import type { Frame, Rect } from '../types/image.js'
import { collect, type Prepared, type Variant } from './generation.js'
import { detectYolo } from './yolo.js'

// Detailer like ADetailer: a YOLO model or SAM3 finds objects such as faces, then each one is re-rendered in a crop
// at the profile's target size with masked image to image and blended back.
export type DetectionMethod = 'yolo' | 'sam3'
// yolo: an ONNX model in the browser, with its class names. sam3: a SAM3 checkpoint in ComfyUI.
export type Detector = { kind: 'yolo'; model: string; labels: string[] } | { kind: 'sam3'; checkpoint: string }
export type DetailerSettings = {
  on: boolean
  method: DetectionMethod
  // The chosen YOLO model. Empty or missing: the first one.
  model: string
  // Comma-separated SAM3 terms. "face:2" overrides the limit for one term.
  terms: string
  // Per SAM3 term or YOLO class.
  limit: number
  // SAM3's threshold. YOLO scores run lower, so it has its own, 0.3 as in ADetailer.
  threshold: number
  yoloThreshold: number
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
  // Own sampling for the objects. Off: the render's sampler, scheduler, steps and CFG.
  sampling: boolean
  // Overrides by parameter key, only applied to profiles that expose the key.
  parameters: Parameters
}
// Render parameters the detailer can set on its own.
export const detailerParameterKeys = ['sampler', 'scheduler', 'steps', 'cfg']
export const initialDetailer: DetailerSettings = {
  on: false,
  method: 'yolo',
  model: '',
  terms: 'face',
  limit: 4,
  threshold: 0.5,
  yoloThreshold: 0.3,
  prompt: '',
  strength: 0.4,
  padding: 32,
  grow: 8,
  feather: 8,
  keepBoxes: false,
  keepMasks: false,
  upscaler: '',
  sampling: false,
  parameters: {}
}

// The detailer overrides that are valid for this profile: known keys, listed choices and numbers in range.
export function detailerOverrides(settings: DetailerSettings, profile: Profile): Parameters {
  if (!settings.sampling) return {}
  const overrides: Parameters = {}
  for (const key of detailerParameterKeys) {
    const field = profile.parameters[key]
    const value = settings.parameters[key]
    if (!field || value === undefined || typeof value !== typeof field.default) continue
    if (typeof value === 'number') {
      if (Number.isFinite(value) && value >= (field.min ?? 0) && value <= (field.max ?? Number.MAX_SAFE_INTEGER))
        overrides[key] = value
    } else if (!profile.choices[key]?.length || profile.choices[key].includes(value)) overrides[key] = value
  }
  return overrides
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

// What the detailer looks for, for titles and messages: the YOLO classes or the SAM3 terms.
export function detectorTarget(settings: DetailerSettings, detector?: Detector) {
  if (detector?.kind === 'yolo') return detector.labels.join(', ') || detector.model
  return settings.terms.trim()
}

// YOLO box models give rectangles, as ADetailer's box models do. Grow and feather soften their edges.
async function detectBoxes(frame: Frame, settings: DetailerSettings, model: string, labels: string[]) {
  const boxes = bestPerClass(await detectYolo(frame, model, settings.yoloThreshold), settings.limit)
  return {
    masks: boxes.map((box) => boxMask(box, frame.w, frame.h)),
    detections: boxes.map(({ label, ...box }) => ({ ...box, term: labels[label] ?? model }))
  }
}

// One binary mask per detected object, at the size of the detection image.
async function detect(runner: Runner, frame: Frame, settings: DetailerSettings, detector: Detector) {
  if (detector.kind === 'yolo') return detectBoxes(frame, settings, detector.model, detector.labels)
  const done = await runner.job({
    tool: 'detect',
    image: await asBase64(flattened(surface(frame), frame.w, frame.h)),
    terms: settings.terms,
    limit: settings.limit,
    threshold: settings.threshold,
    detector: detector.checkpoint
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
export function detailStage(settings: DetailerSettings, base: DetailBase, detector: Detector, source?: Frame): Stage {
  return async (runner, previous) => {
    const frame = source ?? previous?.frame
    if (!frame) return undefined
    const found = await detect(runner, frame, settings, detector)
    if (!found) return undefined
    runner.showDetections(found.detections)
    const regions = found.masks.flatMap((alpha) => detailRegion(alpha, frame, settings, base.profile) ?? [])
    if (!regions.length) {
      runner.notice('Detailer: keine Treffer für „{{terms}}“.', true, { terms: detectorTarget(settings, detector) })
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

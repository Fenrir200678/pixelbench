import { pngDimensions } from '../profiles/image-payload.mjs'

// Detailer detection with ComfyUI's core SAM3 nodes. SAM3 finds objects by short text terms such as "face".
export const detectionNodes = [
  'LoadImage',
  'CheckpointLoaderSimple',
  'CLIPTextEncode',
  'SAM3_Detect',
  'SolidMask',
  'BatchMasksNode',
  'MaskToImage',
  'PreviewImage',
  'PreviewAny'
]
export const detectorFile = /^sam3[^\\/]*\.safetensors$/i
const maxTerms = 4
const maxPerTerm = 8

// SAM3 returns one object per term unless the term carries ":N". Every term gets an explicit limit.
export function detectionTerms(text, limit) {
  if (typeof text !== 'string' || text.length > 400) throw new Error('Invalid detection terms.')
  if (!Number.isInteger(limit) || limit < 1 || limit > maxPerTerm) throw new Error('Invalid detection count.')
  const terms = text
    .replace(/[()]/g, '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = /^(.+?)\s*:\s*(\d+)$/.exec(part)
      const term = (match ? match[1] : part).trim()
      const count = match ? Math.min(maxPerTerm, Math.max(1, Number(match[2]))) : limit
      if (term.length > 60 || /[\p{Cc}]/u.test(term)) throw new Error('Invalid detection terms.')
      return { term, count }
    })
  if (!terms.length || terms.length > maxTerms) throw new Error('Detection needs one to four terms.')
  return terms
}

// One SAM3 node per term, so every box keeps its term. Model and image are shared.
export function detectionGraph(data, jobId, detectors) {
  const detector = data.detector ?? detectors[0]
  if (!detector || !detectors.includes(detector)) throw new Error('The SAM3 model for detection is missing.')
  const threshold = data.threshold
  if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0.05 || threshold > 0.95)
    throw new Error('Invalid detection threshold.')
  const terms = detectionTerms(data.terms, data.limit)
  const [width, height] = pngDimensions(data.image)
  if (!width || !height || width > 8192 || height > 8192) throw new Error('Invalid PNG.')
  const graph = {
    image: { class_type: 'LoadImage', inputs: { image: jobId + '/image.png' } },
    detector: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: detector } },
    // PreviewImage fails on an empty batch. A blank first mask keeps it valid when nothing is found.
    blank: { class_type: 'SolidMask', inputs: { value: 0, width, height } },
    batch: { class_type: 'BatchMasksNode', inputs: { 'masks.mask0': ['blank', 0] } },
    masks: { class_type: 'MaskToImage', inputs: { mask: ['batch', 0] } },
    preview: { class_type: 'PreviewImage', inputs: { images: ['masks', 0] } }
  }
  terms.forEach(({ term, count }, index) => {
    graph['terms' + index] = {
      class_type: 'CLIPTextEncode',
      inputs: { clip: ['detector', 1], text: term + ':' + count }
    }
    graph['detect' + index] = {
      class_type: 'SAM3_Detect',
      inputs: {
        model: ['detector', 0],
        image: ['image', 0],
        conditioning: ['terms' + index, 0],
        threshold,
        refine_iterations: 2,
        individual_masks: true
      }
    }
    // The boxes come back as JSON text, in the order of the masks.
    graph['boxes' + index] = { class_type: 'PreviewAny', inputs: { source: ['detect' + index, 1] } }
    graph.batch.inputs['masks.mask' + (index + 1)] = ['detect' + index, 0]
  })
  return {
    graph,
    files: [{ name: 'image.png', payload: data.image }],
    models: { 'detector.ckpt_name': detector },
    terms: terms.map(({ term }) => term),
    label: 'Detection · ' + terms.map(({ term, count }) => term + ':' + count).join(', ')
  }
}

// Boxes with term and score per mask, or undefined when they do not line up with the masks.
export function detectionBoxes(outputs, terms, count) {
  const boxes = []
  for (const [index, term] of terms.entries()) {
    let frames
    try {
      frames = JSON.parse(outputs?.['boxes' + index]?.text?.[0] ?? 'null')
    } catch {
      return undefined
    }
    if (!Array.isArray(frames?.[0])) return undefined
    for (const box of frames[0]) {
      const values = [box?.x, box?.y, box?.width, box?.height, box?.score]
      if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) return undefined
      boxes.push({ term, x: box.x, y: box.y, w: box.width, h: box.height, score: box.score })
    }
  }
  return boxes.length === count ? boxes : undefined
}

// The first preview is the blank mask. The others are one mask per detected object.
export const maxMasks = maxTerms * maxPerTerm + 1

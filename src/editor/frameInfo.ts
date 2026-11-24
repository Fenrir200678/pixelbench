import type { PixelbenchRecord } from '../metadata/pixelbench.js'
import type { Frame } from '../types/image.js'
import type { Request } from './generation.js'

// The render inputs behind each result frame, so the export can store them. A frame that is applied as the open
// image stays the same object, so its record follows it. Frames that are dropped also drop their record.
const records = new WeakMap<Frame, PixelbenchRecord>()

export function rememberGeneration(frame: Frame, request: Request) {
  // The plain upscaler has no prompt or seed worth storing.
  if (request.tool === 'upscale' && !request.hires) return
  records.set(frame, {
    tool: request.tool,
    profile: request.profile,
    prompt: request.prompt,
    negative: request.negative || undefined,
    seed: request.seed,
    size: request.size,
    parameters: request.parameters,
    models: request.models,
    loras: request.loras,
    strength: request.strength,
    colorMatch: request.colorMatch,
    hires: request.hires,
    variance: request.variance || undefined
  })
}

export const generationOf = (frame: Frame) => records.get(frame)

// Pixel edits such as adjustments create a new frame from the same render, so it keeps that render's record.
export function inheritGeneration(from: Frame, to: Frame) {
  const record = records.get(from)
  if (record) records.set(to, record)
  return to
}

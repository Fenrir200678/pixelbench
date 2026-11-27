import { initialDetailer } from '../detailer.js'
import { initialScale } from '../upscale.js'
import { neutralAdjustments, neutralLevels } from '../../image/adjust.js'
import { expandedRect, validSize } from '../../image/pixels.js'
import type { GenerationInfo } from '../../metadata/index.js'
import { invalidSession, type SessionData } from './codec.js'

const object = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value)
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
const text = (value: unknown) => typeof value === 'string'
const bool = (value: unknown) => typeof value === 'boolean'
const tool = (value: unknown) => text(value) && ['create', 'edit', 'inpaint', 'outpaint', 'upscale'].includes(value)
const size = (value: unknown) => finite(value) && Number(value) > 0
const optional = (check: (value: unknown) => boolean) => (value: unknown) => value === undefined || check(value)
const rect = (value: { x: number; y: number; w: number; h: number }) =>
  value && [value.x, value.y].every(finite) && [value.w, value.h].every(size)
const parameters = (value: unknown) =>
  object(value) && Object.values(value as object).every((n) => finite(n) || text(n) || bool(n))
const sameTypes = (value: unknown, defaults: object) =>
  object(value) &&
  Object.entries(defaults).every(([key, fallback]) => {
    const item: unknown = (value as Record<string, unknown>)[key]
    return typeof fallback === 'number' ? finite(item) : typeof item === typeof fallback && item !== null
  })
const metadata = (info: GenerationInfo | undefined) =>
  info === undefined ||
  (info &&
    text(info.source) &&
    [info.fields, info.raw].every(
      (entries) => Array.isArray(entries) && entries.every((field) => field && text(field.key) && text(field.value))
    ))

// The versioned manifest is read before any large assets are fetched or editor state is changed.
export function validateSession(data: SessionData) {
  if (!object(data)) throw invalidSession()
  const { workflow, detailer, background, tools, adjustments, document, variants, frames, references, inspection } =
    data
  if (
    !tool(data.tool) ||
    !finite(data.opacity) ||
    !bool(data.variantsCollapsed) ||
    !object(workflow) ||
    !object(detailer) ||
    !object(background) ||
    !object(tools) ||
    !object(document) ||
    !object(variants) ||
    !object(frames) ||
    !Array.isArray(references)
  )
    throw invalidSession()

  const { prefs, upscale, prompts, profileChoices, savedLoras, models, frameRatios } = workflow
  if (
    !object(prefs) ||
    !object(upscale?.upscale) ||
    !object(upscale?.hires) ||
    ![prompts, profileChoices, savedLoras, models, frameRatios].every(object) ||
    !Object.values(prompts).every((entry) => entry && text(entry.prompt) && text(entry.negative)) ||
    !Object.values(profileChoices).every(text) ||
    !Object.values(models).every((entry) => object(entry) && Object.values(entry).every(text)) ||
    !Object.values(savedLoras).every(
      (list) =>
        Array.isArray(list) &&
        list.every(
          (entry) => entry && text(entry.id) && text(entry.name) && finite(entry.strength) && bool(entry.enabled)
        )
    ) ||
    !Object.values(frameRatios).every(optional(size)) ||
    !optional(text)(workflow.profileId) ||
    !optional(finite)(workflow.lastRandomSeed) ||
    !size(workflow.ratio) ||
    !text(workflow.preset) ||
    !text(workflow.refinementModel) ||
    !bool(workflow.templateOn) ||
    ![prefs.w, prefs.h, prefs.createW, prefs.createH, prefs.templateW, prefs.templateH].every(size) ||
    ![prefs.auto, prefs.lock, prefs.templateAuto].every(bool) ||
    ![
      prefs.seed,
      prefs.context,
      prefs.feather,
      prefs.editFeather,
      prefs.transition,
      prefs.strength,
      prefs.colorMatch
    ].every(finite) ||
    !text(prefs.seedMode) ||
    !parameters(prefs.parameters) ||
    !object(prefs.parametersByTool) ||
    !Object.values(prefs.parametersByTool).every(parameters) ||
    ![upscale.upscale.scale, upscale.hires.scale].every(
      (scale) =>
        sameTypes(scale, initialScale) &&
        ['to', 'by'].includes(scale.mode) &&
        [scale.w, scale.h, scale.factor].every(size)
    ) ||
    !sameTypes(upscale.hires, {
      on: false,
      strength: 0,
      steps: 0,
      tiled: false,
      colorMatch: 0,
      sampler: '',
      scheduler: ''
    })
  )
    throw invalidSession()

  if (
    !sameTypes(detailer, initialDetailer) ||
    !['yolo', 'sam3'].includes(detailer.method) ||
    !parameters(detailer.parameters) ||
    !text(background.model) ||
    !bool(background.keepMask) ||
    ![tools.eraser, tools.frameMode, tools.paintBrush, tools.pan, tools.showMask].every(bool) ||
    !text(tools.brushColor) ||
    !size(tools.brushSize) ||
    (adjustments !== undefined &&
      (!bool(adjustments.showPreview) ||
        !sameTypes(adjustments.values, neutralAdjustments) ||
        !Object.keys(neutralAdjustments.levels).every((key) =>
          sameTypes(adjustments.values.levels[key as keyof typeof neutralAdjustments.levels], neutralLevels)
        )))
  )
    throw invalidSession()

  if (
    !text(document.fileName) ||
    !metadata(document.info) ||
    (document.created !== undefined && !bool(document.created)) ||
    !Array.isArray(variants.items) ||
    !Number.isInteger(variants.index) ||
    !bool(variants.compare) ||
    variants.index < -1 ||
    variants.index >= variants.items.length ||
    !variants.items.every((entry) => {
      const request = entry?.prepared?.request
      return (
        text(entry?.id) &&
        request &&
        tool(request.tool) &&
        text(request.profile) &&
        text(request.prompt) &&
        text(request.negative) &&
        finite(request.seed) &&
        Array.isArray(request.size) &&
        request.size.length === 2 &&
        request.size.every(size) &&
        parameters(request.parameters) &&
        rect(entry.prepared.crop) &&
        rect(entry.prepared.target)
      )
    }) ||
    !references.every((entry) => entry && text(entry.id) && text(entry.name)) ||
    (inspection !== undefined &&
      (!text(inspection.name) ||
        !text(inspection.type) ||
        !finite(inspection.lastModified) ||
        !metadata(inspection.info)))
  )
    throw invalidSession()

  const work = document.work
  if (work) {
    const image = Object.hasOwn(frames, work.image) && frames[work.image]
    const { margins, crop } = work
    if (
      !image ||
      !object(margins) ||
      ![margins.left, margins.right, margins.top, margins.bottom].every(finite) ||
      (crop !== undefined && !rect(crop))
    )
      throw invalidSession()
    if (work.drawing) {
      const { w, h } = expandedRect(image, margins)
      if (!validSize(w, h)) throw invalidSession()
    }
  }
}

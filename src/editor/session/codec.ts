import { generationOf, restoreGeneration } from '../frameInfo.js'
import type { Request, Variant } from '../generation.js'
import { canvas, context2d } from '../../image/canvas.js'
import { validSize } from '../../image/pixels.js'
import type { Work } from '../../types/editor.js'
import type { Frame, Stroke } from '../../types/image.js'
import type { Workspace } from './workspace.js'

type Asset = { size: number; body: () => Blob }
export const invalidSession = () => new Error('Invalid editor session.')

export function createSessionCodec() {
  const ids = new WeakMap<object, Map<string, string>>()

  function remember(object: object, part: string, id: string) {
    const parts = ids.get(object) ?? new Map<string, string>()
    parts.set(part, id)
    ids.set(object, parts)
    return id
  }

  function encode(workspace: Workspace) {
    const assets = new Map<string, Asset>()
    const frames: Record<string, FrameData> = {}

    function asset(object: object, part: string, size: number, body: () => Blob) {
      const id = ids.get(object)?.get(part) ?? remember(object, part, crypto.randomUUID())
      assets.set(id, { size, body })
      return id
    }

    function pixels(data: Uint8ClampedArray, owner: object = data) {
      return asset(owner, 'pixels', data.byteLength, () => {
        const bytes =
          data.buffer instanceof ArrayBuffer
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            : data.slice()
        return new Blob([bytes])
      })
    }

    function frame(value: Frame): string
    function frame(value?: Frame): string | undefined
    function frame(value?: Frame) {
      if (!value) return
      const { x, y, w, h } = value
      const id = pixels(value.pixels, value)
      frames[id] = { x, y, w, h, generation: generationOf(value) }
      return id
    }

    function stroke({ mask, ...value }: Stroke) {
      const raster = mask && {
        id: asset(
          mask,
          'raster',
          mask.width * mask.height * 4,
          () => new Blob([context2d(mask).getImageData(0, 0, mask.width, mask.height).data])
        ),
        w: mask.width,
        h: mask.height
      }
      return { ...value, raster }
    }

    function work(value: Work) {
      return {
        ...value,
        image: frame(value.image),
        start: frame(value.start),
        strokes: value.strokes.map(stroke),
        drawing: value.drawing?.map(stroke)
      }
    }

    // Replay requests can include full-resolution base64 inputs. Keep them out of the manifest as well.
    function request(value: Request) {
      const { image, mask, reference, references, ...settings } = value
      const media = (part: string, text: string) => asset(value, part, text.length, () => new Blob([text]))
      return {
        ...settings,
        image: image && media('image', image),
        mask: mask && media('mask', mask),
        reference: reference && media('reference', reference),
        references: references?.map((text, index) => media(`reference:${index}`, text))
      }
    }

    function variant({ frame: image, before, mask, prepared, ...value }: Variant) {
      return {
        ...value,
        frame: frame(image),
        before: frame(before),
        mask: mask && pixels(mask),
        prepared: {
          ...prepared,
          source: frame(prepared.source),
          request: request(prepared.request),
          effectiveMask: prepared.effectiveMask && pixels(prepared.effectiveMask)
        }
      }
    }

    const { document, references, variants, inspection } = workspace
    const file = inspection?.file
    return {
      assets,
      data: {
        ...workspace,
        frames,
        document: {
          ...document,
          work: document.work && work(document.work),
          original: frame(document.original),
          saved: frame(document.saved)
        },
        references: references.map((item) => ({ ...item, frame: frame(item.frame) })),
        variants: { ...variants, items: variants.items.map(variant) },
        inspection: file && {
          info: inspection.info,
          id: asset(file, 'file', file.size, () => file),
          name: file.name,
          type: file.type,
          lastModified: file.lastModified
        }
      }
    }
  }

  type Encoded = ReturnType<typeof encode>['data']
  type SavedStroke = NonNullable<Encoded['document']['work']>['strokes'][number]
  type SavedVariant = Encoded['variants']['items'][number]
  type FrameData = Omit<Frame, 'pixels'> & { generation: ReturnType<typeof generationOf> }

  async function decode(data: Encoded, read: (id: string, size?: number) => Promise<ArrayBuffer>): Promise<Workspace> {
    const { frames, document, references, variants, inspection, ...settings } = data
    const loaded = new Map<string, Frame>()

    async function pixels(id: string, size?: number) {
      const value = new Uint8ClampedArray(await read(id, size))
      remember(value, 'pixels', id)
      return value
    }

    async function frame(id: string): Promise<Frame>
    async function frame(id?: string): Promise<Frame | undefined>
    async function frame(id?: string) {
      if (id === undefined) return
      const prior = loaded.get(id)
      if (prior) return prior
      const entry = Object.hasOwn(frames, id) && frames[id]
      if (!entry || !validSize(entry.w, entry.h) || ![entry.x, entry.y].every(Number.isFinite)) throw invalidSession()
      const { x, y, w, h, generation } = entry
      const value = restoreGeneration({ x, y, w, h, pixels: await pixels(id, w * h * 4) }, generation)
      loaded.set(id, value)
      remember(value, 'pixels', id)
      return value
    }

    async function strokes(entries: SavedStroke[]) {
      if (!Array.isArray(entries)) throw invalidSession()
      const result: Stroke[] = []
      for (const { raster, ...stroke } of entries) {
        if (
          typeof stroke.erase !== 'boolean' ||
          !Number.isFinite(stroke.size) ||
          stroke.size < 0 ||
          !Array.isArray(stroke.points) ||
          stroke.points.some((point) => !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) ||
          (stroke.color !== undefined && typeof stroke.color !== 'string')
        )
          throw invalidSession()
        if (!raster) {
          result.push(stroke)
          continue
        }
        const { id, w, h } = raster
        if (!validSize(w, h)) throw invalidSession()
        const rgba = await pixels(id, w * h * 4)
        const mask = canvas(w, h)
        context2d(mask).putImageData(new ImageData(rgba, w, h), 0, 0)
        remember(mask, 'raster', id)
        result.push({ ...stroke, mask })
      }
      return result
    }

    async function work(value: NonNullable<Encoded['document']['work']>): Promise<Work> {
      return {
        ...value,
        image: await requiredFrame(value.image),
        start: await requiredFrame(value.start),
        strokes: await strokes(value.strokes),
        drawing: value.drawing && (await strokes(value.drawing))
      }
    }

    async function requiredFrame(id: string) {
      if (typeof id !== 'string') throw invalidSession()
      return frame(id)
    }

    async function variant(value: SavedVariant): Promise<Variant> {
      const { frame: frameId, before, mask, prepared } = value
      const image = await requiredFrame(frameId)
      const { image: input, mask: inputMask, reference, references, ...options } = prepared.request
      const request: Request = options
      async function media(id: string, part: string) {
        const text = new TextDecoder().decode(await read(id))
        remember(request, part, id)
        return text
      }
      if (input) request.image = await media(input, 'image')
      if (inputMask) request.mask = await media(inputMask, 'mask')
      if (reference) request.reference = await media(reference, 'reference')
      if (references) {
        request.references = []
        for (const [index, id] of references.entries()) request.references.push(await media(id, `reference:${index}`))
      }
      return {
        ...value,
        frame: image,
        before: await frame(before),
        mask: mask === undefined ? undefined : await pixels(mask, image.w * image.h),
        prepared: {
          ...prepared,
          request,
          source: await frame(prepared.source),
          effectiveMask: prepared.effectiveMask === undefined ? undefined : await pixels(prepared.effectiveMask)
        }
      }
    }

    const restoredDocument = {
      ...document,
      work: document.work && (await work(document.work)),
      original: await frame(document.original),
      saved: await frame(document.saved)
    }
    const items: Variant[] = []
    for (const item of variants.items) items.push(await variant(item))
    const restoredReferences: Workspace['references'] = []
    for (const item of references) restoredReferences.push({ ...item, frame: await requiredFrame(item.frame) })
    let inspected: Workspace['inspection']
    if (inspection) {
      const { id, name, type, lastModified, info } = inspection
      const file = new File([await read(id)], name, { type, lastModified })
      remember(file, 'file', id)
      inspected = { file, info }
    }

    return {
      ...settings,
      document: restoredDocument,
      variants: { ...variants, items },
      references: restoredReferences,
      inspection: inspected
    }
  }

  return { encode, decode }
}

export type SessionCodec = ReturnType<typeof createSessionCodec>
export type SessionData = Parameters<SessionCodec['decode']>[0]

import type { GenerationInfo, MetadataField } from './types.js'

// What Pixelbench stores about a render. Never the image or mask payloads of the request.
export type PixelbenchRecord = {
  tool: string
  profile: string
  prompt: string
  negative?: string
  seed: number
  size: [number, number]
  parameters: Record<string, number | string>
  models?: Record<string, string>
  loras?: { name: string; strength: number }[]
  strength?: number
  colorMatch?: number
  hires?: {
    upscaler: string
    strength: number
    steps: number
    size: [number, number]
    tiled: boolean
    colorMatch?: number
  }
  variance?: number
}

const fileName = (path: string) => path.replace(/^.*[\\/]/, '')

// Settings in the order and with the names Forge uses, so both writers and readers agree.
function recordFields(record: PixelbenchRecord): MetadataField[] {
  const { parameters: p } = record
  const fields: [string, unknown][] = [
    ['Steps', p.steps],
    ['Sampler', p.sampler],
    ['Schedule type', p.scheduler],
    ['CFG scale', p.cfg],
    ['Distilled CFG Scale', p.guidance],
    ['Seed', record.seed],
    ['Size', record.size.join('x')],
    ['Model', Object.values(record.models ?? {}).map(fileName)[0]],
    ['Denoising strength', record.strength ?? p.denoise],
    ['Hires upscaler', record.hires && fileName(record.hires.upscaler)],
    ['Hires size', record.hires?.size.join('x')],
    ['Hires strength', record.hires?.strength],
    ['Profile', record.profile]
  ]
  return fields
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => ({ key, value: String(value) }))
}

const loraTags = (record: PixelbenchRecord) =>
  (record.loras ?? []).map(
    ({ name, strength }) => '<lora:' + fileName(name).replace(/\.[^.]+$/, '') + ':' + strength + '>'
  )

// "parameters" in the Forge format for other tools, "pixelbench" with the exact record for Pixelbench itself.
export function generationText(record: PixelbenchRecord): MetadataField[] {
  const prompt = [record.prompt, ...loraTags(record)].filter(Boolean).join(' ')
  const settings = [...recordFields(record), { key: 'Version', value: 'Pixelbench' }]
    .map(({ key, value }) => key + ': ' + (/[,:"]/.test(value) ? JSON.stringify(value) : value))
    .join(', ')
  const parameters = [prompt, record.negative ? 'Negative prompt: ' + record.negative : '', settings]
    .filter(Boolean)
    .join('\n')
  return [
    { key: 'parameters', value: parameters },
    { key: 'pixelbench', value: JSON.stringify({ version: 1, ...record }) }
  ]
}

export function parsePixelbench(json: string, raw: MetadataField[]): GenerationInfo | undefined {
  let record: PixelbenchRecord
  try {
    record = JSON.parse(json)
  } catch {
    return undefined
  }
  if (typeof record?.prompt !== 'string' || !Array.isArray(record.size)) return undefined
  const fields = recordFields(record)
  const loras = (record.loras ?? []).map(({ name, strength }) => fileName(name) + ' ' + strength).join(', ')
  if (loras) fields.push({ key: 'LoRAs', value: loras })
  return {
    source: 'pixelbench',
    prompt: record.prompt || undefined,
    negative: record.negative || undefined,
    fields,
    raw
  }
}

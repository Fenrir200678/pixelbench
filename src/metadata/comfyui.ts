import type { GenerationInfo, MetadataField } from './types.js'

// ComfyUI stores the API graph as "prompt" and the editor graph as "workflow". The settings come from the
// first sampler in the API graph, following its links back to the text encoders, loaders and the latent.
type Node = { class_type?: string; inputs?: Record<string, unknown> }
type Graph = Record<string, Node>
type Link = [string, number]

const isLink = (value: unknown): value is Link =>
  Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'number'
const textInputs = ['text', 'text_g', 'prompt', 'value', 'string', 'text_l']

// The text behind a conditioning or string link, through combine, concat and primitive nodes.
function textOf(graph: Graph, value: unknown, depth = 0): string | undefined {
  if (typeof value === 'string') return value
  if (!isLink(value) || depth > 12) return undefined
  const inputs = graph[value[0]]?.inputs ?? {}
  for (const key of textInputs) {
    const text = textOf(graph, inputs[key], depth + 1)
    if (text?.trim()) return text
  }
  for (const input of Object.values(inputs)) {
    if (!isLink(input)) continue
    const text = textOf(graph, input, depth + 1)
    if (text?.trim()) return text
  }
  return undefined
}

// A number or name input, directly or through a link to a primitive or selector node.
function valueOf(graph: Graph, value: unknown, keys: string[], depth = 0): string | undefined {
  if (typeof value === 'number' || typeof value === 'string') return String(value)
  if (!isLink(value) || depth > 6) return undefined
  const inputs = graph[value[0]]?.inputs ?? {}
  for (const key of [...keys, 'value']) {
    const found = valueOf(graph, inputs[key], keys, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}

// The first node of a class family that feeds the sampler, by walking its links.
function upstream(graph: Graph, start: unknown, match: (node: Node) => boolean, depth = 0): Node | undefined {
  if (!isLink(start) || depth > 16) return undefined
  const node = graph[start[0]]
  if (!node) return undefined
  if (match(node)) return node
  for (const input of Object.values(node.inputs ?? {})) {
    const found = upstream(graph, input, match, depth + 1)
    if (found) return found
  }
  return undefined
}

const nodeOf = (graph: Graph, value: unknown) => (isLink(value) ? graph[value[0]] : undefined)

export function parseComfy(promptJson: string, workflowJson?: string): GenerationInfo | undefined {
  let graph: Graph
  try {
    graph = JSON.parse(promptJson)
  } catch {
    return undefined
  }
  if (!graph || typeof graph !== 'object') return undefined
  const nodes = Object.entries(graph)
  const raw = [{ key: 'prompt', value: promptJson }]
  if (workflowJson) raw.push({ key: 'workflow', value: workflowJson })
  const [samplerId, sampler] =
    nodes.find(([, node]) => /^KSampler/.test(node.class_type ?? '')) ??
    nodes.find(([, node]) => node.class_type === 'SamplerCustomAdvanced') ??
    []
  if (!sampler || !samplerId) return { source: 'comfyui', fields: [], raw }
  const inputs = sampler.inputs ?? {}
  // SamplerCustomAdvanced keeps prompts in the guider, the seed in the noise and steps in the sigmas.
  const guider = nodeOf(graph, inputs.guider)?.inputs ?? {}
  const noise = nodeOf(graph, inputs.noise)?.inputs ?? {}
  const sigmas = nodeOf(graph, inputs.sigmas)?.inputs ?? {}
  const samplerSelect = nodeOf(graph, inputs.sampler)?.inputs ?? {}
  const positive = textOf(graph, inputs.positive ?? guider.positive ?? guider.conditioning)
  const negative = textOf(graph, inputs.negative ?? guider.negative)
  const latent = upstream(graph, inputs.latent_image, (node) => 'width' in (node.inputs ?? {}))
  const model = upstream(graph, inputs.model ?? guider.model, (node) =>
    ['ckpt_name', 'unet_name'].some((key) => key in (node.inputs ?? {}))
  )
  const loras = nodes
    .map(([, node]) => node.inputs ?? {})
    .filter((node) => typeof node.lora_name === 'string')
    .map((node) => String(node.lora_name).replace(/^.*[\\/]/, '') + ' ' + (node.strength_model ?? ''))
  const width = valueOf(graph, latent?.inputs?.width, ['width'])
  const height = valueOf(graph, latent?.inputs?.height, ['height'])
  const fields: MetadataField[] = [
    { key: 'Steps', value: valueOf(graph, inputs.steps ?? sigmas.steps, ['steps']) ?? '' },
    {
      key: 'Sampler',
      value: valueOf(graph, inputs.sampler_name ?? samplerSelect.sampler_name, ['sampler_name']) ?? ''
    },
    { key: 'Scheduler', value: valueOf(graph, inputs.scheduler ?? sigmas.scheduler, ['scheduler']) ?? '' },
    { key: 'CFG scale', value: valueOf(graph, inputs.cfg ?? guider.cfg, ['cfg']) ?? '' },
    {
      key: 'Seed',
      value: valueOf(graph, inputs.seed ?? inputs.noise_seed ?? noise.noise_seed, ['seed', 'noise_seed']) ?? ''
    },
    { key: 'Denoise', value: valueOf(graph, inputs.denoise ?? sigmas.denoise, ['denoise']) ?? '' },
    { key: 'Size', value: width && height ? width + 'x' + height : '' },
    {
      key: 'Model',
      value: String(model?.inputs?.ckpt_name ?? model?.inputs?.unet_name ?? '').replace(/^.*[\\/]/, '')
    },
    { key: 'LoRAs', value: loras.join(', ') }
  ].filter((field) => field.value !== '')
  return {
    source: 'comfyui',
    prompt: positive?.trim() || undefined,
    negative: negative?.trim() || undefined,
    fields,
    raw
  }
}

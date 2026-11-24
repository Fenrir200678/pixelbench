import { open, stat } from 'node:fs/promises'
import { win32 } from 'node:path'
import { request, searchPaths } from '../comfy.mjs'
import { profiles } from './definitions.mjs'
import { ggufFile, ggufLoader, modelFile } from './model-files.mjs'
import { detectionNodes, detectorFile } from '../jobs/detection.mjs'

const basename = (value) => value.split(/[\\/]/).at(-1).toLowerCase()
const inspectInput = (info, node, key) => info[node]?.input?.required?.[key] ?? info[node]?.input?.optional?.[key]
const options = (schema) => {
  if (Array.isArray(schema?.[0])) return schema[0]
  return schema?.[1]?.options ?? []
}

// Use the same loader types as the image graphs where the model supports text generation.
const refinementLoaders = [
  [/^qwen3vl_4b_fp8_scaled\.safetensors$/, 'krea2'],
  [/^qwen3vl_4b\.safetensors$/, 'krea2'],
  [/^qwen3vl_8b_int8_convrot\.safetensors$/, 'qwen_image'],
  [/^qwen3\.5_(?:(?:2b|4b|9b)_bf16|9b_(?:int8_convrot|w4a8_gptq))\.safetensors$/, 'stable_diffusion']
]

function inspectRefinementModels(info) {
  if (!info.TextGenerateV2 || !info.PreviewAny) return []
  const types = options(inspectInput(info, 'CLIPLoader', 'type'))
  const files = options(inspectInput(info, 'CLIPLoader', 'clip_name')).filter((file) => typeof file === 'string')
  return refinementLoaders.flatMap(([pattern, type]) =>
    types.includes(type) ? files.filter((file) => pattern.test(basename(file))).map((file) => ({ file, type })) : []
  )
}

// LoRA files from ComfyUI's loader list. The safetensors header names the model family and trigger phrase.
const loraHeaders = new Map()
const loraFamilies = [
  [/krea[-_ ]?2/i, 'krea2'],
  [/z[-_ ]?image|lumina/i, 'zimage'],
  [/qwen/i, 'qwen-image'],
  [/flux[-_. ]?2/i, 'flux2'],
  [/flux/i, 'flux'],
  [/sdxl|sd_xl|stable-diffusion-xl/i, 'sdxl'],
  [/moss/i, 'moss']
]
const familyOf = (text) => loraFamilies.find(([pattern]) => pattern.test(text))?.[1]

async function loraHeader(path) {
  const info = await stat(path)
  const key = path + '|' + info.size + '|' + info.mtimeMs
  if (loraHeaders.has(key)) return loraHeaders.get(key)
  const file = await open(path)
  try {
    const prefix = Buffer.alloc(8)
    await file.read(prefix, 0, 8, 0)
    const length = Number(prefix.readBigUInt64LE())
    if (length > 16 * 1024 * 1024) return {}
    const header = Buffer.alloc(length)
    await file.read(header, 0, length, 8)
    const meta = JSON.parse(header.toString('utf8')).__metadata__ ?? {}
    const base = [meta.ss_base_model_version, meta['modelspec.architecture']].filter(Boolean).join(' ')
    const result = {
      family: familyOf(base),
      trigger: String(meta['modelspec.trigger_phrase'] ?? '').trim() || undefined
    }
    loraHeaders.set(key, result)
    return result
  } finally {
    await file.close()
  }
}

async function inspectLoras(info, folders) {
  const files = options(inspectInput(info, 'LoraLoaderModelOnly', 'lora_name')).filter(
    (name) => typeof name === 'string' && modelFile.test(name)
  )
  return Promise.all(
    files.map(async (file) => {
      // Many LoRAs carry no metadata; their path (such as MOSS\turbo.safetensors) then names the family.
      for (const folder of folders) {
        try {
          const header = await loraHeader(win32.join(folder, file))
          return { file, ...header, family: header.family ?? familyOf(file) }
        } catch {
          // Not in this folder, or no readable header.
        }
      }
      return { file, family: familyOf(file) }
    })
  )
}

// Reuse an inspection younger than maxAge ms. Concurrent callers share one /object_info request.
export function inspect(backend, config, maxAge = 30000) {
  if (backend.inspected && Date.now() - backend.inspected.at < maxAge) return Promise.resolve(backend.inspected.result)
  backend.inspecting ??= fetchInspection(backend, config).finally(() => {
    backend.inspecting = undefined
  })
  return backend.inspecting
}

async function fetchInspection(backend, config) {
  const response = await request(backend, '/object_info', { timeout: 15000 })
  const info = await response.json()
  if (!info.PreviewImage && !info.LoadImage) throw new Error('No ComfyUI API is responding at this address.')
  const result = profiles.map(({ definition: p, graph }) => {
    const blockers = p.nodes.filter((name) => !info[name]).map((name) => 'Missing node: ' + name)
    const selected = {}
    const candidates = {}
    const catalog = {}
    const modelMissing = {}
    for (const model of p.models) {
      const id = model.node + '.' + model.input
      const choices = options(inspectInput(info, graph[model.node].class_type, model.input))
      const ggufChoices = model.gguf ? options(inspectInput(info, ggufLoader, model.input)) : []
      catalog[id] = [
        ...new Set([
          ...choices.filter((name) => typeof name === 'string' && modelFile.test(name)),
          ...ggufChoices.filter((name) => typeof name === 'string' && ggufFile.test(name))
        ])
      ]
      const matches = (candidates[id] = model.files.flatMap((file) =>
        catalog[id].filter((label) => basename(label) === file.toLowerCase())
      ))
      selected[id] = matches[0]
      if (!selected[id]) {
        const search = backend.owned
          ? searchPaths(config, model.category).join(' · ')
          : model.category + ' in this instance’s search configuration'
        modelMissing[id] = model.label + ' is missing (' + model.files.join(' or ') + '). Search path: ' + search
      }
    }
    const choices = {}
    for (const [key, parameter] of Object.entries(p.parameters)) {
      const [node, input] = p.bindings[key]
      const schema = inspectInput(info, graph[node].class_type, input)
      if (info[graph[node].class_type] && !schema)
        blockers.push('Missing node input: ' + graph[node].class_type + '.' + input)
      if (typeof parameter.default === 'string') {
        choices[key] = options(schema)
        if (schema && !choices[key].includes(parameter.default))
          blockers.push('Default value unavailable: ' + parameter.default)
      }
    }
    const missing = [...blockers, ...Object.values(modelMissing)]
    const ready = backend.owned && blockers.length === 0
    return {
      ...p,
      blockers,
      modelMissing,
      missing,
      ready,
      available: ready && missing.length === 0,
      selected,
      choices,
      candidates,
      catalog
    }
  })
  const refinementModels = backend.owned ? inspectRefinementModels(info) : []
  const loras = await inspectLoras(info, backend.owned ? searchPaths(config, 'loras') : [])
  for (const profile of result) if (profile.lora) profile.loraCatalog = loras.map(({ file }) => file)
  const upscalers = options(inspectInput(info, 'UpscaleModelLoader', 'model_name')).filter(
    (name) => typeof name === 'string' && modelFile.test(name)
  )
  for (const profile of result) if (profile.tools.includes('upscale')) profile.upscalerCatalog = upscalers
  // Hires fix renders in tiles through the Ultimate SD Upscale custom nodes.
  const tiledUpscale = Boolean(info.UltimateSDUpscale && info.UltimateSDUpscaleGuider)
  const seedVariance = Boolean(info.KreaSeedVarianceEnhancer)
  // Img2img color correction uses the KJNodes color matcher.
  const colorMatch = Boolean(info.ColorMatchV2)
  const promptWeights = Boolean(info.Krea2PromptWeight)
  // CLIP and T5 encoders read weights themselves, Krea 2 needs the KJNodes node.
  for (const profile of result)
    if (profile.weights) profile.weightsActive = profile.weights === 'clip' || promptWeights
  // Detailer: SAM3 checkpoints, when the core SAM3 nodes exist.
  const detectors = detectionNodes.every((name) => info[name])
    ? options(inspectInput(info, 'CheckpointLoaderSimple', 'ckpt_name')).filter(
        (name) => typeof name === 'string' && detectorFile.test(basename(name))
      )
    : []
  backend.inspected = {
    at: Date.now(),
    result,
    refinementModels,
    loras,
    upscalers,
    tiledUpscale,
    seedVariance,
    colorMatch,
    promptWeights,
    detectors
  }
  return result
}

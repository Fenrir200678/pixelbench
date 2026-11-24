import { profiles } from './definitions.mjs'
import { pngDimensions } from './image-payload.mjs'
import {
  checkCover,
  hiresSettings,
  upscaleSizes,
  useHiresPass,
  useTemplate,
  useTemplateMask,
  useTemplateUpscale,
  useColorMatch,
  colorMatchStrength,
  useTiledHiresFix,
  validSize
} from './image-to-image.mjs'
import { ggufFile, ggufLoader } from './model-files.mjs'
import { hasWeights, stripWeights } from '../../src/editor/promptWeights.ts'

// Inserts a LoRA loader chain after the profile's model output and rewires every consumer.
function insertLoras(graph, point, entries) {
  const same = (value, ref) => Array.isArray(value) && value[0] === ref[0] && value[1] === ref[1]
  const consumers = Object.values(graph)
  let model = point.model
  let clip = point.clip
  entries.forEach(({ name, strength }, index) => {
    const id = 'lora' + (index + 1)
    graph[id] = clip
      ? {
          class_type: 'LoraLoader',
          inputs: { model, clip, lora_name: name, strength_model: strength, strength_clip: strength }
        }
      : { class_type: 'LoraLoaderModelOnly', inputs: { model, lora_name: name, strength_model: strength } }
    model = [id, 0]
    if (clip) clip = [id, 1]
  })
  for (const node of consumers) {
    for (const [key, value] of Object.entries(node.inputs)) {
      if (same(value, point.model)) node.inputs[key] = model
      else if (point.clip && same(value, point.clip)) node.inputs[key] = clip
    }
  }
}

// More seed variance: the prompt embedding gets seed-dependent noise in the first quarter of the steps (about 2 of 8
// in Krea 2 Turbo), then the clean prompt takes over. strength scales the noise to the embedding's own spread:
// 1 is the node's recommendation for Krea 2 Turbo, higher values vary more and follow the prompt less.
function useSeedVariance(graph, [node, input], seed, strength) {
  graph.variance = {
    class_type: 'KreaSeedVarianceEnhancer',
    inputs: {
      conditioning: graph[node].inputs[input],
      randomize_percent: 50,
      auto_strength_factor: strength,
      strength: 20,
      noise_insert: 'noise on beginning steps',
      steps_switchover_percent: 25,
      seed,
      mask_starts_at: 'beginning',
      mask_percent: 0,
      log_to_console: false,
      noise_distribution: 'uniform',
      granularity: 'values'
    }
  }
  graph[node].inputs[input] = ['variance', 0]
}

// Prompt weights for Krea 2: Krea2PromptWeight encodes the weighted prompt and patches the model's attention.
// It replaces the positive text encoder output and the model at the profile's weights point (after the LoRAs).
function useKrea2Weights(graph, [encoder], modelPoint, text) {
  const same = (value, ref) => Array.isArray(value) && value[0] === ref[0] && value[1] === ref[1]
  const [node, input] = modelPoint
  const model = graph[node].inputs[input]
  graph.weights = {
    class_type: 'Krea2PromptWeight',
    inputs: { clip: graph[encoder].inputs.clip, model, text, strength: 1 }
  }
  for (const [id, entry] of Object.entries(graph)) {
    if (id === 'weights') continue
    for (const [key, value] of Object.entries(entry.inputs)) {
      if (same(value, [encoder, 0])) entry.inputs[key] = ['weights', 1]
      else if (same(value, model)) entry.inputs[key] = ['weights', 0]
    }
  }
}

export function buildGraph(profile, data, jobId) {
  const graph = structuredClone(profiles.find((p) => p.definition.id === profile.id).graph)
  const set = ([node, input], value) => {
    graph[node].inputs[input] = value
  }
  const size = data.size
  const upscale = data.tool === 'upscale'
  // Upscaling writes the output size, which may exceed the profile's own generation limits.
  if (!validSize(size, upscale ? upscaleSizes : profile.sizes))
    throw new Error('Generation size does not fit the profile’s size grid.')
  if (
    typeof data.prompt !== 'string' ||
    (!data.prompt.trim() && !upscale) ||
    data.prompt.length > 16000 ||
    !profile.tools.includes(data.tool)
  )
    throw new Error('Invalid tool or prompt.')
  if (!Number.isSafeInteger(data.seed) || data.seed < 0) throw new Error('The seed must be a non-negative integer.')
  if (profile.bindings.seed) set(profile.bindings.seed, data.seed)
  // Encoders that ignore weights get the plain text. Krea 2 weights go through their own node further below.
  const weights = profile.weightsActive ? profile.weights : undefined
  const plain = (text) => (weights ? text : stripWeights(text).replace(/ {2,}/g, ' '))
  const prompt = data.prompt.trim()
  const krea2Weights = weights === 'krea2' && hasWeights(prompt)
  // A hires fix without a prompt still needs a neutral description for the tiles.
  if (profile.bindings.prompt) set(profile.bindings.prompt, plain(prompt) || 'high quality, sharp focus, fine details')
  if (profile.bindings.negative)
    set(
      profile.bindings.negative,
      plain(
        String(data.negative ?? '')
          .slice(0, 16000)
          .trim()
      )
    )
  if (profile.bindings.width) set(profile.bindings.width, size[0])
  if (profile.bindings.height) set(profile.bindings.height, size[1])
  const files = []
  if (profile.bindings.image) {
    files.push({ name: 'image.png', payload: data.image, size })
    set(profile.bindings.image, jobId + '/image.png')
  }
  const template = data.tool === 'create' && data.image !== undefined
  let colorMatch = 0
  let templateUpscaler
  if (template) {
    if (!profile.img2img) throw new Error('This profile does not support a template image.')
    const strength = data.strength
    if (typeof strength !== 'number' || !Number.isFinite(strength) || strength < 0.05 || strength > 1)
      throw new Error('Invalid template strength.')
    graph.template = { class_type: 'LoadImage', inputs: { image: jobId + '/image.png' } }
    let pixels = ['template', 0]
    // upscaler: the template comes at its own smaller size and the upscale model enlarges it.
    if (data.upscaler !== undefined) {
      if (!profile.upscalerCatalog?.includes(data.upscaler))
        throw new Error('Upscale model is not available in the loader · ' + data.upscaler)
      const [w, h] = pngDimensions(data.image)
      if (!w || !h || w > size[0] || h > size[1]) throw new Error('The template to enlarge exceeds the generation size.')
      templateUpscaler = data.upscaler
      pixels = useTemplateUpscale(graph, templateUpscaler, size)
    }
    useTemplate(graph, profile.img2img, pixels, strength)
    colorMatch = colorMatchStrength(data.colorMatch)
    files.push({ name: 'image.png', payload: data.image, size: templateUpscaler ? undefined : size })
    if (data.mask !== undefined) {
      useTemplateMask(graph, jobId + '/mask.png')
      files.push({ name: 'mask.png', payload: data.mask, size })
    }
  } else if (data.tool === 'create' && data.mask !== undefined) throw new Error('A mask needs a template image.')
  let hires, upscaler
  if (upscale) {
    const source = pngDimensions(data.image)
    graph.upscaleSource = { class_type: 'LoadImage', inputs: { image: jobId + '/image.png' } }
    files.push({ name: 'image.png', payload: data.image })
    if (graph.scale) {
      // The plain upscaler: an upscale model or Lanczos alone, cropped from the center to the exact size.
      checkCover(source, size)
      upscaler = data.upscaler
      if (upscaler === 'lanczos') {
        graph.scale.inputs.image = ['upscaleSource', 0]
        delete graph.upscale
        delete graph.upscaleModel
      } else if (profile.upscalerCatalog?.includes(upscaler)) graph.upscaleModel.inputs.model_name = upscaler
      else throw new Error('Upscale model is not available in the loader · ' + upscaler)
      graph.scale.inputs.crop = 'center'
    } else hires = hiresSettings(profile, data.hires, size, source)
  }
  const qwenFunEdit = data.tool === 'edit' && profile.id === 'qwen21-turbo-fun'
  if (qwenFunEdit) {
    const patch = graph.patch.inputs
    delete patch.inpaint_image
    delete patch.mask
    patch.image = ['edges', 0]
    graph.sample.inputs.latent_image = ['encode', 2]
    delete graph.mask
    delete graph.source
    delete graph.latent
  }
  if (data.tool === 'outpaint' && profile.id === 'qwen21-turbo-fun') {
    // The expanded input contains filler pixels. Guide the extension with the masked ControlNet input.
    delete graph.encode.inputs['images.image_1']
  }
  if (profile.bindings.mask && !qwenFunEdit) {
    set(profile.bindings.mask, jobId + '/mask.png')
    files.push({ name: 'mask.png', payload: data.mask, size })
  }
  const references = data.references ?? (data.reference ? [data.reference] : [])
  if (!Array.isArray(references) || references.length > (profile.referenceLimit ?? 1))
    throw new Error('Too many reference images.')
  if (references.length) {
    if (!profile.reference) throw new Error('This profile does not support reference images.')
    references.forEach((payload, index) => {
      const node = 'reference' + (index + 2)
      const name = node + '.png'
      graph[node] = { class_type: 'LoadImage', inputs: { image: jobId + '/' + name } }
      const [encoder, input] = profile.reference
      set([encoder, index === 0 ? input : 'images.image_' + (index + 2)], [node, 0])
      files.push({ name, payload })
    })
  }
  const parameters = {}
  for (const [key, p] of Object.entries(profile.parameters)) {
    const value = data.parameters?.[key] ?? p.defaultsByTool?.[data.tool] ?? p.default
    const valid =
      typeof p.default === 'string'
        ? profile.choices[key].includes(value)
        : typeof value === 'number' &&
          Number.isFinite(value) &&
          value >= p.min &&
          value <= p.max &&
          (p.step !== 1 || Number.isInteger(value))
    if (!valid) throw new Error('Invalid value for ' + p.label + '.')
    set(profile.bindings[key], (parameters[key] = value))
  }
  const models = {}
  for (const model of profile.models) {
    const key = model.node + '.' + model.input
    const value = data.models?.[key] ?? profile.selected[key]
    if (!value) throw new Error(profile.modelMissing[key] ?? 'Select ' + model.label + '.')
    if (!profile.catalog[key].includes(value))
      throw new Error('File unavailable in the loader for ' + model.label + ' · ' + value)
    if (model.gguf && ggufFile.test(value)) graph[model.node] = { class_type: ggufLoader, inputs: {} }
    set([model.node, model.input], (models[key] = value))
  }
  const loras = data.loras ?? []
  if (!Array.isArray(loras) || loras.length > 8) throw new Error('Too many LoRAs.')
  if (loras.length && !profile.lora) throw new Error('This profile does not support LoRAs.')
  for (const lora of loras) {
    if (!profile.loraCatalog?.includes(lora?.name))
      throw new Error('LoRA is unavailable in the loader · ' + lora?.name)
    if (typeof lora.strength !== 'number' || !Number.isFinite(lora.strength) || Math.abs(lora.strength) > 10)
      throw new Error('Invalid LoRA strength · ' + lora.name)
  }
  if (loras.length)
    insertLoras(
      graph,
      profile.lora,
      loras.map(({ name, strength }) => ({ name, strength }))
    )
  if (krea2Weights) useKrea2Weights(graph, profile.bindings.prompt, profile.weightsModel, prompt)
  // The variance noise follows the render seed, so a locked seed reproduces the same image.
  const variance = data.tool === 'create' ? (data.variance ?? 0) : 0
  if (typeof variance !== 'number' || !Number.isFinite(variance) || variance < 0 || variance > 10)
    throw new Error('Invalid variation strength.')
  if (variance > 0) {
    if (!profile.variance) throw new Error('This profile does not support extra variation.')
    useSeedVariance(graph, profile.variance, data.seed, variance)
  }
  if (hires) {
    if (hires.tiled) useTiledHiresFix(graph, profile, hires)
    else useHiresPass(graph, profile, hires)
    // The source before the upscale model is the color reference, since the model can shift colors as well.
    useColorMatch(graph, ['upscaleSource', 0], hires.colorMatch)
  } else if (colorMatch) useColorMatch(graph, ['template', 0], colorMatch)
  return {
    graph,
    files,
    parameters,
    models,
    loras,
    strength: template ? data.strength : undefined,
    colorMatch: colorMatch || hires?.colorMatch || undefined,
    upscaler: upscaler ?? hires?.upscaler ?? templateUpscaler,
    // tiles and prescale let the job report which tile is sampling. prescale: the model upscale runs first.
    hires: hires && {
      strength: hires.strength,
      steps: hires.steps,
      size: hires.size,
      tiled: hires.tiled,
      tiles: hires.tiles,
      prescale: hires.factor !== 1
    }
  }
}

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, isAbsolute, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { setTimeout as pause } from 'node:timers/promises'
import { defaults } from '../server/comfy.mjs'
import { buildGraph, profiles } from '../server/profiles.mjs'
import { detectionBoxes, detectionGraph, detectionTerms, detectorFile } from '../server/jobs/detection.mjs'
import { refinementGraph } from '../server/jobs/refinement.mjs'

const qwenGguf = 'QwenImage\\qwen-image-2.1-step90000-Q5_K_M.gguf'

test('model choices bind the exact loader file, including a local alternative absent from the template', () => {
  const file = 'Klein\\Local model.safetensors'
  const profile = {
    id: 'flux2-klein',
    tools: ['edit'],
    sizes: { grid: 16, min: 256, max: 2048, area: 2097152 },
    bindings: { image: ['image', 'image'], prompt: ['prompt', 'text'], seed: ['noise', 'noise_seed'] },
    parameters: {},
    choices: {},
    modelMissing: { 'unet.unet_name': 'Empfohlenes Modell fehlt' },
    models: [{ node: 'unet', input: 'unet_name', label: 'Diffusionsmodell' }],
    selected: {},
    candidates: { 'unet.unet_name': [] },
    catalog: { 'unet.unet_name': [file] }
  }
  const args = { tool: 'edit', prompt: 'make the circle blue', seed: 5, size: [256, 256] }
  const mapped = buildGraph(profile, { ...args, models: { 'unet.unet_name': file } }, 'job')
  assert.equal(mapped.models['unet.unet_name'], file)
  assert.equal(mapped.graph.unet.inputs.unet_name, file)
  assert.throws(() => buildGraph(profile, args, 'job'), /Empfohlenes Modell fehlt/)
  assert.throws(
    () => buildGraph(profile, { ...args, models: { 'unet.unet_name': 'anderes.safetensors' } }, 'job'),
    /unavailable in the loader/
  )
})

test('Qwen Fun uses edges for edits and a mask for inpainting and outpainting', () => {
  const { definition } = profiles.find(({ definition }) => definition.id === 'qwen21-turbo-fun')
  const profile = { ...definition, models: [], choices: { sampler: ['euler'] } }
  const args = { prompt: 'A bright blue circle', seed: 5, size: [320, 256] }
  const edit = buildGraph(profile, { ...args, tool: 'edit' }, 'job')
  assert.equal(edit.graph.mask, undefined)
  assert.equal(edit.graph.patch.inputs.mask, undefined)
  assert.equal(edit.graph.patch.inputs.inpaint_image, undefined)
  assert.deepEqual(edit.graph.patch.inputs.image, ['edges', 0])
  assert.deepEqual(edit.graph.sample.inputs.latent_image, ['encode', 2])
  assert.deepEqual(edit.graph.encode.inputs['images.image_1'], ['image', 0])
  assert.equal(edit.files.length, 1)
  assert.equal(edit.graph.patch.inputs.strength, 0.35)
  const disabled = buildGraph(profile, { ...args, tool: 'edit', parameters: { controlStrength: 0 } }, 'job')
  assert.equal(disabled.graph.patch.inputs.strength, 0)
  assert.equal(disabled.parameters.controlStrength, 0)
  for (const tool of ['inpaint', 'outpaint']) {
    const { graph, files } = buildGraph(profile, { ...args, tool, mask: 'mask-payload' }, 'job')
    assert.deepEqual(graph.mask.inputs, { image: 'job/mask.png', channel: 'red' })
    assert.deepEqual(graph.patch.inputs.mask, ['mask', 0])
    assert.deepEqual(graph.latent.inputs.mask, ['mask', 0])
    assert.deepEqual(graph.encode.inputs['images.image_1'], tool === 'inpaint' ? ['image', 0] : undefined)
    assert.equal(graph.patch.inputs.strength, 1)
    assert.deepEqual(files[1], { name: 'mask.png', payload: 'mask-payload', size: args.size })
  }
  assert.throws(
    () => buildGraph(profile, { ...args, tool: 'edit', parameters: { controlStrength: 1.5 } }, 'job'),
    /Invalid value for ControlNet-Stärke/
  )
})

test('outpaint refinement with an image lets the vision model describe the new area', () => {
  const model = { file: 'qwen3vl_8b_int8_convrot.safetensors', type: 'qwen_image' }
  const data = { prompt: '', tool: 'outpaint', image: 'png', sides: ['bottom', 'left'] }
  const graph = refinementGraph(model, data, 'job')
  assert.deepEqual(graph.image.inputs, { image: 'job/image.png' })
  assert.deepEqual(graph.refine.inputs['images.image1'], ['image', 0])
  assert.equal(graph.refine.inputs.prompt, 'Describe the new area below and to the left of the image.')
  assert.equal(refinementGraph(model, { prompt: 'a cat', tool: 'outpaint' }, 'job').image, undefined)
})

test('Qwen 2.1 routes GGUF and safetensors to their respective diffusion loaders', () => {
  const { definition } = profiles.find(({ definition }) => definition.id === 'qwen21')
  const safetensors = 'QwenImage\\qwen_image_2.1_bf16.safetensors'
  const key = 'unet.unet_name'
  const profile = {
    ...definition,
    models: definition.models.filter(({ node }) => node === 'unet'),
    choices: { sampler: ['euler'], scheduler: ['simple'] },
    selected: { [key]: qwenGguf },
    catalog: { [key]: [qwenGguf, safetensors] }
  }
  const args = { tool: 'edit', prompt: 'Make the circle blue', seed: 5, size: [256, 256] }
  const { graph } = buildGraph(profile, args, 'job')
  assert.deepEqual(graph.unet, { class_type: 'UnetLoaderGGUF', inputs: { unet_name: qwenGguf } })
  assert.deepEqual(graph.cache.inputs.model, ['unet', 0])
  const standard = buildGraph(profile, { ...args, models: { [key]: safetensors } }, 'job')
  assert.deepEqual(standard.graph.unet, {
    class_type: 'UNETLoader',
    inputs: { unet_name: safetensors, weight_dtype: 'default' }
  })
})

test('text-to-image profiles set the latent size and upload no input image', () => {
  for (const id of [
    'sdxl-t2i',
    'krea2-t2i',
    'zimage-turbo-t2i',
    'zimage-t2i',
    'qwen21-t2i',
    'qwen21-turbo-t2i',
    'moss-image-t2i',
    'moss-image-turbo-t2i'
  ]) {
    const { definition } = profiles.find(({ definition }) => definition.id === id)
    const profile = {
      ...definition,
      models: [],
      choices: {
        sampler: [definition.parameters.sampler.default],
        scheduler: [definition.parameters.scheduler?.default]
      }
    }
    const { graph, files } = buildGraph(
      profile,
      { tool: 'create', prompt: 'A red fox', seed: 7, size: [1216, 832] },
      'job'
    )
    assert.deepEqual(files, [])
    assert.equal(graph.latent.inputs.width, 1216)
    assert.equal(graph.latent.inputs.height, 832)
    const value = ([node, input]) => graph[node].inputs[input]
    assert.equal(value(definition.bindings.prompt), 'A red fox')
    assert.equal(value(definition.bindings.seed), 7)
    assert.ok(Object.values(graph).every((node) => node.class_type !== 'LoadImage'))
    assert.throws(() => buildGraph(profile, { tool: 'edit', prompt: 'x', seed: 7, size: [1216, 832] }, 'job'))

    // With a template, the empty latent becomes the encoded upload and strength sets the denoise.
    const template = { tool: 'create', prompt: 'A red fox', seed: 7, size: [1216, 832], image: 'png', strength: 0.4 }
    const result = buildGraph(profile, template, 'job')
    assert.deepEqual(
      result.files.map(({ name }) => name),
      ['image.png']
    )
    assert.equal(result.graph.latent, undefined)
    assert.equal(result.graph.template.inputs.image, 'job/image.png')
    assert.deepEqual(result.graph.templateLatent.inputs.vae, result.graph.decode.inputs.vae)
    assert.deepEqual(result.graph.sample.inputs.latent_image, ['templateLatent', 0])
    if (definition.img2img.denoise) assert.equal(result.graph.sample.inputs.denoise, 0.4)
    else {
      assert.deepEqual(result.graph.sample.inputs.sigmas, ['templateSigmas', 1])
      assert.equal(result.graph.templateSigmas.inputs.denoise, 0.4)
    }
    assert.equal(result.strength, 0.4)
    assert.throws(() => buildGraph(profile, { ...template, strength: 0 }, 'job'))
    assert.equal(result.graph.colorMatch, undefined)

    // Color correction: the decoded result is matched to the template before the preview.
    const matched = buildGraph(profile, { ...template, colorMatch: 0.8 }, 'job')
    assert.deepEqual(matched.graph.colorMatch.inputs.image_target, result.graph.preview.inputs.images)
    assert.deepEqual(matched.graph.colorMatch.inputs.image_ref, ['template', 0])
    assert.equal(matched.graph.colorMatch.inputs.strength, 0.8)
    assert.deepEqual(matched.graph.preview.inputs.images, ['colorMatch', 0])
    assert.equal(matched.colorMatch, 0.8)
    assert.throws(() => buildGraph(profile, { ...template, colorMatch: 2 }, 'job'), /color correction/)

    // Detailer: a mask limits the new noise to the object, the sampler reads the masked latent.
    const masked = buildGraph(profile, { ...template, mask: 'png' }, 'job')
    assert.deepEqual(
      masked.files.map(({ name }) => name),
      ['image.png', 'mask.png']
    )
    assert.equal(masked.graph.templateMask.inputs.image, 'job/mask.png')
    assert.deepEqual(masked.graph.templateNoise.inputs.samples, ['templateLatent', 0])
    assert.deepEqual(masked.graph.sample.inputs.latent_image, ['templateNoise', 0])
    assert.throws(
      () => buildGraph(profile, { tool: 'create', prompt: 'x', seed: 7, size: [1216, 832], mask: 'png' }, 'job'),
      /template image/
    )

    // Detailer with an upscaler: the small crop is enlarged by the model, then stretched to the size and encoded.
    const crop = { ...template, image: png(304, 208), upscaler: '4xNomos8kSC.safetensors' }
    const upscaleProfile = { ...profile, upscalerCatalog: [crop.upscaler] }
    const enlarged = buildGraph(upscaleProfile, crop, 'job')
    assert.equal(enlarged.graph.templateUpscaleModel.inputs.model_name, crop.upscaler)
    assert.deepEqual(enlarged.graph.templateUpscaled.inputs.image, ['template', 0])
    assert.deepEqual(
      [enlarged.graph.templateScaled.inputs.width, enlarged.graph.templateScaled.inputs.height],
      [1216, 832]
    )
    assert.deepEqual(enlarged.graph.templateLatent.inputs.pixels, ['templateScaled', 0])
    assert.equal(enlarged.files[0].size, undefined)
    assert.equal(enlarged.upscaler, crop.upscaler)
    assert.throws(() => buildGraph(profile, crop, 'job'), /not available/)
    assert.throws(() => buildGraph(upscaleProfile, { ...crop, image: png(1600, 900) }, 'job'), /exceeds/)

    // Hires fix on an existing image: tiles with the upscale model, then Lanczos to the exact size.
    const upscaler = '4x-UltraSharpV2.safetensors'
    const hiresProfile = { ...profile, upscalerCatalog: [upscaler] }
    const settings = { upscaler, strength: 0.3, steps: 0, size: [2048, 1024], tiled: true }
    const hires = { tool: 'upscale', prompt: '', seed: 9, size: [2048, 1024], image: png(1024, 512), hires: settings }
    const resolves = (graph) =>
      Object.values(graph).every((item) =>
        Object.values(item.inputs).every((value) => !Array.isArray(value) || graph[value[0]])
      )
    const checkHires = (graph, seed) => {
      const node = graph.upscale
      assert.deepEqual(graph.preview.inputs.images, ['upscaleScale', 0])
      assert.deepEqual(graph.upscaleScale.inputs.image, ['upscale', 0])
      assert.equal(node.inputs.upscale_by, 2)
      assert.equal(node.inputs.seed, seed)
      assert.equal(graph.upscaleModel.inputs.model_name, upscaler)
      assert.equal(graph.upscaleScale.inputs.width, 2048)
      assert.equal(graph.upscaleScale.inputs.height, 1024)
      assert.equal(node.class_type, definition.img2img.denoise ? 'UltimateSDUpscale' : 'UltimateSDUpscaleGuider')
      if (definition.img2img.denoise) assert.equal(node.inputs.denoise, 0.3)
      else assert.equal(graph.upscaleSigmas.inputs.denoise, 0.3)
      assert.ok(resolves(graph))
    }
    const fixed = buildGraph(hiresProfile, hires, 'job')
    checkHires(fixed.graph, 9)
    assert.equal(fixed.graph.colorMatch, undefined)
    const corrected = buildGraph(hiresProfile, { ...hires, hires: { ...settings, colorMatch: 1 } }, 'job').graph
    assert.deepEqual(corrected.colorMatch.inputs.image_target, ['upscaleScale', 0])
    assert.deepEqual(corrected.colorMatch.inputs.image_ref, ['upscaleSource', 0])
    assert.deepEqual(corrected.preview.inputs.images, ['colorMatch', 0])
    assert.ok(resolves(corrected))
    assert.equal(fixed.graph.sample, undefined)
    assert.equal(fixed.graph.latent, undefined)
    assert.deepEqual(fixed.graph.upscale.inputs.image, ['upscaleSource', 0])
    assert.throws(() => buildGraph(hiresProfile, { ...hires, size: [8192, 4096] }, 'job'))
    assert.throws(() => buildGraph(hiresProfile, { ...hires, hires: { ...settings, strength: 0 } }, 'job'))
    const stepped = buildGraph(hiresProfile, { ...hires, hires: { ...settings, steps: 12 } }, 'job')
    if (definition.img2img.denoise) assert.equal(stepped.graph.upscale.inputs.steps, 12)
    assert.deepEqual(stepped.hires, {
      strength: 0.3,
      steps: 12,
      size: [2048, 1024],
      tiled: true,
      tiles: 2,
      prescale: true
    })

    // Without tiles, as in Forge: one image to image pass at the target size, snapped to the grid and scaled back.
    const single = { ...hires, size: [1500, 750], hires: { ...settings, size: [1500, 750], tiled: false } }
    const pass = buildGraph(hiresProfile, { ...single, image: png(1000, 500) }, 'job').graph
    const grid = definition.sizes.grid
    const snap = (n) => Math.round(n / grid) * grid
    assert.equal(pass.upscale, undefined)
    assert.deepEqual(pass.upscaleModelImage.inputs.image, ['upscaleSource', 0])
    assert.equal(pass.upscaleScale.inputs.width, snap(1500))
    assert.deepEqual(pass.templateLatent.inputs.pixels, ['upscaleScale', 0])
    assert.equal(pass.latent, undefined)
    if (definition.img2img.denoise) assert.equal(pass.sample.inputs.denoise, 0.3)
    else assert.equal(pass.templateSigmas.inputs.denoise, 0.3)
    assert.deepEqual(
      pass.preview.inputs.images,
      snap(750) === 750 && snap(1500) === 1500 ? ['decode', 0] : ['hiresScale', 0]
    )
    assert.ok(resolves(pass))
    // Tiles only on request, also beyond the profile's single pass limits.
    const large = {
      ...hires,
      size: [4096, 2048],
      image: png(2048, 1024),
      hires: { ...settings, size: [4096, 2048], tiled: false }
    }
    const largePass = buildGraph(hiresProfile, large, 'job').graph
    assert.equal(largePass.upscale, undefined)
    assert.deepEqual(largePass.templateLatent.inputs.pixels, ['upscaleScale', 0])
  }
})

function png(w, h) {
  const head = Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(head)
  head.writeUInt32BE(w, 16)
  head.writeUInt32BE(h, 20)
  return head.toString('base64')
}

test('seed variance wraps the positive prompt with the render seed and strength, only on request', () => {
  const { definition } = profiles.find(({ definition }) => definition.id === 'krea2-t2i')
  const profile = {
    ...definition,
    models: [],
    choices: { sampler: [definition.parameters.sampler.default], scheduler: [definition.parameters.scheduler.default] }
  }
  const data = { tool: 'create', prompt: 'A red fox', seed: 7, size: [1024, 1024] }
  const [node, input] = definition.variance
  const plain = buildGraph(profile, data, 'job').graph
  assert.equal(plain.variance, undefined)
  assert.equal(buildGraph(profile, { ...data, variance: 0 }, 'job').graph.variance, undefined)
  const { graph } = buildGraph(profile, { ...data, variance: 2.5 }, 'job')
  assert.equal(graph.variance.inputs.auto_strength_factor, 2.5)
  assert.throws(() => buildGraph(profile, { ...data, variance: 20 }, 'job'))
  assert.deepEqual(graph[node].inputs[input], ['variance', 0])
  assert.deepEqual(graph.variance.inputs.conditioning, plain[node].inputs[input])
  assert.equal(graph.variance.inputs.seed, 7)
  assert.equal(graph.variance.inputs.noise_insert, 'noise on beginning steps')
  const sdxl = profiles.find(({ definition }) => definition.id === 'sdxl-t2i').definition
  assert.equal(sdxl.variance, undefined)
})

test('detection gives every SAM3 term a limit and keeps an empty result valid', () => {
  assert.deepEqual(detectionTerms('face', 4), [{ term: 'face', count: 4 }])
  assert.deepEqual(detectionTerms(' face:2, (hand) ,, ', 3), [
    { term: 'face', count: 2 },
    { term: 'hand', count: 3 }
  ])
  assert.deepEqual(detectionTerms('eye:99', 3), [{ term: 'eye', count: 8 }])
  assert.throws(() => detectionTerms(' , ', 4), /one to four terms/)
  assert.throws(() => detectionTerms('a, b, c, d, e', 4), /one to four terms/)
  assert.throws(() => detectionTerms('face', 0), /detection count/)

  // 1216 × 832 in the PNG header, read for the blank mask.
  const header = Buffer.alloc(24)
  header.writeUInt32BE(1216, 16)
  header.writeUInt32BE(832, 20)
  const data = { tool: 'detect', image: header.toString('base64'), terms: 'face, hand:2', limit: 4, threshold: 0.5 }
  const { graph, files, models, terms } = detectionGraph(data, 'job', ['sam3.1_multiplex_fp16.safetensors'])
  assert.equal(graph.image.inputs.image, 'job/image.png')
  // One SAM3 node per term, so every box keeps its term.
  assert.deepEqual(terms, ['face', 'hand'])
  assert.equal(graph.terms0.inputs.text, 'face:4')
  assert.equal(graph.terms1.inputs.text, 'hand:2')
  assert.equal(graph.detect1.inputs.individual_masks, true)
  assert.deepEqual(graph.boxes1.inputs.source, ['detect1', 1])
  assert.deepEqual([graph.blank.inputs.width, graph.blank.inputs.height], [1216, 832])
  assert.deepEqual(graph.batch.inputs, {
    'masks.mask0': ['blank', 0],
    'masks.mask1': ['detect0', 0],
    'masks.mask2': ['detect1', 0]
  })
  assert.deepEqual(graph.preview.inputs.images, ['masks', 0])

  // Boxes come back as PreviewAny JSON per term, in mask order. A count mismatch drops them.
  const box = (x, score) => ({ x, y: 2, width: 10, height: 12, score })
  const outputs = {
    boxes0: { text: [JSON.stringify([[box(1, 0.9), box(30, 0.6)]])] },
    boxes1: { text: [JSON.stringify([[box(50, 0.7)]])] }
  }
  assert.deepEqual(detectionBoxes(outputs, terms, 3), [
    { term: 'face', x: 1, y: 2, w: 10, h: 12, score: 0.9 },
    { term: 'face', x: 30, y: 2, w: 10, h: 12, score: 0.6 },
    { term: 'hand', x: 50, y: 2, w: 10, h: 12, score: 0.7 }
  ])
  assert.equal(detectionBoxes(outputs, terms, 2), undefined)
  assert.equal(detectionBoxes({ boxes0: { text: ['oops'] } }, ['face'], 0), undefined)
  assert.deepEqual(models, { 'detector.ckpt_name': 'sam3.1_multiplex_fp16.safetensors' })
  assert.deepEqual(
    files.map(({ name }) => name),
    ['image.png']
  )
  assert.throws(() => detectionGraph(data, 'job', []), /SAM3 model/)
  assert.throws(() => detectionGraph({ ...data, threshold: 1 }, 'job', ['sam3.safetensors']), /threshold/)
  assert.ok(detectorFile.test('sam3.1_multiplex_fp16.safetensors'))
  assert.ok(!detectorFile.test('sdxl.safetensors'))
})

test('the upscale-only profile scales with the chosen model and needs no prompt', () => {
  const { definition } = profiles.find(({ definition }) => definition.id === 'upscale')
  const upscaler = 'ESRGAN\\4xNomos8kSC.safetensors'
  const profile = { ...definition, upscalerCatalog: [upscaler], choices: {} }
  const data = { tool: 'upscale', prompt: '', seed: 1, size: [3000, 2000], image: png(1500, 1000), upscaler }
  const { graph, files } = buildGraph(profile, data, 'job')
  assert.equal(graph.scale.inputs.width, 3000)
  assert.equal(graph.scale.inputs.height, 2000)
  assert.equal(graph.upscaleModel.inputs.model_name, upscaler)
  assert.equal(graph.upscaleSource.inputs.image, 'job/image.png')
  assert.deepEqual(
    files.map(({ name }) => name),
    ['image.png']
  )
  assert.equal(graph.scale.inputs.crop, 'center')
  // Lanczos alone skips the upscale model. Another aspect ratio is cropped from the center.
  const plain = buildGraph(profile, { ...data, upscaler: 'lanczos', size: [3000, 3000] }, 'job').graph
  assert.deepEqual(plain.scale.inputs.image, ['upscaleSource', 0])
  assert.equal(plain.upscaleModel, undefined)
  assert.throws(() => buildGraph(profile, { ...data, upscaler: 'missing.pth' }, 'job'))
  assert.throws(() => buildGraph(profile, { ...data, size: [6400, 4000] }, 'job'))
})

test('LoRAs are chained after the model loader and every consumer is rewired', () => {
  const lora = 'Krea2\\style.safetensors'
  const find = (id) => profiles.find(({ definition }) => definition.id === id).definition
  const args = { tool: 'create', prompt: 'A red fox', seed: 7, size: [1024, 1024] }
  const krea = find('krea2-t2i')
  const kreaProfile = {
    ...krea,
    models: [],
    choices: { sampler: ['euler'], scheduler: ['simple'] },
    loraCatalog: [lora]
  }
  const loras = [
    { name: lora, strength: 0.8 },
    { name: lora, strength: -0.5 }
  ]
  const { graph } = buildGraph(kreaProfile, { ...args, loras }, 'job')
  assert.deepEqual(graph.lora1.inputs, { model: ['unet', 0], lora_name: lora, strength_model: 0.8 })
  assert.deepEqual(graph.lora2.inputs.model, ['lora1', 0])
  assert.deepEqual(graph.sample.inputs.model, ['lora2', 0])
  assert.throws(() => buildGraph(kreaProfile, { ...args, loras: [{ name: 'other.safetensors', strength: 1 }] }, 'job'))
  assert.throws(() => buildGraph(kreaProfile, { ...args, loras: [{ name: lora, strength: 'x' }] }, 'job'))

  const sdxl = find('sdxl-t2i')
  const sdxlProfile = {
    ...sdxl,
    models: [],
    choices: { sampler: ['dpmpp_2m'], scheduler: ['karras'] },
    loraCatalog: [lora]
  }
  const clipped = buildGraph(sdxlProfile, { ...args, loras: [{ name: lora, strength: 1 }] }, 'job').graph
  assert.equal(clipped.lora1.class_type, 'LoraLoader')
  assert.deepEqual(clipped.sample.inputs.model, ['lora1', 0])
  assert.deepEqual(clipped.positive.inputs.clip, ['lora1', 1])
  assert.deepEqual(clipped.negative.inputs.clip, ['lora1', 1])
  assert.deepEqual(clipped.decode.inputs.vae, ['checkpoint', 2])

  // Edit and inpaint profiles use the same insertion point. In Qwen Fun the LoRA sits before the cache.
  const fun = find('qwen21-turbo-fun')
  const funProfile = { ...fun, models: [], choices: { sampler: ['euler'] }, loraCatalog: [lora] }
  const inpaint = buildGraph(
    funProfile,
    { ...args, tool: 'inpaint', size: [512, 512], mask: 'mask', loras: [{ name: lora, strength: 1 }] },
    'job'
  ).graph
  assert.deepEqual(inpaint.lora1.inputs.model, ['unet', 0])
  assert.deepEqual(inpaint.cache.inputs.model, ['lora1', 0])
  assert.ok(profiles.every(({ definition }) => definition.lora || definition.id === 'upscale'))
})

async function listen(server) {
  // The OS can allocate an ephemeral port that Fetch reserves for other protocols.
  while (true) {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const { port } = server.address()
    if (port > 10_080) return port
    await new Promise((resolve) => server.close(resolve))
  }
}

test('external ComfyUI is inspected without mutation, unavailable jobs are blocked, owned orphans are swept', async () => {
  const calls = []
  const external = createServer((req, res) => {
    calls.push(req.method + ' ' + req.url)
    res.setHeader('Content-Type', 'application/json')
    const body =
      req.url === '/object_info'
        ? {
            PreviewImage: {},
            LoadImage: {},
            UNETLoader: { input: { required: { unet_name: [['Image\\local.safetensors', 'unsupported.gguf']] } } },
            UnetLoaderGGUF: { input: { required: { unet_name: [[qwenGguf]] } } }
          }
        : { system: { comfyui_version: 'fixture' }, devices: [] }
    res.end(JSON.stringify(body))
  })
  const externalPort = await listen(external)
  const portReservation = createServer()
  const port = await listen(portReservation)
  await new Promise((resolve) => portReservation.close(resolve))
  const state = await mkdtemp(join(tmpdir(), 'pixelbench-bridge-check-'))
  const runtime = join(state, '.runtime')
  const orphan = join(runtime, 'worker-' + randomUUID())
  const foreign = join(runtime, 'worker-' + randomUUID())
  await mkdir(join(orphan, 'input'), { recursive: true })
  await mkdir(foreign)
  await writeFile(join(orphan, '.pixelbench'), 'Pixelbench worker v1')
  await writeFile(join(orphan, 'input', 'app-owned.png'), 'test data')
  await writeFile(join(foreign, 'foreign.png'), 'keep')
  await writeFile(
    join(state, '.settings.json'),
    JSON.stringify({ ...defaults, mode: 'external', address: 'http://127.0.0.1:' + externalPort })
  )
  const child = spawn(process.execPath, [fileURLToPath(new URL('../server/index.mjs', import.meta.url))], {
    windowsHide: true,
    env: { ...process.env, PIXELBENCH_PORT: String(port), PIXELBENCH_STATE: state },
    stdio: 'ignore'
  })
  const base = 'http://127.0.0.1:' + port
  let status
  try {
    for (let i = 0; i < 80; i++) {
      try {
        status = await (await fetch(base + '/api/status')).json()
        if (status.state !== 'starting') break
      } catch {
        /* Bridge is starting. */
      }
      await pause(100)
    }
    assert.equal(status?.state, 'ready', status?.message)
    assert.equal(status.mode, 'external')
    assert.match(status.message, /secure deletion|securely delete/)
    assert.ok(status.profiles.every((profile) => !profile.available))
    const flux = status.profiles.find((profile) => profile.id === 'flux2-klein')
    assert.deepEqual(flux.catalog['unet.unet_name'], ['Image\\local.safetensors'])
    assert.deepEqual(flux.candidates['unet.unet_name'], [])
    const qwen = status.profiles.find((profile) => profile.id === 'qwen21')
    assert.deepEqual(qwen.catalog['unet.unet_name'], ['Image\\local.safetensors', qwenGguf])
    assert.equal(qwen.selected['unet.unet_name'], qwenGguf)
    const turbo = status.profiles.find((profile) => profile.id === 'qwen21-turbo')
    assert.deepEqual(turbo.catalog['unet.unet_name'], ['Image\\local.safetensors'])
    const logs = await (await fetch(base + '/api/logs')).json()
    assert.ok(
      logs.entries.some((entry) => entry.source === 'Brücke' && /External connection configured/.test(entry.line))
    )
    const updated = await (await fetch(base + '/api/logs?stream=' + logs.stream + '&after=' + logs.cursor)).json()
    assert.deepEqual(updated.entries, [])
    assert.equal(await readFile(join(foreign, 'foreign.png'), 'utf8'), 'keep')
    await assert.rejects(stat(orphan), { code: 'ENOENT' })
    const { session } = await (await fetch(base + '/api/session', { method: 'POST' })).json()
    const result = await fetch(base + '/api/session/' + session + '/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    })
    assert.equal(result.status, 503)
    assert.match((await result.json()).error, /secure deletion|securely delete/)
    assert.equal(
      (await fetch(base + '/api/session/' + session + '/jobs/' + randomUUID() + '/cancel', { method: 'POST' })).status,
      404
    )
    assert.ok(calls.includes('GET /object_info'))
    assert.ok(calls.every((call) => call.startsWith('GET ')))

    const control = (action, origin) =>
      fetch(base + '/api/server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
        body: JSON.stringify({ action })
      })
    assert.equal((await control('shutdown')).status, 403)
    assert.equal((await control('shutdown', 'http://127.0.0.1:1')).status, 403)
    const original = (await (await fetch(base + '/api/server')).json()).instance
    const restarting = await control('restart', base)
    assert.equal(restarting.status, 202)
    assert.equal((await restarting.json()).instance, original)
    let replacement
    for (let i = 0; i < 80; i++) {
      try {
        const candidate = await (await fetch(base + '/api/server')).json()
        if (candidate.instance && candidate.instance !== original) {
          status = await (await fetch(base + '/api/status')).json()
          if (status.state === 'ready') {
            replacement = candidate.instance
            break
          }
        }
      } catch {
        /* The server is restarting. */
      }
      await pause(100)
    }
    assert.ok(replacement, 'A fresh server should be ready on the same port.')
    assert.equal(status.mode, 'external')
    assert.equal((await fetch(base + '/api/session/' + session + '/close', { method: 'POST' })).status, 404)

    await new Promise((resolve) => external.close(resolve))
    status = await (await fetch(base + '/api/status')).json()
    assert.equal(status.state, 'error')
    assert.match(status.message, /Cannot reach ComfyUI/)
    const shuttingDown = await control('shutdown', base)
    assert.equal(shuttingDown.status, 202)
    assert.equal((await shuttingDown.json()).instance, replacement)
    if (child.exitCode === null && child.signalCode === null) {
      await once(child, 'exit', { signal: AbortSignal.timeout(8000) })
    }
    assert.equal(child.exitCode, 0)
    await assert.rejects(fetch(base + '/api/server'))
  } finally {
    external.closeAllConnections()
    external.close()
    if (child.exitCode === null) {
      const exited = once(child, 'close')
      child.kill()
      await exited
    }
    const target = relative(tmpdir(), state)
    if (target.startsWith('pixelbench-bridge-check-') && !isAbsolute(target) && !target.includes('..')) {
      await rm(state, { recursive: true, force: true })
    }
  }
})

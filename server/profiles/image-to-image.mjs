// Detailer: only the masked part of the template gets new noise, the rest of the latent stays as encoded.
export function useTemplateMask(graph, mask) {
  graph.templateMask = { class_type: 'LoadImageMask', inputs: { image: mask, channel: 'red' } }
  graph.templateNoise = {
    class_type: 'SetLatentNoiseMask',
    inputs: { samples: ['templateLatent', 0], mask: ['templateMask', 0] }
  }
  for (const [id, node] of Object.entries(graph)) {
    if (id === 'templateNoise') continue
    for (const [key, value] of Object.entries(node.inputs))
      if (Array.isArray(value) && value[0] === 'templateLatent') node.inputs[key] = ['templateNoise', 0]
  }
}

// Image to image: swap the empty latent for the encoded pixels, which already have the generation size.
export function useTemplate(graph, point, pixels, strength) {
  const vae = Object.values(graph).find((node) => node.class_type === 'VAEDecode')?.inputs.vae
  graph.templateLatent = { class_type: 'VAEEncode', inputs: { pixels, vae } }
  for (const node of Object.values(graph))
    for (const [key, value] of Object.entries(node.inputs))
      if (Array.isArray(value) && value[0] === 'latent') node.inputs[key] = ['templateLatent', 0]
  delete graph.latent
  if (point.denoise) {
    const [node, input] = point.denoise
    graph[node].inputs[input] = strength
  } else {
    // Fixed sigma curves: keep the low-noise tail, the same way KSampler applies denoise.
    const [node, input] = point.sigmas
    graph.templateSigmas = {
      class_type: 'SplitSigmasDenoise',
      inputs: { sigmas: graph[node].inputs[input], denoise: strength }
    }
    graph[node].inputs[input] = ['templateSigmas', 1]
  }
}

// Hires fix as one image to image pass at the target size, as in Forge: upscale model, Lanczos to the profile grid,
// then the profile samples the whole image with the hires strength. Lanczos restores the exact size afterwards.
// Hires fixes run as their own job: right after sampling in the same ComfyUI prompt, the upscale model ran up to ten
// times slower because the VRAM was still occupied.
export function useHiresPass(graph, profile, hires) {
  const decode = Object.keys(graph).find((id) => graph[id].class_type === 'VAEDecode')
  const [w, h] = hires.render
  graph.upscaleModel = { class_type: 'UpscaleModelLoader', inputs: { model_name: hires.upscaler } }
  graph.upscaleModelImage = {
    class_type: 'ImageUpscaleWithModel',
    inputs: { upscale_model: ['upscaleModel', 0], image: ['upscaleSource', 0] }
  }
  graph.upscaleScale = {
    class_type: 'ImageScale',
    inputs: { image: ['upscaleModelImage', 0], upscale_method: 'lanczos', width: w, height: h, crop: 'center' }
  }
  useTemplate(graph, profile.img2img, ['upscaleScale', 0], hires.strength)
  if (hires.steps && profile.img2img.denoise) graph.sample.inputs.steps = hires.steps
  if (w !== hires.size[0] || h !== hires.size[1]) {
    graph.hiresScale = {
      class_type: 'ImageScale',
      inputs: {
        image: [decode, 0],
        upscale_method: 'lanczos',
        width: hires.size[0],
        height: hires.size[1],
        crop: 'disabled'
      }
    }
    graph.preview.inputs.images = ['hiresScale', 0]
  }
}

// Tiled hires fix: Ultimate SD Upscale enlarges with the upscale model and re-renders in tiles at the profile's
// target size. Lanczos then scales and crops the result to the exact size.
export function useTiledHiresFix(graph, profile, hires) {
  const decode = Object.keys(graph).find((id) => graph[id].class_type === 'VAEDecode')
  const sample = graph.sample.inputs
  graph.upscaleModel = { class_type: 'UpscaleModelLoader', inputs: { model_name: hires.upscaler } }
  graph.upscaleScale = {
    class_type: 'ImageScale',
    inputs: {
      image: ['upscale', 0],
      upscale_method: 'lanczos',
      width: hires.size[0],
      height: hires.size[1],
      crop: 'center'
    }
  }
  const common = {
    image: ['upscaleSource', 0],
    vae: graph[decode].inputs.vae,
    upscale_by: hires.factor,
    upscale_model: ['upscaleModel', 0],
    mode_type: 'Chess',
    tile_width: profile.sizes.target,
    tile_height: profile.sizes.target,
    mask_blur: 16,
    tile_padding: 64,
    seam_fix_mode: 'None',
    seam_fix_denoise: 1,
    seam_fix_width: 64,
    seam_fix_mask_blur: 8,
    seam_fix_padding: 16,
    force_uniform_tiles: true,
    tiled_decode: false,
    batch_size: 1
  }
  if (profile.img2img.denoise) {
    const { model, positive, negative, seed, steps, cfg, sampler_name, scheduler } = sample
    graph.upscale = {
      class_type: 'UltimateSDUpscale',
      inputs: {
        ...common,
        model,
        positive,
        negative,
        seed,
        steps: hires.steps || steps,
        cfg,
        sampler_name,
        scheduler,
        denoise: hires.strength
      }
    }
  } else {
    // Fixed sigma curves: the guider variant takes the low-noise tail of the full curve instead of a denoise value.
    graph.upscaleSigmas = {
      class_type: 'SplitSigmasDenoise',
      inputs: { sigmas: sample.sigmas, denoise: hires.strength }
    }
    graph.upscale = {
      class_type: 'UltimateSDUpscaleGuider',
      inputs: {
        ...common,
        guider: sample.guider,
        sampler: sample.sampler,
        sigmas: ['upscaleSigmas', 1],
        seed: graph[sample.noise[0]].inputs.noise_seed
      }
    }
    delete graph[sample.noise[0]]
  }
  graph.preview.inputs.images = ['upscaleScale', 0]
  delete graph.sample
  delete graph.latent
  delete graph[decode]
}

// Color correction as in Forge: after decoding, the result's color distribution is matched to the reference.
// MKL keeps the content's own contrast better than plain histogram matching. 0 leaves the result as it is.
export function useColorMatch(graph, reference, strength) {
  if (!strength) return
  graph.colorMatch = {
    class_type: 'ColorMatchV2',
    inputs: {
      image_target: graph.preview.inputs.images,
      image_ref: reference,
      method: 'mkl',
      strength,
      multithread: true
    }
  }
  graph.preview.inputs.images = ['colorMatch', 0]
}

// Color correction strength from the request: missing is off, otherwise 0 to 1.
export function colorMatchStrength(value) {
  if (value === undefined) return 0
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
    throw new Error('Invalid color correction strength.')
  return value
}

export const upscaleSizes = { grid: 1, min: 64, max: 8192, area: 24_000_000 }
export const validSize = (size, { grid, min, max, area }) =>
  Array.isArray(size) &&
  size.length === 2 &&
  size.every((n) => Number.isInteger(n) && n % grid === 0 && n >= min && n <= max) &&
  size[0] * size[1] <= area

const snapSize = (size, grid) => size.map((n) => Math.max(grid, Math.round(n / grid) * grid))

// The source covers the result and is cropped from the center, so it grows by a factor of 1 to 4.
export function checkCover(source, size) {
  const cover = Math.max(size[0] / source[0], size[1] / source[1])
  if (!source[0] || !source[1] || !(cover >= 0.99 && cover <= 4.01))
    throw new Error('Upscaling works from 1× to 4×.')
  return Math.min(4, Math.max(1, cover))
}

export function hiresSettings(profile, hires, size, source) {
  if (!profile.img2img || !profile.tools.includes('upscale'))
    throw new Error('This profile does not support a hires fix.')
  if (!hires || typeof hires !== 'object') throw new Error('Hires-Fix-Einstellungen fehlen.')
  if (!profile.upscalerCatalog?.includes(hires.upscaler))
    throw new Error('Upscale model is not available in the loader · ' + hires.upscaler)
  const { strength } = hires
  const steps = hires.steps ?? 0
  if (typeof strength !== 'number' || !Number.isFinite(strength) || strength < 0.05 || strength > 1)
    throw new Error('Invalid hires fix strength.')
  if (!Number.isInteger(steps) || steps < 0 || steps > 100) throw new Error('Invalid hires fix step count.')
  if (!validSize(size, upscaleSizes)) throw new Error('Hires fix size is out of bounds.')
  const factor = checkCover(source, size)
  const render = snapSize(size, profile.sizes.grid)
  // Tiles only when the user asks for them, also beyond the profile's own size limits.
  const tiled = hires.tiled === true
  // Ultimate SD Upscale covers the enlarged image with uniform tiles at the profile's target size.
  const tile = profile.sizes.target
  const tiles = tiled
    ? Math.ceil(Math.round(source[0] * factor) / tile) * Math.ceil(Math.round(source[1] * factor) / tile)
    : 0
  const colorMatch = colorMatchStrength(hires.colorMatch)
  return { upscaler: hires.upscaler, strength, steps, size, factor, render, tiled, tiles, colorMatch }
}

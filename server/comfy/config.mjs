import { homedir } from 'node:os'
import { isAbsolute, join, normalize } from 'node:path'

const windows = process.platform === 'win32'
// Placeholder until the installer or the settings point to a real ComfyUI.
const install = windows ? 'C:\\ComfyUI' : join(homedir(), 'ComfyUI')

export const categories = [
  'diffusion_models',
  'text_encoders',
  'vae',
  'checkpoints',
  'loras',
  'controlnet',
  'model_patches',
  'upscale_models',
  'background_removal'
]
export const memoryModes = {
  balanced: { name: 'Ausgewogen', flags: ['--cache-classic'] },
  vram: { name: 'VRAM bevorzugen', flags: ['--cache-classic', '--highvram'] },
  low: { name: 'Speichersparend', flags: ['--cache-none'] }
}
// Live sampling previews, sent per job as ComfyUI's preview_method. TAESD needs decoders in a vae_approx folder.
export const previewMethods = { off: 'none', fast: 'latent2rgb', taesd: 'taesd' }
export const defaults = {
  mode: 'managed',
  address: 'http://127.0.0.1:8188',
  memory: 'balanced',
  keepModels: false,
  previews: 'fast',
  // 0 picks a free port on every start.
  port: 0,
  // Extra ComfyUI command-line flags for the private process, such as --use-sage-attention.
  args: [],
  source: install,
  python: windows ? join(install, '.venv', 'Scripts', 'python.exe') : join(install, '.venv', 'bin', 'python'),
  roots: [],
  extra: {
    diffusion_models: [],
    text_encoders: [],
    vae: [],
    checkpoints: [],
    loras: [],
    controlnet: [],
    model_patches: [],
    upscale_models: [],
    background_removal: []
  }
}
const subdirs = {
  diffusion_models: ['diffusion_models', 'unet'],
  text_encoders: ['text_encoders', 'clip'],
  vae: ['vae'],
  checkpoints: ['checkpoints', 'Stable-Diffusion'],
  loras: ['loras', 'Lora'],
  controlnet: ['controlnet'],
  model_patches: ['model_patches'],
  upscale_models: ['upscale_models', 'ESRGAN', 'RealESRGAN'],
  background_removal: ['background_removal']
}

// Flags Pixelbench sets itself or that would open the private process to the network or to other folders.
const reservedArgs = [
  '--listen',
  '--port',
  '--tls-keyfile',
  '--tls-certfile',
  '--enable-cors-header',
  '--base-directory',
  '--output-directory',
  '--temp-directory',
  '--input-directory',
  '--user-directory',
  '--extra-model-paths-config',
  '--database-url',
  '--auto-launch',
  '--disable-auto-launch',
  '--enable-assets',
  '--disable-assets',
  '--enable-manager',
  '--disable-all-custom-nodes',
  '--whitelist-custom-nodes',
  '--front-end-version',
  '--front-end-root',
  '--disable-metadata',
  '--disable-dynamic-vram',
  '--cache-classic',
  '--cache-lru',
  '--cache-none',
  '--cache-ram',
  '--highvram',
  '--normalvram',
  '--lowvram',
  '--novram',
  '--cpu'
]

/** Splits and checks extra ComfyUI flags. Memory flags belong to the memory setting. */
export function validateArgs(values) {
  if (!Array.isArray(values) || values.length > 32) throw new Error('Invalid launch options.')
  for (const value of values) {
    if (typeof value !== 'string' || !/^[\w.:=,+/-]{1,128}$/.test(value))
      throw new Error('Invalid launch option: ' + String(value).slice(0, 40))
    const flag = value.split('=')[0].toLowerCase()
    if (reservedArgs.includes(flag)) throw new Error('Pixelbench sets this option itself: ' + flag)
  }
  if (values[0] && !values[0].startsWith('--')) throw new Error('Launch options start with --.')
  return values
}

export function validateAddress(value) {
  let address
  try {
    address = new URL(value)
  } catch {
    throw new Error('Invalid backend address.')
  }
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname) ||
    address.protocol !== 'http:' ||
    address.username ||
    address.password ||
    address.pathname !== '/' ||
    address.search ||
    address.hash
  ) {
    throw new Error('The backend address must be a local HTTP address.')
  }
  return address.origin
}

export function validateConfig(input) {
  const localPath = (val) => {
    // eslint-disable-next-line no-control-regex -- Reject control characters in paths.
    const controlCharacters = /[\u0000-\u001f]/
    if (typeof val !== 'string' || val.length > 1024 || controlCharacters.test(val)) throw new Error('Invalid path.')
    // Windows paths need a drive letter: isAbsolute also accepts \folder there, which depends on the current drive.
    if (windows ? !/^[a-z]:[\\/]/i.test(val) : !isAbsolute(val)) {
      throw new Error(windows ? 'Enter an absolute Windows path with a drive letter.' : 'Enter an absolute path.')
    }
    return normalize(val)
  }
  const paths = (values) => {
    if (!Array.isArray(values) || values.length > 20) throw new Error('Invalid model paths.')
    return [...new Set(values.map(localPath))]
  }
  if (!['managed', 'external'].includes(input.mode)) throw new Error('Invalid backend mode.')
  const memory = input.memory ?? defaults.memory
  if (typeof memory !== 'string' || !Object.hasOwn(memoryModes, memory)) throw new Error('Invalid memory mode.')
  const previews = input.previews ?? defaults.previews
  if (typeof previews !== 'string' || !Object.hasOwn(previewMethods, previews))
    throw new Error('Invalid preview setting.')
  const port = input.port ?? defaults.port
  if (!Number.isInteger(port) || (port !== 0 && (port < 1024 || port > 65535)))
    throw new Error('The ComfyUI port must be between 1024 and 65535.')
  return {
    mode: input.mode,
    memory,
    keepModels: input.keepModels === true,
    previews,
    port,
    args: validateArgs(input.args ?? defaults.args),
    address: validateAddress(input.address),
    source: localPath(input.source),
    python: localPath(input.python),
    roots: paths(input.roots),
    extra: Object.fromEntries(categories.map((category) => [category, paths(input.extra?.[category] ?? [])]))
  }
}

export function searchPaths(config, category) {
  return [
    ...new Set([
      ...config.extra[category],
      ...config.roots.flatMap((root) => subdirs[category].map((dir) => join(root, dir))),
      ...subdirs[category].map((dir) => join(config.source, 'models', dir))
    ])
  ]
}

import type { GenerationInfo } from './types.js'

// The values Pixelbench can take over from generation data. The model is left out on purpose.
export type GenerationSettings = {
  prompt?: string
  negative?: string
  seed?: number
  size?: [number, number]
  // Profile parameters by their Pixelbench key: steps, cfg, guidance, sampler, scheduler.
  parameters: Record<string, number | string>
  loras: { name: string; strength: number }[]
}

// A1111 and Forge sampler names, longest first, so "DPM++ 2M SDE" wins over "DPM++ 2M".
const samplers: [string, string][] = [
  ['DPM++ 2M SDE Heun', 'dpmpp_2m_sde'],
  ['DPM++ 2M SDE', 'dpmpp_2m_sde'],
  ['DPM++ 3M SDE', 'dpmpp_3m_sde'],
  ['DPM++ 2S a', 'dpmpp_2s_ancestral'],
  ['DPM++ 2M', 'dpmpp_2m'],
  ['DPM++ SDE', 'dpmpp_sde'],
  ['DPM2 a', 'dpm_2_ancestral'],
  ['DPM2', 'dpm_2'],
  ['DPM fast', 'dpm_fast'],
  ['DPM adaptive', 'dpm_adaptive'],
  ['Euler a', 'euler_ancestral'],
  ['Euler', 'euler'],
  ['Heun', 'heun'],
  ['LMS', 'lms'],
  ['DDIM', 'ddim'],
  ['DDPM', 'ddpm'],
  ['UniPC', 'uni_pc'],
  ['LCM', 'lcm'],
  ['Restart', 'res_multistep']
]
const schedulers: Record<string, string> = {
  automatic: '',
  karras: 'karras',
  exponential: 'exponential',
  'sgm uniform': 'sgm_uniform',
  simple: 'simple',
  normal: 'normal',
  beta: 'beta',
  'ddim uniform': 'ddim_uniform',
  'linear quadratic': 'linear_quadratic',
  'kl optimal': 'kl_optimal'
}

// "DPM++ 2M Karras" names the scheduler as a suffix, as older A1111 versions wrote it.
export function forgeSampler(name: string): { sampler?: string; scheduler?: string } {
  const match = samplers.find(([label]) => name === label || name.startsWith(label + ' '))
  if (!match) return {}
  const suffix = name.slice(match[0].length).trim().toLowerCase()
  return { sampler: match[1], scheduler: suffix ? schedulers[suffix] || undefined : undefined }
}

const loraTag = /<lora:([^:>]+):([-+]?\d*\.?\d+)(?::[^>]*)?>/gi
const number = (value?: string) =>
  value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : undefined

export function settingsOf(info: GenerationInfo): GenerationSettings {
  const field = (...keys: string[]) => info.fields.find(({ key }) => keys.includes(key))?.value
  const loras: GenerationSettings['loras'] = []
  // LoRA tags move from the prompt to the LoRA list.
  const prompt = info.prompt
    ?.replace(loraTag, (_, name: string, strength: string) => {
      loras.push({ name: name.trim(), strength: Number(strength) })
      return ''
    })
    .replace(/\s+,/g, ',')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
  // ComfyUI lists them as "name.safetensors 0.7, other.safetensors 1".
  for (const entry of (field('LoRAs') ?? '').split(/,\s*/).filter(Boolean)) {
    const match = /^(.*\S)\s+([-+]?\d*\.?\d+)$/.exec(entry)
    if (match) loras.push({ name: match[1], strength: Number(match[2]) })
  }
  const parameters: GenerationSettings['parameters'] = {}
  const steps = number(field('Steps'))
  const cfg = number(field('CFG scale'))
  const guidance = number(field('Distilled CFG Scale'))
  if (steps !== undefined) parameters.steps = steps
  if (cfg !== undefined) parameters.cfg = cfg
  if (guidance !== undefined) parameters.guidance = guidance
  const samplerName = field('Sampler')
  if (samplerName) {
    const mapped = info.source === 'forge' ? forgeSampler(samplerName) : { sampler: samplerName }
    if (mapped.sampler) parameters.sampler = mapped.sampler
    if (mapped.scheduler) parameters.scheduler = mapped.scheduler
  }
  const scheduler = field('Schedule type', 'Scheduler')
  if (scheduler) {
    const mapped = info.source === 'forge' ? schedulers[scheduler.toLowerCase()] : scheduler
    if (mapped) parameters.scheduler = mapped
  }
  const size = /^(\d+)\s*x\s*(\d+)$/.exec(field('Size') ?? '')
  return {
    prompt: prompt || undefined,
    negative: info.negative,
    seed: number(field('Seed')),
    size: size ? [Number(size[1]), Number(size[2])] : undefined,
    parameters,
    loras
  }
}

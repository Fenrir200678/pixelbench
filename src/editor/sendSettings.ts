import type { GenerationSettings } from '../metadata/settings.js'
import { clamp, fitSize } from '../image/pixels.js'
import type { LoraChoice, LoraFile, Profile, Value } from '../types/api.js'

const labels: Record<string, string> = {
  steps: 'Steps',
  cfg: 'CFG',
  guidance: 'Guidance',
  sampler: 'Sampler',
  scheduler: 'Scheduler'
}
const stem = (file: string) =>
  file
    .replace(/^.*[\\/]/, '')
    .replace(/\.(safetensors|ckpt|pt|bin)$/i, '')
    .toLowerCase()

// What a profile can take over from generation data: only its own parameters, within their limits,
// and LoRAs found by file name. skipped names everything else for the notice.
export function settingsForProfile(settings: GenerationSettings, profile: Profile, loraFiles: LoraFile[]) {
  const parameters: Record<string, Value> = {}
  const skipped: string[] = []
  for (const [key, value] of Object.entries(settings.parameters)) {
    const field = profile.parameters[key]
    const label = labels[key] ?? key
    if (!field) {
      skipped.push(label)
      continue
    }
    if (typeof field.default === 'string') {
      if (profile.choices[key]?.includes(String(value))) parameters[key] = String(value)
      else skipped.push(label + ' ' + value)
      continue
    }
    if (typeof value !== 'number') continue
    const limited = clamp(value, field.min ?? value, field.max ?? value)
    parameters[key] = (field.step ?? 1) === 1 ? Math.round(limited) : limited
  }
  const loras: LoraChoice[] = []
  for (const lora of settings.loras) {
    const file = profile.lora ? loraFiles.find((entry) => stem(entry.file) === stem(lora.name))?.file : undefined
    if (file) loras.push({ name: file, strength: lora.strength })
    else skipped.push('LoRA ' + lora.name)
  }
  const size = settings.size && fitSize(...settings.size, profile.sizes)
  return { parameters, loras, size, skipped }
}

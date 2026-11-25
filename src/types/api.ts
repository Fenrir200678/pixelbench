import type { Tool } from './editor.js'
import type { Detection, SizeRule } from './image.js'

export type Value = number | string
export type Parameters = Record<string, Value>
export type ModelChoices = Record<string, string>
export type LoraFile = { file: string; family?: string; trigger?: string }
export type LoraChoice = { name: string; strength: number }
export type ModelToggleOption = { label: string; prefix: string; hint?: string }
export type ModelSlot = {
  node: string
  input: string
  category: string
  label: string
  files: string[]
  // Variants of a fixed loader, shown as a switch in a section of their own. prefix matches the start of the file name.
  toggle?: ModelToggleOption[]
  // Title of that section. Parameters whose section names this slot's node appear there instead of under Render.
  title?: string
  hint?: string
  docs?: string
}
export type Profile = {
  id: string
  name: string
  short: string
  tools: Tool[]
  available: boolean
  missing: string[]
  sizes: SizeRule
  choices: Record<string, string[]>
  ready: boolean
  blockers: string[]
  modelMissing: ModelChoices
  models: ModelSlot[]
  selected: ModelChoices
  candidates: Record<string, string[]>
  /** Files the backend has but cannot run, such as fp8 diffusion models on Apple Silicon. */
  unsupported?: Record<string, string[]>
  catalog: Record<string, string[]>
  parameters: Record<
    string,
    {
      label: string
      // Tooltip for the field.
      hint?: string
      // Node of a toggle slot whose section shows this parameter.
      section?: string
      default: Value
      defaultsByTool?: Partial<Record<Tool, Value>>
      min?: number
      max?: number
      step?: number
    }
  >
  fixed?: Record<string, string>
  reference?: [string, string]
  referenceLimit?: number
  negative?: boolean
  // Prompt weights: clip encoders read them natively, krea2 needs KJNodes' Krea2PromptWeight. weightsActive: usable now.
  weights?: 'clip' | 'krea2'
  weightsActive?: boolean
  lora?: { model: [string, number]; clip?: [string, number]; family?: string }
  img2img?: { denoise?: [string, string]; sigmas?: [string, string] }
  // Conditioning input that the optional seed variance node wraps.
  variance?: [string, string]
}
export type Status = {
  state: 'starting' | 'ready' | 'error'
  mode: 'managed' | 'external'
  message: string
  profiles: Profile[]
  refinementModels?: string[]
  loras?: LoraFile[]
  upscalers?: string[]
  tiledUpscale?: boolean
  seedVariance?: boolean
  /** KJNodes ColorMatchV2 for the img2img and hires fix color correction. */
  colorMatch?: boolean
  /** SAM3 checkpoints for the detailer. Empty when the model or the core SAM3 nodes are missing. */
  detectors?: string[]
  memory?: Config['memory']
  device?: string
  version?: string
}
/** Live memory of the GPU in bytes. reserved is the part PyTorch in ComfyUI holds. */
export type Vram =
  { available: false } | { available: true; name: string; total: number; free: number; reserved: number }
export type Config = {
  mode: 'managed' | 'external'
  address: string
  source: string
  python: string
  memory: 'balanced' | 'vram' | 'low'
  keepModels: boolean
  previews: 'off' | 'fast' | 'taesd'
  /** Fixed port of the private process. 0 picks a free one on every start. */
  port: number
  /** Extra ComfyUI command-line flags for the private process. */
  args: string[]
  roots: string[]
  extra: Record<string, string[]>
}
export type Job = {
  id: string
  stage: 'preparing' | 'queued' | 'running' | 'cancelling' | 'complete' | 'cancelled' | 'error'
  message: string
  progress: number
  prompt?: string
  models?: Record<string, string>
  parameters?: Parameters
  /** Version of the latest live sampling preview, when the job has one. */
  preview?: number
  /** Current sampling step and speed in steps per second, while a sampler reports progress. */
  step?: { value: number; max: number; rate?: number }
  /** Finished phases of the run with their duration, for the status tooltip. */
  phases?: JobPhase[]
  /** Detection jobs: the number of object masks. */
  masks?: number
  /** Detection jobs: one box per mask, missing when ComfyUI gave no matching boxes. */
  detections?: Detection[]
}
export type JobPhase = { label: string; seconds: number; note?: string }

/** State of the in-app update, see server/app/update.mjs. */
export type UpdateRelease = { version: string; name: string; url: string; prerelease: boolean; publishedAt?: string }
export type UpdateStatus = {
  version: string
  /** A git checkout only learns about new releases and updates with git pull. */
  mode: 'release' | 'git'
  checkedAt?: number
  release?: UpdateRelease
  installing: boolean
  lastResult?: { ok: boolean; from?: string; to?: string; error?: string; at: number }
}

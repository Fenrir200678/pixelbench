import { useState } from 'react'
import i18n from '../i18n/index.js'
import { createSize, generationCrop, measure, measureCreate } from '../editor/geometry.js'
import { exceedsProfile, initialScale, scaledSize, type Scale } from '../editor/upscale.js'
import type { Hires } from '../editor/generation.js'
import { modelProblems, profileReady, selectModels, type SavedModels } from '../editor/models.js'
import { tools } from '../editor/tools.js'
import { readStorage, writeStorage } from '../helpers/storage.js'
import { clamp, fitSize, maxEdge } from '../image/pixels.js'
import type { LoraChoice, Parameters, Profile, Status, Value } from '../types/api.js'
import type { Notice, NoticeValues, Tool, Work } from '../types/editor.js'
import type { Rect } from '../types/image.js'

type Prefs = {
  parameters: Parameters
  parametersByTool: Partial<Record<Tool, Parameters>>
  seedMode: string
  seed: number
  auto: boolean
  lock: boolean
  w: number
  h: number
  context: number
  feather: number
  editFeather: number
  transition: number
  createW: number
  createH: number
  templateAuto: boolean
  templateW: number
  templateH: number
  strength: number
  // Seed variance strength in Erstellen, where the profile and ComfyUI support it. 0 is off.
  variance: number
}
type SavedPrefs = { defaults: Record<string, Prefs>; presets: Record<string, Record<string, Prefs>> }
export type LoraEntry = LoraChoice & { id: string; enabled: boolean }
const lorasKey = 'pixelbench-loras-v1'
const upscaleKey = 'pixelbench-upscale-v2'
const hiresKey = 'pixelbench-hires-v1'
// Hochskalieren: an upscale model or "lanczos".
export type UpscaleSettings = { upscaler?: string; scale: Scale }
// Hires fix in Erstellen, also used by the quick hires fix on variants and on the open image.
// tiled: opt-in for Ultimate SD Upscale. Without it, one image to image pass at the target size, as in Forge.
export type HiresSettings = {
  on: boolean
  upscaler?: string
  scale: Scale
  strength: number
  steps: number
  tiled: boolean
}
const initialUpscale: UpscaleSettings = { scale: initialScale }
const initialHires: HiresSettings = { on: false, scale: initialScale, strength: 0.35, steps: 0, tiled: false }
const modelsKey = 'pixelbench-models-v1'
const preferencesKey = 'pixelbench-preferences-v1'
const profileChoicesKey = 'pixelbench-profile-choices-v1'
const initialPrefs: Prefs = {
  parameters: {},
  parametersByTool: {},
  seedMode: 'random',
  seed: 42,
  auto: true,
  lock: true,
  w: 512,
  h: 512,
  context: 96,
  feather: 8,
  editFeather: 64,
  transition: 32,
  createW: 1024,
  createH: 1024,
  templateAuto: true,
  templateW: 1024,
  templateH: 1024,
  strength: 0.6,
  variance: 0
}

function resolveParameters(profile: Profile | undefined, prefs: Prefs, tool: Tool): Parameters {
  return Object.fromEntries(
    Object.entries(profile?.parameters ?? {}).map(([key, field]) => {
      const fallback = field.defaultsByTool?.[tool] ?? field.default
      const saved = field.defaultsByTool ? prefs.parametersByTool[tool]?.[key] : prefs.parameters[key]
      const value = saved ?? fallback
      const choices = profile?.choices[key]
      if (typeof fallback === 'string' && choices?.length && !choices.includes(String(value))) {
        return [key, choices.includes(fallback) ? fallback : choices[0]]
      }
      return [key, value]
    })
  )
}

// The whole image is enlarged. Target and crop cover the result at the image's position.
export function upscaleMeasurement(image: Rect, effective: [number, number]) {
  const crop = { x: 0, y: 0, w: effective[0], h: effective[1] }
  return { crop, target: { ...crop, x: image.x, y: image.y }, auto: effective, effective, corrected: false }
}

function seedFor(prefs: Prefs) {
  if (prefs.seedMode === 'fixed') return prefs.seed
  const [a, b] = crypto.getRandomValues(new Uint32Array(2))
  return (a & 0x7ffff) * 0x100000000 + b
}

export function useWorkflow(
  tool: Tool,
  status: Status | undefined,
  work: Work | undefined,
  maskBox: Rect | undefined,
  notice: Notice
) {
  const [saved, setSaved] = useState(() => readStorage<SavedPrefs>(preferencesKey, { defaults: {}, presets: {} }))
  const [models, setModels] = useState(() => readStorage<SavedModels>(modelsKey, {}))
  const [savedLoras, setSavedLoras] = useState(() => readStorage<Record<string, LoraEntry[]>>(lorasKey, {}))
  const [profileChoices, setProfileChoices] = useState<Partial<Record<Tool, string>>>(() =>
    readStorage(profileChoicesKey, {})
  )
  // Each mode keeps its own prompts. Extras refines the created image and shares the prompts of Erstellen.
  const [prompts, setPrompts] = useState<Partial<Record<Tool, { prompt: string; negative: string }>>>({})
  const promptKey: Tool = tool === 'upscale' ? 'create' : tool
  const prompt = prompts[promptKey]?.prompt ?? ''
  const negative = prompts[promptKey]?.negative ?? ''
  const updatePrompts = (change: Partial<{ prompt: string; negative: string }>) =>
    setPrompts((all) => ({ ...all, [promptKey]: { prompt: '', negative: '', ...all[promptKey], ...change } }))
  const setPrompt = (text: string) => updatePrompts({ prompt: text })
  const setNegative = (text: string) => updatePrompts({ negative: text })
  const resetPrompts = () => setPrompts({})
  const [prefs, setPrefs] = useState(initialPrefs)
  const [profileId, setProfileId] = useState<string>()
  const [preset, setPreset] = useState('')
  const [ratio, setRatio] = useState(1)
  const [frameRatios, setFrameRatios] = useState<Partial<Record<Tool, number>>>({})
  const [lastRandomSeed, setLastRandomSeed] = useState<number>()
  // Off until the user opens a template in Create or ticks the box. Applying a variant never turns it on.
  const [templateOn, setTemplateOn] = useState(false)
  const [upscale, setUpscale] = useState(() => ({
    ...initialUpscale,
    ...readStorage<Partial<UpscaleSettings>>(upscaleKey, {})
  }))
  const [hires, setHires] = useState(() => ({ ...initialHires, ...readStorage<Partial<HiresSettings>>(hiresKey, {}) }))

  const options = tools[tool].profiles.flatMap((id) => (status?.profiles ?? []).filter((p) => p.id === id))
  const ready = (p: Profile, choices = selectModels(p, models)) => profileReady(p, choices)
  const profile = options.find((p) => p.id === profileChoices[tool]) ?? options.find((p) => ready(p)) ?? options[0]
  if (profile?.id !== profileId) {
    setProfileId(profile?.id)
    setPreset('')
    const defaults = profile && saved.defaults[profile.id]
    setPrefs(defaults ? { ...initialPrefs, ...defaults } : { ...prefs, parameters: {}, parametersByTool: {} })
    if (defaults) setRatio(defaults.w / defaults.h)
  }

  const parameters = resolveParameters(profile, prefs, tool)
  const choices = profile ? selectModels(profile, models) : {}
  const loraFiles = status?.loras ?? []
  const loras = (profile?.lora && savedLoras[profile.id]) || []
  const activeLoras = loras.filter((entry) => entry.enabled)
  const missingLoras = activeLoras.filter((entry) => !loraFiles.some(({ file }) => file === entry.name))
  const upscalers = status?.upscalers ?? []
  const preferredUpscaler = upscalers.find((file) => /ultrasharp/i.test(file)) ?? upscalers[0]
  const upscaler =
    upscale.upscaler === 'lanczos' || (upscale.upscaler && upscalers.includes(upscale.upscaler))
      ? upscale.upscaler
      : (preferredUpscaler ?? 'lanczos')
  const hiresUpscaler = hires.upscaler && upscalers.includes(hires.upscaler) ? hires.upscaler : preferredUpscaler
  const hiresReady = status?.tiledUpscale !== false
  const upscaling = tool === 'upscale'
  // Hires fix needs a profile that renders from a latent and the tiled upscale nodes.
  const hiresAvailable = tool === 'create' && Boolean(profile?.img2img && profile.tools.includes('upscale'))
  const hiresActive = hiresAvailable && hires.on
  const problems = [
    ...(profile ? modelProblems(profile, choices) : []),
    ...missingLoras.map((entry) => i18n.t('LoRA fehlt im Loader · {{file}}', { file: entry.name })),
    ...(hiresActive && !hiresUpscaler
      ? [
          i18n.t(
            'Kein Upscale-Modell gefunden. Es gehört unter „upscale_models“ oder „ESRGAN“ in einen Modell-Stammordner.'
          )
        ]
      : [])
  ]

  function storeLoras(next: LoraEntry[]) {
    if (!profile) return
    const all = { ...savedLoras, [profile.id]: next }
    setSavedLoras(all)
    if (!writeStorage(lorasKey, all)) notice('Einstellungen konnten in diesem Browser nicht gespeichert werden.')
  }
  const create = tool === 'create'
  const crop =
    !create && !upscaling && work
      ? generationCrop(work, tool, prefs.auto ? maskBox : undefined, prefs.context)
      : undefined
  const grid = profile?.sizes.grid ?? 8
  // Image to image: the open image is the template. By default it is scaled to the profile's target area.
  const template = create && profile?.img2img && templateOn ? work?.image : undefined
  const templateDefault =
    template && profile
      ? fitSize(...createSize(template.w / template.h, profile.sizes.target), profile.sizes)
      : undefined
  const templateSize: [number, number] | undefined =
    templateDefault && (prefs.templateAuto ? templateDefault : [prefs.templateW, prefs.templateH])
  const createMeasurement = profile && measureCreate(profile, ...(templateSize ?? [prefs.createW, prefs.createH]))
  const measurement = create
    ? createMeasurement &&
      (template
        ? { ...createMeasurement, target: { ...createMeasurement.target, x: template.x, y: template.y } }
        : createMeasurement)
    : upscaling
      ? work && upscaleMeasurement(work.image, scaledSize([work.image.w, work.image.h], upscale.scale))
      : work && profile && crop
        ? measure(work, tool, profile, crop, prefs.auto ? undefined : [prefs.w, prefs.h])
        : undefined
  const hiresSize = hiresActive && measurement ? scaledSize(measurement.effective, hires.scale) : undefined
  const hiresTiledNow = hiresActive && hires.tiled
  if (hiresTiledNow && !hiresReady)
    problems.push(i18n.t('Der Hires-Fix braucht die Custom-Nodes „Ultimate SD Upscale“ in ComfyUI.'))
  const [w, h] = prefs.auto && measurement ? measurement.auto : [prefs.w, prefs.h]
  const currentPrefs = { ...prefs, parameters, w, h }
  const presets = profile ? (saved.presets[profile.id] ?? {}) : {}

  function updatePrefs(next: Partial<Prefs>) {
    setPrefs((previous) => ({ ...previous, ...next }))
  }

  function save(next: SavedPrefs, message: string, values?: NoticeValues) {
    setSaved(next)
    if (writeStorage(preferencesKey, next)) notice(message, true, values)
    else notice('Einstellungen konnten in diesem Browser nicht gespeichert werden.')
  }

  function activatePreset(name: string) {
    setPreset(name)
    const next = presets[name]
    if (!next) return
    setPrefs({ ...initialPrefs, ...next })
    setRatio(next.w / next.h)
  }

  function storeUpscale(patch: Partial<UpscaleSettings>) {
    const next = { ...upscale, ...patch }
    setUpscale(next)
    if (!writeStorage(upscaleKey, next)) notice('Einstellungen konnten in diesem Browser nicht gespeichert werden.')
  }

  function storeHires(patch: Partial<HiresSettings>) {
    const next = { ...hires, ...patch }
    setHires(next)
    if (!writeStorage(hiresKey, next)) notice('Einstellungen konnten in diesem Browser nicht gespeichert werden.')
  }

  // The hires fix request for an image of the given size, or undefined when it cannot run.
  function hiresFor(source: [number, number]): Hires | undefined {
    const size = scaledSize(source, hires.scale)
    const tiled = hires.tiled
    if (!hiresUpscaler || (tiled && !hiresReady)) return undefined
    return { upscaler: hiresUpscaler, strength: hires.strength, steps: hires.steps, size, tiled }
  }

  return {
    upscale: { ...upscale, upscaler },
    upscalers,
    hires: { ...hires, upscaler: hiresUpscaler },
    hiresAvailable,
    hiresActive,
    hiresSize,
    hiresTiled: hiresTiledNow,
    hiresLarge: Boolean(profile && hiresSize && !hires.tiled && exceedsProfile(profile.sizes, hiresSize)),
    hiresRunnable: !hiresActive || Boolean(hiresUpscaler && (!hiresTiledNow || hiresReady)),
    hiresReady,
    varianceAvailable: tool === 'create' && Boolean(profile?.variance && status?.seedVariance),
    hiresFor,
    updateUpscale: storeUpscale,
    updateHires: storeHires,
    profile,
    options,
    choices,
    problems,
    ready,
    loras,
    loraFiles,
    // --highvram keeps the LoRA weight backup in VRAM as well.
    loraVramRisk: status?.memory === 'vram' && activeLoras.length > 0,
    activeLoras: activeLoras.map(({ name, strength }) => ({ name, strength })),
    lorasReady: missingLoras.length === 0,
    addLora(name: string) {
      storeLoras([...loras, { id: crypto.randomUUID(), name, strength: 1, enabled: true }])
    },
    // Settings taken over from generation data replace the LoRA list.
    replaceLoras(next: LoraChoice[]) {
      storeLoras(next.map((entry) => ({ ...entry, id: crypto.randomUUID(), enabled: true })))
    },
    updateLora(id: string, patch: Partial<LoraEntry>) {
      storeLoras(loras.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)))
    },
    removeLora(id: string) {
      storeLoras(loras.filter((entry) => entry.id !== id))
    },
    prompt,
    setPrompt,
    negative,
    setNegative,
    resetPrompts,
    parameters,
    prefs: currentPrefs,
    updatePrefs,
    measurement,
    crop,
    grid,
    frameRatio: frameRatios[tool],
    toggleFrameRatio() {
      if (crop) setFrameRatios((previous) => ({ ...previous, [tool]: previous[tool] ? undefined : crop.w / crop.h }))
    },
    resetFrameRatios() {
      setFrameRatios({})
    },
    manualCrop: tool !== 'outpaint' && Boolean(work?.crop),
    preset,
    presets,
    activatePreset,
    seedValue: prefs.seedMode === 'fixed' ? prefs.seed : lastRandomSeed,
    showVariantSeed(seed: number) {
      if (prefs.seedMode !== 'fixed') setLastRandomSeed(seed)
    },
    seed() {
      const seed = seedFor(prefs)
      if (prefs.seedMode !== 'fixed') setLastRandomSeed(seed)
      return seed
    },
    toggleSeed() {
      updatePrefs(
        prefs.seedMode === 'fixed' ? { seedMode: 'random' } : { seedMode: 'fixed', seed: lastRandomSeed ?? prefs.seed }
      )
    },
    chooseProfile(id: string) {
      const next = { ...profileChoices, [tool]: id }
      setProfileChoices(next)
      writeStorage(profileChoicesKey, next)
      notice()
    },
    chooseModel(key: string, file: string) {
      if (!profile) return
      const next = { ...models, [profile.id]: { ...models[profile.id], [key]: file } }
      setModels(next)
      writeStorage(modelsKey, next)
      notice()
    },
    updateParameter(key: string, value: Value) {
      if (profile?.parameters[key]?.defaultsByTool) {
        setPrefs((previous) => ({
          ...previous,
          parametersByTool: {
            ...previous.parametersByTool,
            [tool]: { ...previous.parametersByTool[tool], [key]: value }
          }
        }))
        return
      }
      setPrefs((previous) => ({ ...previous, parameters: { ...previous.parameters, [key]: value } }))
    },
    chooseCreateRatio(ratio: number) {
      const size = createSize(ratio, profile?.sizes.target ?? 1024)
      const [createW, createH] = profile ? fitSize(...size, profile.sizes) : size
      updatePrefs({ createW, createH })
    },
    template,
    templateAvailable: create && Boolean(work && profile?.img2img),
    templateOn,
    templateSize,
    toggleTemplate: setTemplateOn,
    setTemplateAuto(templateAuto: boolean) {
      if (templateSize) updatePrefs({ templateAuto, templateW: templateSize[0], templateH: templateSize[1] })
    },
    fitTemplateSourceSize() {
      if (!template || !profile) return
      const [templateW, templateH] = fitSize(template.w, template.h, profile.sizes)
      updatePrefs({ templateAuto: false, templateW, templateH })
    },
    setTemplateDimension(axis: 'w' | 'h', value: number) {
      if (!template || !templateSize) return
      const ratio = prefs.lock ? template.w / template.h : templateSize[0] / templateSize[1]
      const other = clamp(Math.round(axis === 'w' ? value / ratio : value * ratio), 1, maxEdge)
      const [templateW, templateH] = prefs.lock
        ? axis === 'w'
          ? [value, other]
          : [other, value]
        : axis === 'w'
          ? [value, templateSize[1]]
          : [templateSize[0], value]
      updatePrefs({ templateAuto: false, templateW, templateH })
    },
    swapCreateSize() {
      updatePrefs({ createW: prefs.createH, createH: prefs.createW })
    },
    setCreateDimension(axis: 'w' | 'h', value: number) {
      const other = axis === 'w' ? 'createH' : 'createW'
      const current = prefs.createW / prefs.createH
      updatePrefs(
        prefs.lock
          ? {
              [axis === 'w' ? 'createW' : 'createH']: value,
              [other]: clamp(Math.round(axis === 'w' ? value / current : value * current), 1, maxEdge)
            }
          : { [axis === 'w' ? 'createW' : 'createH']: value }
      )
    },
    toggleAuto(auto: boolean) {
      if (!auto) setRatio(w / h)
      updatePrefs({ auto, w, h })
    },
    toggleLock(lock: boolean) {
      setRatio(w / h)
      updatePrefs({ lock })
    },
    setDimension(axis: 'w' | 'h', value: number) {
      const other = axis === 'w' ? 'h' : 'w'
      updatePrefs(
        prefs.lock
          ? { [axis]: value, [other]: clamp(Math.round(axis === 'w' ? value / ratio : value * ratio), 1, maxEdge) }
          : { [axis]: value }
      )
    },
    savePreset(name: string) {
      if (!profile) return
      save(
        { ...saved, presets: { ...saved.presets, [profile.id]: { ...presets, [name]: currentPrefs } } },
        'Preset „{{name}}“ gespeichert.',
        { name }
      )
      setPreset(name)
    },
    saveDefault() {
      if (profile)
        save({ ...saved, defaults: { ...saved.defaults, [profile.id]: currentPrefs } }, 'Profilstandard gespeichert.')
    }
  }
}

export type Workflow = ReturnType<typeof useWorkflow>

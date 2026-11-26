import { useMemo, useState } from 'react'
import i18n from '../i18n/index.js'
import { createSize, matchingDimension, measureWorkflow, type GeometryPreferences } from '../editor/geometry.js'
import { exceedsProfile, scaledSize } from '../editor/upscale.js'
import { modelProblems, profileReady, selectModels, type SavedModels } from '../editor/models.js'
import { tools } from '../editor/tools.js'
import { readStorage, writeStorage } from '../helpers/storage.js'
import { fitSize } from '../image/pixels.js'
import type { LoraChoice, Parameters, Profile, Status, Value } from '../types/api.js'
import type { Notice, NoticeValues, Tool, Work } from '../types/editor.js'
import type { Rect } from '../types/image.js'
import { useUpscaleSettings, type SessionUpscale } from './useUpscaleSettings.js'

type Prefs = GeometryPreferences & {
  parameters: Parameters
  parametersByTool: Partial<Record<Tool, Parameters>>
  seedMode: string
  seed: number
  lock: boolean
  feather: number
  editFeather: number
  transition: number
  strength: number
  // Img2img color correction toward the template, as in Forge. 0 is off.
  colorMatch: number
  // Seed variance strength in Erstellen, where the profile and ComfyUI support it. 0 is off.
  variance: number
}
type SavedPrefs = { defaults: Record<string, Prefs>; presets: Record<string, Record<string, Prefs>> }
export type LoraEntry = LoraChoice & { id: string; enabled: boolean }
type Prompts = Partial<Record<Tool, { prompt: string; negative: string }>>
type ProfileChoices = Partial<Record<Tool, string>>
type FrameRatios = Partial<Record<Tool, number>>
export type SessionWorkflow = {
  models: SavedModels
  savedLoras: Record<string, LoraEntry[]>
  profileChoices: ProfileChoices
  prompts: Prompts
  prefs: Prefs
  profileId?: string
  preset: string
  ratio: number
  frameRatios: FrameRatios
  lastRandomSeed?: number
  templateOn: boolean
  refinementModel: string
  upscale: SessionUpscale
}
const lorasKey = 'pixelbench-loras-v1'
const modelsKey = 'pixelbench-models-v1'
const preferencesKey = 'pixelbench-preferences-v1'
const profileChoicesKey = 'pixelbench-profile-choices-v1'
const refinementModelKey = 'pixelbench-refinement-model-v1'
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
  colorMatch: 0,
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
  const [profileChoices, setProfileChoices] = useState<ProfileChoices>(() => readStorage(profileChoicesKey, {}))
  const [refinementModel, setRefinementModel] = useState(() => readStorage(refinementModelKey, ''))
  // Each mode keeps its own prompts. Extras refines the created image and shares the prompts of Erstellen.
  const [prompts, setPrompts] = useState<Prompts>({})
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
  const [frameRatios, setFrameRatios] = useState<FrameRatios>({})
  const [lastRandomSeed, setLastRandomSeed] = useState<number>()
  const [restoredTool, setRestoredTool] = useState<Tool>()
  const [prefsEdits, setPrefsEdits] = useState(0)
  // Off until the user opens a template in Create or ticks the box. Applying a variant never turns it on.
  const [templateOn, setTemplateOn] = useState(false)

  const optionsFor = (mode: Tool) =>
    tools[mode].profiles.flatMap((id) => (status?.profiles ?? []).filter((p) => p.id === id))
  const options = optionsFor(tool)
  const ready = (p: Profile, choices = selectModels(p, models)) => profileReady(p, choices)
  const selectProfile = (items: Profile[], choice: string | undefined, savedModels: SavedModels) =>
    items.find((p) => p.id === choice) ?? items.find((p) => ready(p, selectModels(p, savedModels))) ?? items[0]
  const profile = selectProfile(options, profileChoices[tool], models)
  if (restoredTool && (status || restoredTool !== tool)) setRestoredTool(undefined)
  if (profile?.id !== profileId && status) {
    setProfileId(profile?.id)
    if (restoredTool !== tool) {
      setPreset('')
      const defaults = profile && saved.defaults[profile.id]
      setPrefs(defaults ? { ...initialPrefs, ...defaults } : { ...prefs, parameters: {}, parametersByTool: {} })
      if (defaults) setRatio(defaults.w / defaults.h)
    }
  }

  const parameters = resolveParameters(profile, prefs, tool)
  const choices = profile ? selectModels(profile, models) : {}
  const loraFiles = status?.loras ?? []
  const loras = (profile?.lora && savedLoras[profile.id]) || []
  const activeLoras = loras.filter((entry) => entry.enabled)
  const missingLoras = activeLoras.filter((entry) => !loraFiles.some(({ file }) => file === entry.name))
  const upscaleSettings = useUpscaleSettings(tool, profile, status, notice)
  const { upscale, hires, hiresActive, hiresRunnable, sessionUpscale } = upscaleSettings
  // Backend status can load a profile and its defaults into a pristine editor.
  const sessionSettings = useMemo(
    () => ({
      models,
      savedLoras,
      profileChoices,
      prompts,
      frameRatios,
      lastRandomSeed,
      templateOn,
      refinementModel,
      upscale: sessionUpscale
    }),
    [
      models,
      savedLoras,
      profileChoices,
      prompts,
      frameRatios,
      lastRandomSeed,
      templateOn,
      refinementModel,
      sessionUpscale
    ]
  )
  const sessionChanges = useMemo(() => [sessionSettings, prefsEdits], [sessionSettings, prefsEdits])
  const sessionState: SessionWorkflow = { ...sessionSettings, prefs, profileId, preset, ratio }
  const problems = [
    ...(profile ? modelProblems(profile, choices) : []),
    ...missingLoras.map((entry) => i18n.t('LoRA fehlt im Loader · {{file}}', { file: entry.name }))
  ]

  function storeLoras(next: LoraEntry[]) {
    if (!profile) return
    const all = { ...savedLoras, [profile.id]: next }
    setSavedLoras(all)
    if (!writeStorage(lorasKey, all)) notice('Einstellungen konnten in diesem Browser nicht gespeichert werden.')
  }
  const create = tool === 'create'
  const grid = profile?.sizes.grid ?? 8
  const { crop, measurement, template, templateSize } = measureWorkflow({
    tool,
    profile,
    work,
    maskBox,
    prefs,
    templateOn,
    upscaleScale: upscale.scale
  })
  const hiresSize = hiresActive && measurement ? scaledSize(measurement.effective, hires.scale) : undefined
  if (!hiresRunnable) problems.push(i18n.t('Der Hires-Fix braucht die Custom-Nodes „Ultimate SD Upscale“ in ComfyUI.'))
  const [w, h] = prefs.auto && measurement ? measurement.auto : [prefs.w, prefs.h]
  const currentPrefs = { ...prefs, parameters, w, h }
  const presets = profile ? (saved.presets[profile.id] ?? {}) : {}

  function updatePrefs(next: Partial<Prefs>) {
    setPrefsEdits((count) => count + 1)
    setPrefs((previous) => ({ ...previous, ...next }))
  }

  function save(next: SavedPrefs, message: string, values?: NoticeValues) {
    setSaved(next)
    if (writeStorage(preferencesKey, next)) notice(message, true, values)
    else notice('Einstellungen konnten in diesem Browser nicht gespeichert werden.')
  }

  function activatePreset(name: string) {
    setPrefsEdits((count) => count + 1)
    setPreset(name)
    const next = presets[name]
    if (!next) return
    setPrefs({ ...initialPrefs, ...next })
    setRatio(next.w / next.h)
  }

  return {
    ...upscaleSettings,
    sessionState,
    sessionChanges,
    restore(next: SessionWorkflow, mode: Tool) {
      const nextChoices = next.profileId ? { ...next.profileChoices, [mode]: next.profileId } : next.profileChoices
      setProfileChoices(nextChoices)
      setProfileId(status ? selectProfile(optionsFor(mode), nextChoices[mode], next.models)?.id : next.profileId)
      setRestoredTool(status ? undefined : mode)
      setModels(next.models)
      setSavedLoras(next.savedLoras)
      setPrompts(next.prompts)
      setPrefs(next.prefs)
      setPreset(next.preset)
      setRatio(next.ratio)
      setFrameRatios(next.frameRatios)
      setLastRandomSeed(next.lastRandomSeed)
      setTemplateOn(next.templateOn)
      setRefinementModel(next.refinementModel)
      upscaleSettings.restoreUpscale(next.upscale)
    },
    refinementModel,
    chooseRefinementModel(model: string) {
      setRefinementModel(model)
      if (!writeStorage(refinementModelKey, model))
        notice('Einstellungen konnten in diesem Browser nicht gespeichert werden.')
    },
    hiresSize,
    hiresLarge: Boolean(profile && hiresSize && !hires.tiled && exceedsProfile(profile.sizes, hiresSize)),
    varianceAvailable: tool === 'create' && Boolean(profile?.variance && status?.seedVariance),
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
      setPrefsEdits((count) => count + 1)
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
      const other = prefs.lock
        ? matchingDimension(axis, value, template.w / template.h)
        : templateSize[axis === 'w' ? 1 : 0]
      const [templateW, templateH] = axis === 'w' ? [value, other] : [other, value]
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
              [other]: matchingDimension(axis, value, current)
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
      updatePrefs(prefs.lock ? { [axis]: value, [other]: matchingDimension(axis, value, ratio) } : { [axis]: value })
    },
    savePreset(name: string) {
      if (!profile) return
      setPrefsEdits((count) => count + 1)
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

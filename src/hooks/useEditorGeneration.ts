import type { TFunction } from 'i18next'
import { detailStage, type DetailBase } from '../editor/detailer.js'
import { rememberGeneration } from '../editor/frameInfo.js'
import { prepare, type Request, type Variant } from '../editor/generation.js'
import { sizeLabel, upscaleMeasurement } from '../editor/geometry.js'
import { scaledSize } from '../editor/upscale.js'
import type { Mask } from '../image/mask.js'
import { maskIntersects, transparentMask } from '../image/pixels.js'
import type { RunOutcome } from '../settings/notify.js'
import type { Profile } from '../types/api.js'
import type { Notice, Tool } from '../types/editor.js'
import type { Frame, ReferenceImage } from '../types/image.js'
import type { Bridge } from './useBridge.js'
import type { useDocument } from './useDocument.js'
import type { Detailer } from './useDetailer.js'
import { jobStage, useGeneration } from './useGeneration.js'
import type { useVariants } from './useVariants.js'
import type { Workflow } from './useWorkflow.js'
import { useBackgroundRemoval } from './useBackgroundRemoval.js'

// Whether a created variant came from the same render inputs. Models and parameters are compared by the keys the
// workflow sets, because a finished job stores the values the server resolved.
function sameRender(
  variant: Variant,
  inputs: Omit<Request, 'tool' | 'profile' | 'models'> & {
    source?: Frame
    profile: Profile
    models: Record<string, string>
  }
) {
  const request = variant.prepared.request
  const same = (a?: object, b?: object) => JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
  return (
    request.tool === 'create' &&
    request.profile === inputs.profile.id &&
    request.prompt === inputs.prompt &&
    request.negative === inputs.negative &&
    request.seed === inputs.seed &&
    (request.variance ?? 0) === (inputs.variance ?? 0) &&
    request.size[0] === inputs.size[0] &&
    request.size[1] === inputs.size[1] &&
    variant.prepared.source === inputs.source &&
    (!inputs.source || request.strength === inputs.strength) &&
    (request.colorMatch ?? 0) === (inputs.colorMatch ?? 0) &&
    Object.entries(inputs.parameters).every(([key, value]) => request.parameters[key] === value) &&
    Object.entries(inputs.models).every(([key, value]) => request.models?.[key] === value) &&
    same(request.loras, inputs.loras?.length ? inputs.loras : undefined)
  )
}

type Inputs = {
  tool: Tool
  bridge: Bridge
  document: Pick<ReturnType<typeof useDocument>, 'work' | 'drawing' | 'importing'>
  workflow: Workflow
  detailer: Detailer
  variants: ReturnType<typeof useVariants>
  maskData?: ReturnType<Mask['get']>
  references: ReferenceImage[]
  notice: Notice
  onRunEnd?: (outcome: RunOutcome) => void
  t: TFunction
}

export function useEditorGeneration({
  tool,
  bridge,
  document,
  workflow,
  detailer,
  variants,
  maskData,
  references,
  notice,
  onRunEnd,
  t
}: Inputs) {
  const { status, serverAction } = bridge
  const { work, drawing } = document
  const image = work?.image
  const candidate = variants.selected
  const create = tool === 'create'
  const upscaling = tool === 'upscale'
  const { profile, measurement, crop, template } = workflow
  const generation = useGeneration(
    bridge.session,
    (variant) => {
      rememberGeneration(variant.frame, variant.prepared.request)
      variants.dispatch({ type: 'add', variant })
    },
    notice,
    bridge.refresh,
    onRunEnd
  )

  const modelsReady = Boolean(profile && workflow.ready(profile, workflow.choices))
  const areaReady = create
    ? true
    : upscaling
      ? Boolean(work)
      : tool === 'inpaint'
        ? Boolean(image && crop && maskData?.box && maskIntersects(maskData.alpha, image.w, maskData.box, crop))
        : tool === 'edit' || Boolean(work && Object.values(work.margins).some((n) => n > 0))
  const jobBlocked = Boolean(serverAction || generation.running || document.importing || status?.state !== 'ready')
  const canRun =
    !jobBlocked &&
    Boolean(
      measurement &&
      (workflow.prompt.trim() || upscaling) &&
      modelsReady &&
      workflow.lorasReady &&
      areaReady &&
      workflow.hiresRunnable
    )
  const replayProfile = status?.profiles.find((item) => item.id === candidate?.prepared.request.profile)
  const replayModels = candidate?.prepared.request.models
  const canReplay =
    !jobBlocked && Boolean(replayProfile?.ready && (!replayModels || workflow.ready(replayProfile, replayModels)))
  // Quick hires fix: a created variant is enlarged with its own profile, prompt, seed and LoRAs.
  const hiresCapable = (item: Profile | undefined, source: Frame | undefined): item is Profile =>
    Boolean(
      source && item?.ready && item.img2img && item.tools.includes('upscale') && workflow.hiresFor([source.w, source.h])
    )
  const quickRequest = candidate?.prepared.request.tool === 'create' ? candidate.prepared.request : undefined
  const quickProfile = quickRequest && status?.profiles.find((item) => item.id === quickRequest.profile)
  const canQuickUpscale = !jobBlocked && hiresCapable(quickProfile, candidate?.frame)
  const hiresLabel =
    workflow.hires.scale.mode === 'by'
      ? t('Hires-Fix {{factor}}×', { factor: String(workflow.hires.scale.factor).replace('.', ',') })
      : t('Hires-Fix → {{size}} px', {
          size: candidate ? sizeLabel(...scaledSize([candidate.frame.w, candidate.frame.h], workflow.hires.scale)) : ''
        })
  // The same detail pass on the open image, with the current profile, prompt and LoRAs.
  const canHiresImage = !jobBlocked && hiresCapable(profile, work?.image) && modelsReady && workflow.lorasReady
  const runTitle = !modelsReady
    ? t('Workflow und Modellauswahl prüfen')
    : !work && !create
      ? t('Zuerst ein Bild öffnen')
      : !areaReady
        ? tool === 'inpaint'
          ? maskData?.box
            ? t('Markiere einen Bereich innerhalb des Generierungsrahmens.')
            : t('Einen Bereich markieren')
          : t('Den Zielrahmen erweitern')
        : ''

  function currentRenderInputs(profile: Profile) {
    return {
      profile,
      prompt: workflow.prompt.trim(),
      negative: profile.negative ? workflow.negative.trim() : '',
      seed: workflow.seed(),
      parameters: workflow.parameters,
      models: workflow.choices,
      loras: workflow.activeLoras
    }
  }

  // A hires fix on an existing image: the variant's or the document's pixels, enlarged and re-rendered.
  function hiresJob(
    source: Frame,
    request: Pick<Request, 'prompt' | 'negative' | 'seed' | 'parameters' | 'models' | 'loras'>,
    sourceProfile: Profile
  ) {
    const hires = workflow.hiresFor([source.w, source.h])
    if (!hires) return undefined
    const size = upscaleMeasurement(source, hires.size)
    const parameters = workflow.hiresParameters(sourceProfile, request.parameters)
    return prepare({
      source,
      crop: size.crop,
      target: size.target,
      size: size.effective,
      edge: 0,
      tool: 'upscale',
      profile: sourceProfile,
      prompt: request.prompt,
      negative: request.negative,
      seed: request.seed,
      parameters,
      models: request.models ?? {},
      loras: request.loras,
      hires
    })
  }

  function runHires(...args: Parameters<typeof hiresJob>) {
    const job = hiresJob(...args)
    if (job) void generation.run([jobStage(() => job)])
  }

  // Detailer with the given render inputs and its own sampling on top. source: a fixed image, otherwise the run's last
  // variant.
  function detailStages(base: Omit<DetailBase, 'upscaler'> | undefined, source?: Frame) {
    const { detector, settings } = detailer
    if (!detector || !base) return []
    const parameters = detailer.parametersFor(base.profile, base.parameters)
    return [detailStage(settings, { ...base, parameters, upscaler: detailer.upscaler }, detector, source)]
  }
  // The detailer on the shown image: the selected variant or the open image.
  const detailSource = candidate?.frame ?? work?.image
  const canDetailImage =
    !jobBlocked &&
    detailer.available &&
    Boolean(
      detailer.detector &&
      detailSource &&
      profile?.ready &&
      modelsReady &&
      workflow.lorasReady &&
      (detailer.settings.prompt.trim() || workflow.prompt.trim())
    )

  function detailImage() {
    if (!canDetailImage || !detailSource || !profile) return
    void generation.run(detailStages(currentRenderInputs(profile), detailSource))
  }

  // Quick detailer on the selected variant. A created variant keeps its own profile, prompt, seed and LoRAs, as with
  // the quick hires fix. Other variants use the current inputs.
  const quickDetailProfile =
    quickProfile?.ready && quickProfile.img2img && (!replayModels || workflow.ready(quickProfile, replayModels))
      ? quickProfile
      : undefined
  const canQuickDetail =
    !jobBlocked &&
    detailer.available &&
    Boolean(
      detailer.detector &&
      candidate &&
      (quickRequest && quickDetailProfile
        ? detailer.settings.prompt.trim() || quickRequest.prompt.trim()
        : canDetailImage)
    )

  function quickDetail() {
    if (!canQuickDetail || !candidate) return
    const base =
      quickRequest && quickDetailProfile
        ? {
            profile: quickDetailProfile,
            prompt: quickRequest.prompt,
            negative: quickRequest.negative,
            seed: quickRequest.seed,
            parameters: quickRequest.parameters,
            models: quickRequest.models ?? {},
            loras: quickRequest.loras
          }
        : profile && currentRenderInputs(profile)
    void generation.run(detailStages(base, candidate.frame))
  }
  const terms = detailer.settings.terms.trim()
  const quickDetailLabel = terms ? t('Detailer · {{terms}}', { terms }) : t('Detailer')

  // Background removal in Extras, on the same shown image as the detailer. The whole image keeps its size.
  const background = useBackgroundRemoval(status, notice)
  const canRemoveBackground = !jobBlocked && background.ready && Boolean(detailSource)

  function removeBackground() {
    const source = detailSource
    const removal = background.profile
    if (!canRemoveBackground || !source || !removal) return
    const crop = { x: 0, y: 0, w: source.w, h: source.h }
    const inputs = {
      source,
      crop,
      target: { ...crop, x: source.x, y: source.y },
      size: [source.w, source.h] as [number, number],
      edge: 0,
      tool: 'upscale' as const,
      profile: removal,
      prompt: '',
      negative: '',
      seed: 0,
      parameters: {},
      models: background.models
    }
    const keepMask = background.keepMask
    const cutOut = jobStage(() => prepare(inputs))
    // As with the detailer masks, the variant's mask becomes the Inpaint mask when it is applied.
    void generation.run([
      async (runner, previous) => {
        const variant = await cutOut(runner, previous)
        const mask = variant && keepMask ? transparentMask(variant.frame.pixels) : undefined
        if (variant && mask?.some(Boolean)) variant.mask = mask
        return variant
      }
    ])
  }

  function quickUpscale() {
    if (candidate && quickRequest && quickProfile && canQuickUpscale)
      runHires(candidate.frame, quickRequest, quickProfile)
  }

  function hiresImage() {
    if (!work || !profile || !canHiresImage) return
    runHires(work.image, currentRenderInputs(profile), profile)
  }

  function run(replay?: Variant) {
    if (replay) {
      if (canReplay) void generation.run([jobStage(() => replay.prepared)])
      return
    }
    if (!canRun || !profile || !measurement) return
    if (create) {
      // With the hires fix, the rendered variant is enlarged in a second job with the same request.
      const hires = workflow.hiresActive
      const inputs = {
        ...currentRenderInputs(profile),
        source: template,
        strength: workflow.prefs.strength,
        colorMatch: template && workflow.colorMatchAvailable ? Number(workflow.prefs.colorMatch) || 0 : 0,
        crop: measurement.crop,
        target: measurement.target,
        size: measurement.effective,
        edge: 0,
        tool,
        // Older saved settings stored a checkbox: true becomes the recommended strength 1.
        variance: workflow.varianceAvailable ? Number(workflow.prefs.variance) || 0 : 0
      }
      // A variant with exactly these inputs already exists, typically after locking its seed: only upscale it.
      const rendered = hires
        ? [candidate, ...[...variants.items].reverse()].find((item) => item && sameRender(item, inputs))
        : undefined
      const reuse = rendered && hiresJob(rendered.frame, rendered.prepared.request, profile)
      // The detailer follows the render and the hires fix, with the same prompt, seed and LoRAs.
      const detail = detailer.active ? detailStages(inputs) : []
      if (reuse) {
        void generation.run([jobStage(() => reuse), ...detail])
        return
      }
      const upscale = jobStage((variant) => variant && hiresJob(variant.frame, variant.prepared.request, profile))
      void generation.run([jobStage(() => prepare(inputs)), ...(hires ? [upscale] : []), ...detail])
      return
    }
    if (!work) return
    if (upscaling) {
      void generation.run([
        jobStage(() =>
          prepare({
            source: work.image,
            crop: measurement.crop,
            target: measurement.target,
            size: measurement.effective,
            edge: 0,
            tool,
            profile,
            prompt: '',
            negative: '',
            seed: 0,
            parameters: {},
            models: {},
            upscaler: workflow.upscale.upscaler
          })
        )
      ])
      return
    }
    const { editFeather, feather, transition } = workflow.prefs
    const edge = { edit: editFeather, inpaint: feather, outpaint: transition }[tool]
    void generation.run([
      jobStage(() =>
        prepare({
          ...currentRenderInputs(profile),
          source: work.image,
          crop: measurement.crop,
          target: measurement.target,
          size: measurement.effective,
          brushMask: maskData?.alpha,
          drawing: work.drawing?.length ? drawing : undefined,
          edge,
          tool,
          references: references.slice(0, profile.referenceLimit ?? 1).map((item) => item.frame)
        })
      )
    ])
  }

  return {
    generation,
    jobBlocked,
    canRun,
    runTitle,
    replayProfile,
    canReplay,
    variantUpscale: quickRequest ? { label: hiresLabel, disabled: !canQuickUpscale, run: quickUpscale } : undefined,
    variantDetail:
      detailer.available && detailer.detector
        ? { label: quickDetailLabel, disabled: !canQuickDetail, run: quickDetail }
        : undefined,
    canHiresImage,
    hiresImage,
    canDetailImage,
    detailImage,
    background: { ...background, canRun: canRemoveBackground, run: removeBackground },
    run
  }
}

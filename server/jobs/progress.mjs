import { setTimeout as delay } from 'node:timers/promises'

// Readable status per node type. Workflows share these types, so new profiles get a status without changes here.
// Unknown types show their class name.
const nodeMessages = [
  [/^(UNETLoader|UnetLoaderGGUF)$/, 'Loading diffusion model'],
  [/^CheckpointLoader/, 'Loading checkpoint'],
  [/CLIPLoader/, 'Loading text encoder'],
  [/^VAELoader$/, 'Loading VAE'],
  [/^LoraLoader/, 'Applying LoRA'],
  [/^(UpscaleModelLoader|ModelPatchLoader)$/, 'Loading additional model'],
  [/TextEncode|^ConditioningZeroOut$/, 'Encoding prompt'],
  [/^(VAEEncode|InpaintModelConditioning|ReferenceLatent)/, 'Encoding image'],
  [/^(LoadImage|LoadImageMask|ImageScale|GetImageSize|Canny)$/, 'Preparing image'],
  [/^Empty.*Latent/, 'Preparing latent'],
  [/^(KSampler|SamplerCustom|LanPaint_KSampler)/, 'Starting sampling'],
  [/^UltimateSDUpscale/, 'Hires fix'],
  [/^ImageUpscaleWithModel$/, 'Upscale'],
  [/^VAEDecode/, 'Decoding image'],
  [/^(PreviewImage|SaveImage)$/, 'Preparing preview'],
  [/^(TextGenerate|PreviewAny)/, 'Writing prompt suggestion …']
]
// Model names in ComfyUI's "Requested to load" lines, for the label of the VRAM phase.
const modelKind = (name) =>
  /TE|Clip|T5|Llama|Qwen.*VL/i.test(name) ? 'Text encoder' : /VAE/i.test(name) ? 'VAE' : 'Diffusion model'
const gigabytes = (mb) => (Number(mb) / 1024).toFixed(1) + ' GB'

export function trackProgress(ws, { job, graph, refine, terminal, update, jobLog, elapsed }) {
  let phase
  let loading
  let sampling
  // Ultimate SD Upscale reports one progress run for the model upscale and one per tile.
  const tileRuns = { count: 0, last: Infinity }
  // The WebSocket reports completion earlier than the 450 ms poll. Polling stays as the fallback.
  let finished = false
  let notifyFinished
  const finishedEvent = new Promise((resolve) => (notifyFinished = resolve))
  job.phases = []
  const addPhase = (label, at, note, nested = 0) => {
    const seconds = (performance.now() - at) / 1000 - nested
    // Short steps such as latent setup only clutter the timeline.
    if (seconds >= 0.05 || note) job.phases.push({ label, seconds: Number(seconds.toFixed(2)), note })
    if (job.phases.length > 40) job.phases.shift()
  }
  const endPhase = () => {
    if (phase) {
      jobLog(job, phase.node + ' · ' + elapsed(phase.at))
      // The sampler status reads "Starting sampling", its finished phase is just "Sampling". VRAM loads inside a
      // node are listed on their own, so their time is taken out of the node.
      addPhase(phase.label === 'Starting sampling' ? 'Sampling' : phase.label, phase.at, undefined, phase.nested)
    }
    phase = undefined
    sampling = undefined
  }
  const status = (message, progress = job.progress) => {
    if (!job.cancel && !terminal.has(job.stage)) update(job, 'running', message, progress)
  }

  // Lines of ComfyUI's console output. Models move into VRAM inside the sampler, which the WebSocket does not report.
  const output = (line) => {
    if (refine || job.cancel || terminal.has(job.stage)) return
    const requested = line.match(/Requested to load (\w+)/)
    if (requested) {
      // ComfyUI's class names may end in an underscore, for example Krea2TEModel_.
      const name = requested[1].replace(/_+$/, '')
      // The TAESD preview decoder is tiny and loads with the first step.
      if (/^TAE/i.test(name)) return
      loading = { name, at: performance.now() }
      status('Loading ' + name + ' into VRAM …')
      return
    }
    const loaded = line.match(/loaded (?:completely|partially)\b.*?([\d.]+) MB loaded/)
    if (loaded && loading) {
      const label = 'VRAM · ' + loading.name + ' (' + modelKind(loading.name) + ')'
      addPhase(label, loading.at, gigabytes(loaded[1]))
      if (phase) phase.nested += (performance.now() - loading.at) / 1000
      status(loading.name + ' loaded · ' + gigabytes(loaded[1]))
      loading = undefined
    }
  }

  ws.binaryType = 'arraybuffer'
  ws.addEventListener('message', (event) => {
    if (terminal.has(job.stage)) return
    if (event.data instanceof ArrayBuffer) {
      if (!refine && !job.cancel) livePreview(job, event.data)
      return
    }
    if (typeof event.data !== 'string') return
    let content
    try {
      content = JSON.parse(event.data)
    } catch {
      return
    }
    const { type, data: eventData } = content
    if (eventData?.prompt_id !== job.id) return
    if (
      type === 'execution_success' ||
      type === 'execution_error' ||
      type === 'execution_interrupted' ||
      (type === 'executing' && !eventData.node)
    ) {
      finished = true
      notifyFinished()
    }
    if (type === 'execution_cached' && eventData.nodes?.length) {
      const cached = [...new Set(eventData.nodes.map((node) => graph[node]?.class_type ?? node))]
      jobLog(job, 'Used cache · ' + cached.join(', '))
      job.phases.push({ label: 'From cache', seconds: 0, note: cached.join(', ') })
      if (cached.some((name) => /Loader/.test(name))) status('Models from cache')
    }
    if (type === 'executing') {
      endPhase()
      if (eventData.node) {
        const node = graph[eventData.node]?.class_type ?? eventData.node
        const label = nodeMessages.find(([pattern]) => pattern.test(node))?.[1] ?? node
        phase = { node, label, at: performance.now(), nested: 0 }
        jobLog(job, 'Running ' + node)
      }
    }
    if (job.cancel) return
    if (!refine && type === 'progress' && eventData.max > 0 && job.hires?.tiles && eventData.node === 'upscale') {
      const { tiles, prescale } = job.hires
      if (eventData.value <= tileRuns.last) tileRuns.count++
      tileRuns.last = eventData.value
      const step = eventData.value + ' / ' + eventData.max
      const tile = Math.min(tiles, tileRuns.count - (prescale ? 1 : 0))
      const fraction = tile < 1 ? 0 : (tile - 1 + eventData.value / eventData.max) / tiles
      job.step = undefined
      status(
        tile < 1 ? 'Upscaling · ' + step : 'Tile ' + tile + ' / ' + tiles + ' · Sampling ' + step,
        Math.max(job.progress, Math.min(0.97, 0.12 + 0.84 * fraction))
      )
    } else if (!refine && type === 'progress' && eventData.max > 0) {
      const { value, max } = eventData
      // Speed counts from the first reported step, so model loading before it does not slow the estimate.
      if (!sampling || value < sampling.last) sampling = { first: value, at: performance.now(), last: value }
      sampling.last = value
      const seconds = (performance.now() - sampling.at) / 1000
      const rate = value > sampling.first && seconds > 0 ? (value - sampling.first) / seconds : undefined
      job.step = { value, max, rate: rate && Number(rate.toFixed(3)) }
      status('Sampling · ' + value + ' / ' + max, Math.max(job.progress, Math.min(0.97, 0.12 + 0.84 * (value / max))))
    } else if (type === 'executing' && eventData.node) {
      job.step = undefined
      status(
        phase?.label ?? 'Workflow running',
        Math.max(job.progress, phase?.label === 'Decoding image' ? 0.97 : 0.06)
      )
    }
  })
  return {
    endPhase,
    output,
    wait: () => (finished ? delay(100) : Promise.race([finishedEvent, delay(450)]))
  }
}

// ComfyUI sends sampling previews as binary frames: a 4-byte event type, then for type 1 a 4-byte image format
// (1 JPEG, 2 PNG) and for type 4 a 4-byte metadata length, JSON metadata and the image. Only the latest is kept.
function livePreview(job, buffer) {
  if (buffer.byteLength < 8) return
  const view = new DataView(buffer)
  const event = view.getUint32(0)
  let type, start
  if (event === 1) {
    type = view.getUint32(4) === 2 ? 'image/png' : 'image/jpeg'
    start = 8
  } else if (event === 4) {
    const length = view.getUint32(4)
    if (8 + length > buffer.byteLength) return
    let metadata
    try {
      metadata = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, length)))
    } catch {
      return
    }
    if (metadata.prompt_id && metadata.prompt_id !== job.id) return
    type = metadata.image_type === 'image/png' ? 'image/png' : 'image/jpeg'
    start = 8 + length
  } else return
  if (start >= buffer.byteLength) return
  job.preview = { data: Buffer.from(buffer, start), type, version: (job.preview?.version ?? 0) + 1 }
}

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { randomUUID } from 'node:crypto'
import { collectPreview, clearPreviews, previewMethods, previewNames, post, request, stopWorker } from './comfy.mjs'
import { inspect, buildGraph, pngPayload } from './profiles.mjs'
import { log } from './log.mjs'
import { trackProgress } from './jobs/progress.mjs'
import { refinementGraph } from './jobs/refinement.mjs'
import { detectionBoxes, detectionGraph, maxMasks } from './jobs/detection.mjs'

export const jobs = new Map()
export let active
const terminal = new Set(['complete', 'cancelled', 'error'])

export function launch(worker, config, session, data, refine = false) {
  if (active) throw new Error('A job is already running.')
  const id = randomUUID()
  const job = { id, session, stage: 'preparing', progress: 0, message: 'Preparing inputs', updated: Date.now() }
  jobs.set(id, job)
  active = job
  job.finished = execute(worker, config, job, data, refine)
  return job
}

function update(job, stage, message, progress = job.progress) {
  Object.assign(job, { stage, message, progress, updated: Date.now() })
}
export function cancel(job) {
  if (job.cancel || terminal.has(job.stage)) return
  job.cancel = true
  update(job, 'cancelling', 'Cancellation requested')
  jobLog(job, 'Cancellation requested')
}
export function releaseSession(session, worker) {
  for (const job of jobs.values()) {
    if (job.session !== session) continue
    if (job === active) {
      job.discard = true
      cancel(job)
    } else {
      jobs.delete(job.id)
    }
  }
  if (worker?.cacheSession === session) {
    worker.cacheClosed = true
    if (!active) void resetClosedCache(worker)
  }
}

function resetClosedCache(worker) {
  if (!worker.cacheClosed || worker.state !== 'ready') return worker.cacheReset
  worker.cacheClosed = false
  worker.cacheSession = undefined
  // ComfyUI's /free always unloads the models too, so the opt-in setting skips it and keeps the cache warm.
  if (worker.keepModels) return worker.cacheReset
  worker.modelLoaders = undefined
  worker.cacheReset = post(worker, '/free', { free_memory: true, unload_models: true }).then(
    () => log('Brücke', 'Marked the previous session’s ComfyUI cache for release'),
    (error) => log('Brücke', 'Could not release the ComfyUI cache · ' + error.message)
  )
  return worker.cacheReset
}

function jobLog(job, message) {
  log('Brücke', job.id.slice(0, 8) + ' · ' + message)
}
export function pruneJobs() {
  for (const job of jobs.values()) {
    if (job !== active && Date.now() - job.updated > 5 * 60 * 1000) jobs.delete(job.id)
  }
}
export function publicJob(job) {
  const { id, stage, message, progress, models, parameters } = job
  const prompt = stage === 'complete' && typeof job.result === 'string' ? job.result : undefined
  // The client fetches the live preview only when this counter changes.
  const preview = terminal.has(stage) ? undefined : job.preview?.version
  const step = stage === 'running' ? job.step : undefined
  // Detection jobs: the number of masks, fetched by index.
  const masks = stage === 'complete' && Array.isArray(job.result) ? job.result.length : undefined
  const detections = masks === undefined ? undefined : job.detections
  return {
    id,
    stage,
    message,
    progress,
    models,
    parameters,
    prompt,
    preview,
    step,
    masks,
    detections,
    phases: job.phases
  }
}

// kind: image, refinement or detection. Each kind keeps the loaders of its last job.
function retainModelLoaders(worker, graph, models, kind) {
  worker.modelLoaders ??= {}
  const loaderIds = new Set(Object.keys(models).map((key) => key.split('.', 1)[0]))
  worker.modelLoaders[kind] = [...loaderIds]
    .map((id) => graph[id])
    .filter((node) => Object.values(node.inputs).every((value) => !Array.isArray(value)))
  // Classic cache keeps matching node signatures present in the graph. Disconnected loaders are never executed.
  const others = Object.entries(worker.modelLoaders).flatMap(([other, nodes]) => (other === kind ? [] : nodes))
  others.forEach((node, index) => {
    graph['pixelbench_cached_' + index] = node
  })
}

// Detection masks: skip the blank first mask that keeps an empty result valid.
async function collectMasks(worker, outputs) {
  if (!Array.isArray(outputs) || !outputs.length || outputs.length > maxMasks)
    throw new Error('ComfyUI returned no usable masks.')
  return Promise.all(outputs.slice(1).map((output) => collectPreview(worker, output)))
}

async function execute(worker, config, job, data, refine) {
  const folder = join(worker.dir, 'input', job.id)
  let submitted = false
  let ws
  let result
  let failure
  let existingPreviews
  let progress
  const elapsed = (at) => ((performance.now() - at) / 1000).toFixed(2) + ' s'
  const started = performance.now()
  const detect = !refine && data?.tool === 'detect'
  const kind = refine ? 'refinement' : detect ? 'detection' : 'image'
  jobLog(job, refine ? 'Refine prompt' : 'Preparing inputs · ' + (detect ? 'Detection' : data.profile))
  try {
    if (worker.cacheSession && worker.cacheSession !== job.session) worker.cacheClosed = true
    await resetClosedCache(worker)
    const available = await inspect(worker, config, 2000)
    let graph
    if (refine) {
      const models = worker.inspected.refinementModels
      const model = data.model ? models.find(({ file }) => file === data.model) : models[0]
      if (!model) throw new Error('The prompt refinement model is unavailable.')
      graph = refinementGraph(model, data)
      job.models = { 'clip.clip_name': model.file }
    } else {
      let prepared, label
      if (detect) {
        prepared = detectionGraph(data, job.id, worker.inspected.detectors)
        job.terms = prepared.terms
        label = prepared.label
      } else {
        const profile = available.find((p) => p.id === data.profile)
        if (!profile?.ready)
          throw new Error(
            profile ? profile.name + ' · ' + (profile.blockers[0] ?? 'Check backend') : 'Workflow profile missing.'
          )
        prepared = buildGraph(profile, data, job.id)
        label = profile.name + ' · ' + data.size.join(' × ') + ' px'
      }
      graph = prepared.graph
      // Previews are deleted after each job. An identical job, such as a locked seed, would otherwise reuse the
      // cached preview with its deleted file. The literal input only changes the cache key and is not passed on.
      graph.preview.inputs.pixelbench_job = job.id
      job.models = prepared.models
      job.parameters = prepared.parameters
      job.loras = prepared.loras
      job.strength = prepared.strength
      job.upscaler = prepared.upscaler
      job.hires = prepared.hires
      if (job.cancel) return
      await mkdir(folder)
      for (const file of prepared.files)
        await writeFile(join(folder, file.name), pngPayload(file.payload, file.size), { flag: 'wx' })
      jobLog(job, label)
    }
    if (job.cancel) return

    const client = randomUUID()
    const url = new URL(worker.address)
    url.protocol = 'ws:'
    url.pathname = '/ws'
    url.search = new URLSearchParams({ clientId: client, token: worker.token }).toString()
    ws = new WebSocket(url)
    progress = trackProgress(ws, { job, graph, refine, terminal, update, jobLog, elapsed })
    // Only one job runs at a time, so every console line belongs to it.
    worker.onOutput = progress.output
    await Promise.race([
      new Promise((resolve) => {
        ws.addEventListener('open', resolve, { once: true })
        ws.addEventListener('error', resolve, { once: true })
      }),
      delay(1200)
    ])
    if (job.cancel) return
    if (!refine) existingPreviews = new Set(await previewNames(worker))
    if (job.cancel) return
    if (config.memory !== 'low') retainModelLoaders(worker, graph, job.models, kind)
    const body = {
      prompt: graph,
      prompt_id: job.id,
      client_id: client,
      extra_data: {
        pixelbench_session: job.session,
        preview_method: refine ? 'none' : (previewMethods[config.previews] ?? 'none')
      }
    }
    worker.cacheSession = job.session
    submitted = true
    jobLog(job, 'Models · ' + Object.values(job.models).join(' · '))
    if (job.upscaler) jobLog(job, 'Upscaler · ' + job.upscaler)
    if (job.strength !== undefined) jobLog(job, 'Strength ' + job.strength)
    if (job.hires)
      jobLog(
        job,
        'Hires fix · ' +
          job.hires.size.join(' × ') +
          ' px · Details ' +
          job.hires.strength +
          (job.hires.steps ? ' · ' + job.hires.steps + ' steps' : '') +
          (job.hires.tiled ? ' · ' + job.hires.tiles + ' tiles' : '')
      )
    if (job.loras?.length)
      jobLog(job, 'LoRAs · ' + job.loras.map(({ name, strength }) => name + ' ' + strength).join(' · '))
    try {
      const response = await (await post(worker, '/prompt', body, 30000)).json()
      if (response.prompt_id !== job.id) throw new Error('ComfyUI does not accept the job ID provided by the app.')
    } catch (error) {
      if (error.http === 400) submitted = false
      throw error
    }
    if (job.stage === 'preparing') update(job, 'queued', 'Waiting for ComfyUI', 0.02)
    let missing = 0
    let cancellationSent = false
    const submittedAt = Date.now()
    while (true) {
      if (Date.now() - submittedAt > (refine ? 120_000 : 30 * 60 * 1000)) throw new Error('The ComfyUI job timed out.')
      let history
      try {
        if (job.cancel && !cancellationSent) {
          const cancellation = await (await post(worker, '/api/jobs/' + job.id + '/cancel', {})).json()
          cancellationSent = cancellation.cancelled === true
        }
        history = (await (await request(worker, '/history/' + job.id)).json())[job.id]
        missing = 0
      } catch (error) {
        if (++missing >= 3) throw new Error('Connection to ComfyUI lost. ' + error.message, { cause: error })
        if (!job.cancel) update(job, job.stage, 'Retrying the ComfyUI connection …')
        await delay(400)
        continue
      }
      if (history) {
        progress.endPhase()
        submitted = false
        await post(worker, '/history', { delete: [job.id] }).catch(() => {})
        if (job.cancel) break
        if (!history.status?.completed) {
          const error = history.status?.messages?.find(([type]) => type === 'execution_error')?.[1]
          throw new Error(
            error
              ? (error.node_type + ': ' + error.exception_message).slice(0, 700)
              : 'ComfyUI finished the job without a result.'
          )
        }
        if (refine) {
          result = history.outputs?.preview?.text?.[0]?.trim()
          if (!result || result.length > 16000) throw new Error('ComfyUI did not return a usable prompt.')
          const references = (text) => (text.match(/<image\d+>/g) ?? []).sort().join(' ')
          if (references(result) !== references(data.prompt))
            throw new Error('The suggestion changed image references.')
        } else if (detect) {
          result = await collectMasks(worker, history.outputs?.preview?.images)
          job.detections = detectionBoxes(history.outputs, job.terms, result.length)
        } else result = await collectPreview(worker, history.outputs?.preview?.images?.[0])
        break
      }
      if (job.cancel || job.stage === 'queued') {
        const queue = await (await request(worker, '/queue')).json()
        const running = queue.queue_running.some((row) => row[1] === job.id)
        const queued = queue.queue_pending.some((row) => row[1] === job.id)
        if (running && !job.cancel) update(job, 'running', 'Workflow running', 0.06)
        if (!running && !queued && job.cancel) {
          submitted = false
          await post(worker, '/history', { delete: [job.id] }).catch(() => {})
          break
        }
      }
      await progress.wait()
    }
  } catch (error) {
    failure = error.message
    if (submitted) await stopWorker(worker)
  } finally {
    ws?.close()
    if (worker.onOutput === progress?.output) worker.onOutput = undefined
    progress?.endPhase()
    try {
      if (!refine) await rm(folder, { recursive: true, force: true })
      if (existingPreviews) await clearPreviews(worker, existingPreviews)
    } catch (error) {
      failure = 'Could not remove all temporary job files. ' + error.message
      await stopWorker(worker)
    }
    job.preview = undefined
    if (failure) update(job, 'error', failure)
    else if (job.cancel) update(job, 'cancelled', refine ? 'Prompt refinement cancelled.' : 'Generation cancelled')
    else if (result) {
      job.result = result
      update(job, 'complete', refine ? 'Prompt suggestion ready' : 'Preview ready', 1)
    } else update(job, 'error', 'ComfyUI did not return a preview.')
    jobLog(job, job.message + ' · ' + elapsed(started))
    if (job.discard) jobs.delete(job.id)
    // Release the slot before awaiting /free. The next job awaits worker.cacheReset at its start.
    active = undefined
    await resetClosedCache(worker)
  }
}

import { useRef, useState, type RefObject } from 'react'
import { ApiError, api } from '../api/client.js'
import { collect, type Prepared, type Variant } from '../editor/generation.js'
import { messageOf, pause } from '../helpers/async.js'
import type { Job, JobPhase } from '../types/api.js'
import type { Notice, Tool } from '../types/editor.js'
import type { Detection } from '../types/image.js'
import type { RunOutcome } from '../settings/notify.js'

type Task = { path?: string; cancel: boolean }
/** Runs one job to its end. Undefined when the run was cancelled. */
export type Runner = {
  job: (request: unknown) => Promise<{ path: string; job: Job } | undefined>
  notice: Notice
  showDetections: (detections?: Detection[]) => void
}
/** One step of a run. It renders the next variant, usually from the previous one, through the runner's jobs. */
export type Stage = (runner: Runner, previous?: Variant) => Promise<Variant | undefined>

/** A stage with one job whose result is blended back like any render. Undefined from prepare skips the stage. */
export function jobStage(prepare: (previous?: Variant) => Prepared | Promise<Prepared> | undefined): Stage {
  return async (runner, previous) => {
    const source = await prepare(previous)
    if (!source) return
    const prepared = { ...source, request: { ...source.request } }
    const done = await runner.job(prepared.request)
    if (!done) return
    prepared.request.models = done.job.models
    prepared.request.parameters = done.job.parameters ?? prepared.request.parameters
    return collect(done.path, prepared)
  }
}
// preview: object URL of the latest live sampling preview.
type Progress = Pick<Job, 'message' | 'progress' | 'step'> & { preview?: string }
/** Phases of the latest image run, kept after it ends. A run with a hires fix spans two jobs. */
export type RunHistory = { phases: JobPhase[]; state: 'running' | 'complete' | 'cancelled' | 'error' }

async function withSession<T>(session: RefObject<string | undefined>, send: (id: string) => Promise<T>) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!session.current) session.current = (await api<{ session: string }>('/api/session', {})).session
    try {
      return await send(session.current)
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404 || attempt > 0) throw error
      session.current = undefined
    }
  }
}

export function useGeneration(
  session: RefObject<string | undefined>,
  onVariant: (variant: Variant) => void,
  notice: Notice,
  refresh: () => Promise<unknown>,
  onRunEnd?: (outcome: RunOutcome) => void
) {
  const task = useRef<Task>(undefined)
  const [progress, setProgress] = useState<Progress>()
  const [cancelling, setCancelling] = useState(false)
  const [refining, setRefining] = useState(false)
  // Detailer boxes on the shown image while the run lasts.
  const [detections, setDetections] = useState<Detection[]>()
  const previewUrl = useRef<string>(undefined)
  const [history, setHistory] = useState<RunHistory>()
  // Phases of the jobs of the current run that already ended.
  const finishedPhases = useRef<JobPhase[]>(undefined)
  const showPhases = (job: Job) => {
    const done = finishedPhases.current
    if (done) setHistory({ phases: [...done, ...(job.phases ?? [])], state: 'running' })
  }
  const running = progress !== undefined

  async function loadPreview(path: string) {
    try {
      const response = await fetch(path + '/preview')
      if (!response.ok) return
      const next = URL.createObjectURL(await response.blob())
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
      previewUrl.current = next
    } catch {
      // A missed frame is replaced by the next one.
    }
  }

  async function submit(active: Task, route: string, data: unknown) {
    return withSession(session, async (id) => {
      if (active.cancel) return
      const base = '/api/session/' + id + '/'
      const job = await api<Job>(base + route, data)
      return { job, path: base + 'jobs/' + job.id }
    })
  }

  async function follow(active: Task, submitted: { job: Job; path: string }) {
    const path = (active.path = submitted.path)
    let job = submitted.job
    if (active.cancel) await api(path + '/cancel', {})
    let missed = 0
    let shown: number | undefined
    while (!['complete', 'error', 'cancelled'].includes(job.stage)) {
      if (job.preview !== undefined && job.preview !== shown && !active.cancel) {
        shown = job.preview
        await loadPreview(path)
      }
      if (!active.cancel || job.stage === 'cancelling')
        setProgress({ message: job.message, progress: job.progress, step: job.step, preview: previewUrl.current })
      showPhases(job)
      await pause(430)
      try {
        job = await api<Job>(path)
        missed = 0
      } catch (error) {
        setProgress({ message: 'Verbindung wird erneut geprüft …', progress: job.progress })
        if (++missed >= 5) throw error
      }
    }
    showPhases(job)
    finishedPhases.current?.push(...(job.phases ?? []))
    if (job.stage === 'error') throw new Error(job.message)
    return job
  }

  function finish() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = undefined
    task.current = undefined
    setProgress(undefined)
    setCancelling(false)
    setRefining(false)
    setDetections(undefined)
  }

  // Stages run in order. Each one gets the previous variant, such as the hires fix after a render.
  async function run(stages: Stage[]) {
    if (task.current) return
    const active = (task.current = { cancel: false } as Task)
    notice()
    setProgress({ message: 'Eingaben vorbereiten', progress: 0 })
    finishedPhases.current = []
    let outcome: RunHistory['state'] = 'complete'
    const runner: Runner = {
      async job(request) {
        const submitted = active.cancel ? undefined : await submit(active, 'jobs', request)
        if (!submitted) return
        const job = await follow(active, submitted)
        if (job.stage === 'cancelled' || active.cancel) {
          await api(submitted.path + '/release', {}).catch(() => {})
          return
        }
        return { path: submitted.path, job }
      },
      notice,
      showDetections: setDetections
    }
    try {
      let previous: Variant | undefined
      for (const stage of stages) {
        const variant = await stage(runner, previous)
        if (!variant || active.cancel) break
        onVariant(variant)
        previous = variant
      }
      if (!active.cancel) return
      outcome = 'cancelled'
      notice('Generierung abgebrochen.', true)
    } catch (error) {
      outcome = 'error'
      notice(messageOf(error))
      void refresh()
    } finally {
      const phases = finishedPhases.current ?? []
      finishedPhases.current = undefined
      // A run that never reached ComfyUI keeps the history of the previous one.
      if (phases.length) setHistory({ phases, state: outcome })
      else
        setHistory(
          (previous) => previous && { ...previous, state: previous.state === 'running' ? outcome : previous.state }
        )
      finish()
      onRunEnd?.(outcome)
    }
  }

  async function refine(prompt: string, tool: Tool, profile?: string, model?: string) {
    if (task.current) return
    const active = (task.current = { cancel: false } as Task)
    setRefining(true)
    setProgress({ message: 'Eingaben vorbereiten', progress: 0 })
    try {
      const submitted = await submit(active, 'refine-prompt?background=1', { prompt, tool, profile, model })
      if (submitted) {
        const job = await follow(active, submitted)
        if (!active.cancel && job.stage === 'complete') return job.prompt
      }
      notice('Prompt-Verbesserung abgebrochen.', true)
    } finally {
      if (active.path) void api(active.path + '/release', {}).catch(() => {})
      finish()
    }
  }

  async function cancel() {
    const active = task.current
    if (!active || active.cancel) return
    active.cancel = true
    setCancelling(true)
    setProgress((previous) => ({ message: 'Abbruch angefordert', progress: previous?.progress ?? 0 }))
    if (active.path) {
      try {
        await api(active.path + '/cancel', {})
      } catch (error) {
        notice(messageOf(error))
      }
    }
  }

  return { running, progress, history, cancelling, run, cancel, refining, refine, detections }
}

export type Generation = ReturnType<typeof useGeneration>

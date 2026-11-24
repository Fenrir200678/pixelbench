import { randomUUID } from 'node:crypto'
import { active, cancel, jobs, launch, publicJob, releaseSession } from '../jobs.mjs'
import { decodeAsync } from '../png.mjs'
import { profiles } from '../profiles.mjs'
import { badInput, json, notFound, readJson, reject, sendRaw } from './http.mjs'

const sessions = new Map()
const maxSessions = 64
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const sides = ['top', 'bottom', 'left', 'right']
// Vision refinement is for outpainting: the image and the sides it extends.
const validVision = ({ tool, image, sides: extended }) =>
  tool === 'outpaint' &&
  typeof image === 'string' &&
  image.length > 0 &&
  Array.isArray(extended) &&
  extended.length > 0 &&
  extended.length <= 4 &&
  extended.every((side) => sides.includes(side))

export function createSession(res, worker) {
  const session = randomUUID()
  // Cap the map. Release the session with the oldest activity first.
  while (sessions.size >= maxSessions) {
    const [oldest] = [...sessions].reduce((a, b) => (b[1] < a[1] ? b : a))
    releaseSession(oldest, worker)
    sessions.delete(oldest)
  }
  sessions.set(session, Date.now())
  return json(res, 201, { session })
}

export function touchSession(id) {
  if (sessions.has(id)) sessions.set(id, Date.now())
}

export function expireSessions(worker) {
  for (const [id, lastActivity] of sessions) {
    if (Date.now() - lastActivity < 24 * 60 * 60 * 1000) continue
    releaseSession(id, worker)
    sessions.delete(id)
  }
}

export async function handleSession(req, res, url, getBackend) {
  const path = url.pathname
  const [, , , session, action, id, command] = path.split('/')
  if (!uuid.test(session) || !sessions.has(session)) reject('The editing session has expired.', 404)
  sessions.set(session, Date.now())
  if (req.method === 'POST' && action === 'close' && !id) {
    releaseSession(session, getBackend().worker)
    sessions.delete(session)
    return json(res, 200, { ok: true })
  }
  if (req.method === 'POST' && (action === 'jobs' || action === 'refine-prompt') && !id) {
    const refine = action === 'refine-prompt'
    // A refinement may carry one downscaled image for the vision model.
    const data = await readJson(req, refine ? 8_000_000 : undefined)
    if (
      refine &&
      (typeof data?.prompt !== 'string' ||
        (!data.prompt.trim() && data.image === undefined) ||
        (data.image !== undefined && !validVision(data)) ||
        data.prompt.length > 16000 ||
        (data.model !== undefined && (typeof data.model !== 'string' || !data.model || data.model.length > 4096)) ||
        !['create', 'edit', 'inpaint', 'outpaint', 'upscale'].includes(data.tool) ||
        (data.profile !== undefined &&
          !profiles.some(({ definition }) => definition.id === data.profile && definition.tools.includes(data.tool))))
    ) {
      reject('Invalid prompt or editing mode.')
    }
    if (!sessions.has(session)) reject('The editing session has ended.', 404)
    const { closing, changing, worker, config } = getBackend()
    if (closing || changing || worker?.state !== 'ready' || config.mode !== 'managed') {
      reject(
        config.mode === 'external'
          ? 'External instance blocked: no secure deletion of temporary files.'
          : 'Private ComfyUI is currently unavailable.',
        503
      )
    }
    if (active) reject(refine ? 'A job is already running.' : 'A generation is already running.', 409)
    if (res.destroyed) return
    const job = launch(worker, config, session, data, refine)
    if (!refine || url.searchParams.get('background') === '1') return json(res, 202, publicJob(job))
    res.once('close', () => cancel(job))
    try {
      await job.finished
      if (res.destroyed) return
      if (job.stage !== 'complete') reject(job.message, 422)
      return json(res, 200, { prompt: job.result })
    } finally {
      jobs.delete(job.id)
    }
  }
  const job = jobs.get(id)
  if (action !== 'jobs' || job?.session !== session) reject('Job not found.', 404)
  if (req.method === 'GET' && !command) return json(res, 200, publicJob(job))
  if (req.method === 'POST' && command === 'cancel') {
    cancel(job)
    return json(res, 200, publicJob(job))
  }
  // Detection jobs hold one mask per object, addressed by index.
  const image = Array.isArray(job.result) ? job.result[Number(url.searchParams.get('index') ?? '-')] : job.result
  if (req.method === 'GET' && command === 'image' && Buffer.isBuffer(image)) {
    if (url.searchParams.get('raw') === '1') {
      const png = await badInput(() => decodeAsync(image))
      return sendRaw(res, png)
    }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': image.length })
    res.end(image)
    return
  }
  if (req.method === 'GET' && command === 'preview' && job.preview) {
    const { data, type } = job.preview
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length, 'Cache-Control': 'no-store' })
    res.end(data)
    return
  }
  if (req.method === 'POST' && command === 'release' && job !== active) {
    jobs.delete(job.id)
    return json(res, 200, { ok: true })
  }
  return notFound(res)
}

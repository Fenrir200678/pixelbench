import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaults, validateAddress, validateConfig, createWorker, stopWorker, sweepWorkers, request } from './comfy.mjs'
import { inspect, profiles } from './profiles.mjs'
import { active, cancel, pruneJobs } from './jobs.mjs'
import { log, readLogs } from './log.mjs'
import { handlePng, serveStatic } from './app/files.mjs'
import { badInput, json, notFound, readJson, reject } from './app/http.mjs'
import { createSession, expireSessions, handleSession, touchSession } from './app/sessions.mjs'
import { checkPath, pickPath } from './app/paths.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const web = join(root, 'dist')
const stateDirectory = process.env.PIXELBENCH_STATE
const state = stateDirectory ? resolve(stateDirectory) : root
const runtime = join(state, '.runtime')
const settings = join(state, '.settings.json')
const port = Number(process.env.PIXELBENCH_PORT ?? 3720)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid app port.')
const origin = 'http://127.0.0.1:' + port
const host = '127.0.0.1:' + port
let worker
let external
let config = defaults
let changing = true
let backendChange
let closing = false
let setupError = ''
const instance = randomUUID()
const externalNotice =
  'The external instance is reachable. Its API cannot securely delete uploaded inputs and temporary previews. Use the private process to generate images.'

const publicProfiles = () =>
  profiles.map(({ definition }) => ({
    ...definition,
    available: false,
    ready: false,
    missing: [],
    blockers: [],
    modelMissing: {},
    choices: {},
    candidates: {},
    catalog: {},
    selected: {}
  }))

async function status(fresh = false) {
  const backend = config.mode === 'managed' ? worker : external
  if (changing || (backend?.owned && backend.state !== 'ready') || !backend) {
    return {
      state: changing ? 'starting' : (backend?.state ?? 'error'),
      mode: config.mode,
      message: setupError || backend?.details || 'Private ComfyUI is starting …',
      profiles: publicProfiles()
    }
  }
  try {
    const found = await inspect(backend, config, fresh ? 0 : undefined)
    const stats = backend.stats ?? (await (await request(backend, '/system_stats')).json())
    return {
      state: 'ready',
      mode: config.mode,
      profiles: found,
      refinementModels: backend.inspected.refinementModels.map(({ file }) => file),
      loras: backend.inspected.loras,
      upscalers: backend.inspected.upscalers,
      tiledUpscale: backend.inspected.tiledUpscale,
      seedVariance: backend.inspected.seedVariance,
      detectors: backend.inspected.detectors,
      memory: config.memory,
      address: backend.address,
      message: backend.owned ? 'ComfyUI connected' : externalNotice,
      device: stats.devices?.[0]?.name,
      version: stats.system?.comfyui_version
    }
  } catch (error) {
    return {
      state: 'error',
      mode: config.mode,
      message: 'Cannot reach ComfyUI · ' + backend.address + ' · ' + error.message,
      profiles: publicProfiles()
    }
  }
}

// Live memory of the first device. ComfyUI reads it fresh on every /system_stats call.
async function vram() {
  const backend = config.mode === 'managed' ? worker : external
  if (changing || !backend || (backend.owned && backend.state !== 'ready')) return { available: false }
  try {
    const stats = await (await request(backend, '/system_stats', { timeout: 2000 })).json()
    const device = stats.devices?.[0]
    if (!(device?.vram_total > 0) || device.type === 'cpu') return { available: false }
    return {
      available: true,
      name: String(device.name ?? '')
        .replace(/^\w+:\d+\s+/, '')
        .replace(/\s+:\s+\S+$/, ''),
      total: device.vram_total,
      free: device.vram_free,
      reserved: device.torch_vram_total ?? 0
    }
  } catch {
    return { available: false }
  }
}

async function restartBackend() {
  await stopWorker(worker)
  worker = undefined
  external = undefined
  await sweepWorkers(config, runtime)
  if (config.mode === 'managed') {
    const created = (worker = createWorker(config, runtime))
    created.onCrash = () => scheduleRecovery(created)
  } else {
    external = { address: config.address, owned: false }
    log('Brücke', 'External connection configured · ' + config.address)
  }
}

// Restart a crashed private worker, at most 3 times within 5 minutes. After that it stays in the error state.
const recoveries = []
function scheduleRecovery(crashed) {
  const attempt = () => {
    if (crashed !== worker || closing) return
    if (changing || active) return void setTimeout(attempt, 2000).unref()
    const now = Date.now()
    while (recoveries.length && now - recoveries[0] > 5 * 60_000) recoveries.shift()
    if (recoveries.length >= 3) {
      crashed.details += ' Automatic restart abandoned after 3 attempts in 5 minutes. Restart in Settings.'
      log('Brücke', 'Automatic restart abandoned')
      return
    }
    recoveries.push(now)
    log('Brücke', 'Restarting private ComfyUI · attempt ' + recoveries.length + ' of 3')
    setupError = ''
    crashed.details += ' Restarting (attempt ' + recoveries.length + ' of 3) …'
    void changeBackend(restartBackend).catch((error) => {
      setupError = error.message
    })
  }
  setTimeout(attempt, 1000).unref()
}

async function changeBackend(change) {
  changing = true
  backendChange = change()
  try {
    await backendChange
  } finally {
    changing = false
  }
}

const getBackend = () => ({ worker, config, changing, closing })

const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  )

  try {
    if (
      req.headers.host !== host ||
      (req.headers.origin && req.headers.origin !== origin) ||
      req.headers['sec-fetch-site'] === 'cross-site'
    )
      reject('This app only accepts same-origin local requests.', 403)
    const url = new URL(req.url, origin)
    const path = url.pathname
    if (closing) reject('The Pixelbench server is shutting down.', 503)

    if (path === '/api/server') {
      if (req.method === 'GET') return json(res, 200, { instance })
      if (req.method === 'POST') {
        if (req.headers.origin !== origin) reject('This action requires a same-origin request.', 403)
        const data = await readJson(req, 1024)
        const action = data?.action
        if (action !== 'shutdown' && action !== 'restart') reject('Unknown server action.')
        if (closing || changing || active) reject('Wait for the current job or backend change to finish.', 409)
        closing = true
        res.setHeader('Connection', 'close')
        res.once('close', () => void terminate(action))
        return json(res, 202, { instance })
      }
    }

    if (req.method === 'GET' && path === '/api/status') {
      touchSession(url.searchParams.get('session'))
      return json(res, 200, await status(url.searchParams.has('refresh')))
    }
    if (req.method === 'GET' && path === '/api/vram') return json(res, 200, await vram())
    if (req.method === 'GET' && path === '/api/logs') {
      const after = Number(url.searchParams.get('after'))
      return json(
        res,
        200,
        readLogs(after >= 0 && Number.isSafeInteger(after) ? after : 0, url.searchParams.get('stream'))
      )
    }
    if (req.method === 'POST' && (path === '/api/png/decode' || path === '/api/png/encode'))
      return await handlePng(req, res, url)
    if (req.method === 'GET' && path === '/api/config') return json(res, 200, config)
    if (req.method === 'POST' && path === '/api/probe') {
      const data = await readJson(req, 4096)
      const address = await badInput(() => validateAddress(data.address))
      try {
        const stats = await (await request({ address }, '/system_stats')).json()
        if (typeof stats.system?.comfyui_version !== 'string') reject('No ComfyUI API is responding at this address.')
        return json(res, 200, { message: externalNotice, version: stats.system.comfyui_version })
      } catch (error) {
        reject('Cannot reach ComfyUI · ' + address + ' · ' + error.message, 503)
      }
    }
    if (req.method === 'POST' && path === '/api/paths/check') {
      const data = await readJson(req, 8192)
      if (!Array.isArray(data?.items) || data.items.length > 40) reject('Invalid path list.')
      return json(res, 200, { results: await Promise.all(data.items.map(checkPath)) })
    }
    if (req.method === 'POST' && path === '/api/paths/pick') {
      // The picker opens a window on the desktop, so only this app's own page may ask for it.
      if (req.headers.origin !== origin) reject('This action requires a same-origin request.', 403)
      const data = await readJson(req, 4096)
      return json(res, 200, { path: await pickPath(data ?? {}) })
    }
    if (req.method === 'POST' && path === '/api/config') {
      const input = await readJson(req, 65536)
      const next = await badInput(() => validateConfig(input))
      if (closing || changing || active) reject('Wait for the current job or backend startup to finish.', 409)
      // Previews are sent with each job, so changing only them needs no ComfyUI restart.
      const backendChanged =
        JSON.stringify({ ...next, previews: undefined }) !== JSON.stringify({ ...config, previews: undefined })
      const store = async () => {
        await writeFile(settings + '.next', JSON.stringify(next, null, 2))
        await rename(settings + '.next', settings)
        config = next
      }
      if (!backendChanged) {
        await store()
        return json(res, 200, config)
      }
      await changeBackend(async () => {
        setupError = ''
        await store()
        await restartBackend()
      })
      return json(res, 200, config)
    }
    if (req.method === 'POST' && path === '/api/restart') {
      if (changing || active) reject('Wait for the current job or backend startup to finish.', 409)
      setupError = ''
      await changeBackend(restartBackend)
      return json(res, 200, { ok: true })
    }
    if (req.method === 'POST' && path === '/api/session') return createSession(res, worker)
    if (path.startsWith('/api/session/')) return await handleSession(req, res, url, getBackend)

    const asset = serveStatic(req, res, path, web)
    if (asset) return await asset
    return notFound(res)
  } catch (error) {
    if (!res.headersSent) json(res, error.status ?? (error.code === 'ENOENT' ? 404 : 500), { error: error.message })
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log('Pixelbench · ' + origin)
  log('Brücke', 'Pixelbench ready · ' + origin)
  void changeBackend(async () => {
    await mkdir(runtime, { recursive: true })
    try {
      config = validateConfig(JSON.parse(await readFile(settings, 'utf8')))
    } catch (error) {
      if (error.code !== 'ENOENT') console.error(error.message)
    }
    await restartBackend()
  }).catch((error) => {
    setupError = error.message
  })
})
setInterval(() => {
  if (closing) return
  pruneJobs()
  expireSessions(worker)
  if (!changing && worker?.state !== 'starting') void sweepWorkers(config, runtime, worker?.dir)
}, 60000).unref()

async function terminate(action) {
  const drained = new Promise((resolve) => server.close(resolve))
  const deadline = setTimeout(() => server.closeAllConnections(), 2000)
  try {
    await backendChange?.catch(() => {})
    if (active) {
      cancel(active)
      await active.finished
    }
    await stopWorker(worker)
    await sweepWorkers(config, runtime)
    await drained
    // The launcher starts a replacement only after this process exits.
    process.exit(action === 'restart' ? 75 : 0)
  } catch (error) {
    console.error('Pixelbench could not shut down cleanly:', error.message)
    process.exit(1)
  } finally {
    clearTimeout(deadline)
  }
}

function shutdown() {
  if (closing) return
  closing = true
  void terminate('shutdown')
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
  process.on(signal, shutdown)
}
process.on('message', (message) => {
  if (message === 'shutdown') shutdown()
})
process.on('disconnect', shutdown)

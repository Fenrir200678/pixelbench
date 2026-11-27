import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { json, readJson, reject } from './http.mjs'

const endpoint = '/api/editor-session'
const idPattern = '[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}'
const assetRoute = new RegExp(`^${endpoint}/assets/(${idPattern})$`)
const assetFile = new RegExp(`^(${idPattern})\\.gz(?:\\.next)?$`)
const assetId = new RegExp(`^${idPattern}$`)
const manifestLimit = 32 * 1024 * 1024
const assetLimit = 144 * 1024 * 1024
const totalLimit = 4 * 1024 * 1024 * 1024
const defaultLimitMB = 50
const validLimit = (value) => Number.isInteger(value) && value >= 1 && value <= 1000
const empty = (revision = 'none') => ({ revision, savedAt: null, assets: {} })
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value)
const validLength = (size) => Number.isSafeInteger(size) && size >= 0 && size <= assetLimit
const totalBytes = (sizes) => sizes.reduce((total, size) => total + size, 0)
const tooLarge = () => reject('The editor session exceeds its storage limit.', 413)
const ifMissing = (error) => {
  if (error.code !== 'ENOENT') throw error
}

function validate(snapshot) {
  if (
    snapshot?.version !== 1 ||
    !isObject(snapshot.workspace) ||
    !isObject(snapshot.assets) ||
    !Object.entries(snapshot.assets).every(([id, size]) => assetId.test(id) && validLength(size)) ||
    totalBytes(Object.values(snapshot.assets)) > totalLimit
  )
    reject('Invalid or unsupported editor session.')
}

async function* checkedBody(req, expected) {
  let bytes = 0
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > expected) reject('Invalid session asset length.')
    yield chunk
  }
  if (bytes !== expected) reject('Incomplete session asset.')
}

export function createEditorSession(runtime, origin) {
  const directory = join(runtime, 'editor-session')
  const manifest = join(directory, 'latest.json')
  const settingsFile = join(runtime, 'editor-session-settings.json')
  const assetPath = (id) => join(directory, id + '.gz')
  let settings = { limitMB: defaultLimitMB, clearedRevision: undefined }
  let snapshot = empty()
  let initializing
  let pending = Promise.resolve()
  let batch
  const byteLimit = () => settings.limitMB * 1_000_000
  const diskSize = async (path) => (await stat(path).catch(ifMissing))?.size ?? 0
  const sessionFiles = async () =>
    (await readdir(directory, { withFileTypes: true }))
      .filter(
        (file) =>
          file.isFile() &&
          (file.name === 'latest.json' || file.name === 'latest.json.next' || assetFile.test(file.name))
      )
      .map((file) => file.name)

  async function summary() {
    const files = await sessionFiles()
    const bytesUsed = totalBytes(await Promise.all(files.map((file) => diskSize(join(directory, file)))))
    return {
      revision: snapshot.revision,
      savedAt: snapshot.savedAt,
      damaged: Boolean(snapshot.damaged),
      assets: Object.keys(snapshot.assets),
      bytesUsed,
      limitMB: settings.limitMB
    }
  }

  async function prune(assets) {
    const files = await sessionFiles()
    await Promise.allSettled(
      files
        .filter((file) => {
          const match = assetFile.exec(file)
          return file === 'latest.json.next' || (match && (file.endsWith('.next') || !Object.hasOwn(assets, match[1])))
        })
        .map((file) => rm(join(directory, file), { force: true }))
    )
  }

  async function initialize() {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const storedSettings = await readFile(settingsFile, 'utf8').catch(ifMissing)
    try {
      const stored = storedSettings && JSON.parse(storedSettings)
      if (validLimit(stored?.limitMB)) settings.limitMB = stored.limitMB
      if (assetId.test(stored?.clearedRevision)) settings.clearedRevision = stored.clearedRevision
    } catch {
      // The workspace can still be read when its storage preferences are damaged.
    }
    snapshot = empty(settings.clearedRevision)
    const raw = await readFile(manifest).catch(ifMissing)
    if (raw) {
      try {
        if (raw.length > manifestLimit + 1024) reject('Editor session is too large.')
        const loaded = JSON.parse(raw.toString('utf8'))
        validate(loaded)
        if (!assetId.test(loaded.revision) || !Number.isFinite(Date.parse(loaded.savedAt)))
          reject('Invalid editor session header.')
        snapshot = loaded
      } catch {
        // Keep files from an unreadable or newer snapshot until the user explicitly replaces it.
        snapshot = { ...empty(createHash('sha256').update(raw).digest('hex')), damaged: true }
        return
      }
    }
    await prune(snapshot.assets)
  }

  function match(req) {
    if (req.headers['if-match'] !== `"${snapshot.revision}"`) reject('The saved editor session changed.', 412)
  }

  async function storeSettings(next) {
    await writeFile(settingsFile + '.next', JSON.stringify(next), { mode: 0o600, flush: true })
    await rename(settingsFile + '.next', settingsFile)
    settings = next
  }

  async function startBatch(res) {
    // Only the active upload may commit. A new attempt also releases any abandoned staged files.
    // Preserve unknown assets of an unreadable snapshot until it is replaced or explicitly deleted.
    if (snapshot.damaged) {
      if (batch) await discardBatch()
    } else await prune(snapshot.assets)
    batch = { id: randomUUID(), staged: new Map() }
    return json(res, 201, { upload: batch.id })
  }

  async function discardBatch() {
    const files = [...batch.staged.keys()]
    batch = undefined
    await Promise.allSettled(files.map((id) => rm(assetPath(id), { force: true })))
  }

  async function upload(req, res, id, staged) {
    if (req.headers['content-type'] !== 'application/octet-stream') reject('Expected a binary session asset.', 415)
    const size = Number(req.headers['content-length'])
    const previous = staged.get(id)
    const stagedAssets = [...staged.values()]
    if (
      !validLength(size) ||
      totalBytes(stagedAssets.map((asset) => asset.size)) - (previous?.size ?? 0) + size > totalLimit
    )
      tooLarge()
    if (Object.hasOwn(snapshot.assets, id)) reject('This session asset is already saved.', 409)
    const remaining = byteLimit() - totalBytes(stagedAssets.map((asset) => asset.bytes)) + (previous?.bytes ?? 0)
    if (remaining <= 0) tooLarge()
    let bytes = 0
    const cap = new Transform({
      transform(chunk, _encoding, next) {
        bytes += chunk.length
        // Keep draining the request so the browser receives the HTTP error.
        next(null, bytes <= remaining ? chunk : undefined)
      }
    })
    const destination = assetPath(id)
    const temporary = destination + '.next'
    try {
      await pipeline(
        checkedBody(req, size),
        createGzip({ level: 1 }),
        cap,
        createWriteStream(temporary, { mode: 0o600 })
      )
      if (bytes > remaining) tooLarge()
      {
        await using file = await open(temporary, 'r+')
        await file.sync()
      }
      await rename(temporary, destination)
      staged.set(id, { size, bytes })
    } finally {
      await rm(temporary, { force: true }).catch(() => {})
    }
    return json(res, 201, { size })
  }

  async function commit(req, res, staged) {
    const input = await readJson(req, manifestLimit)
    validate(input)
    for (const [id, size] of Object.entries(input.assets)) {
      if ((snapshot.assets[id] ?? staged.get(id)?.size) !== size) reject('A required session asset is missing.', 409)
    }
    const next = {
      version: input.version,
      workspace: input.workspace,
      assets: input.assets,
      revision: randomUUID(),
      savedAt: new Date().toISOString()
    }
    const encoded = JSON.stringify(next)
    const bytes = await Promise.all(Object.keys(next.assets).map((id) => diskSize(assetPath(id))))
    if (bytes.some((size) => size === 0)) reject('A required session asset is missing.', 409)
    if (totalBytes(bytes) + Buffer.byteLength(encoded) > byteLimit()) tooLarge()
    await writeFile(manifest + '.next', encoded, { mode: 0o600, flush: true })
    await rename(manifest + '.next', manifest)
    snapshot = next
    batch = undefined
    await prune(next.assets).catch(() => {})
    return json(res, 200, await summary())
  }

  async function clear(res) {
    const clearedRevision = randomUUID()
    // Persist the new revision even with no manifest, so an open tab cannot recreate a deleted backup with a stale write.
    await storeSettings({ ...settings, clearedRevision })
    await rm(manifest, { force: true })
    snapshot = empty(clearedRevision)
    batch = undefined
    await prune(snapshot.assets)
    const current = await summary()
    if (current.bytesUsed) reject('Some editor session files could not be deleted.', 500)
    return json(res, 200, current)
  }

  async function changeLimit(req, res) {
    const input = await readJson(req, 1024)
    if (!validLimit(input?.limitMB)) reject('The storage limit must be between 1 and 1000 MB.')
    await storeSettings({ ...settings, limitMB: input.limitMB })
    return json(res, 200, await summary())
  }

  async function download(req, res, id) {
    match(req)
    if (!Object.hasOwn(snapshot.assets, id)) reject('Session asset not found.', 404)
    const file = await open(assetPath(id), 'r').catch((error) => {
      if (error.code === 'ENOENT') reject('A saved session asset is missing.', 422)
      throw error
    })
    try {
      const { size } = await file.stat()
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'gzip',
        'Content-Length': size
      })
      await pipeline(file.createReadStream({ autoClose: false }), res)
    } finally {
      await file.close()
    }
  }

  function serialize(run) {
    const operation = pending.then(run)
    pending = operation.catch(() => {})
    return operation
  }

  return async function handleEditorSession(req, res, url) {
    const path = url.pathname
    const id = assetRoute.exec(path)?.[1]
    if (!id && ![endpoint, endpoint + '/begin', endpoint + '/abort', endpoint + '/limit'].includes(path))
      reject('Session address not found.', 404)
    initializing ??= initialize().catch((error) => {
      initializing = undefined
      throw error
    })
    await initializing
    if (req.method === 'GET') {
      if (id) return download(req, res, id)
      if (path !== endpoint) reject('Unsupported session request.', 405)
      if (url.searchParams.has('summary')) return serialize(async () => json(res, 200, await summary()))
      if (snapshot.damaged) reject('The saved editor session is unreadable or uses a newer format.', 422)
      return json(res, 200, snapshot)
    }
    if (req.method !== 'POST' && !(req.method === 'DELETE' && path === endpoint))
      reject('Unsupported session request.', 405)
    if (req.headers.origin !== origin) reject('This action requires a same-origin request.', 403)
    return serialize(async () => {
      if (path === endpoint + '/limit') return changeLimit(req, res)
      match(req)
      if (req.method === 'DELETE') return clear(res)
      if (path === endpoint + '/begin') return startBatch(res)
      if (!batch || batch.id !== req.headers['x-session-upload']) reject('The session upload has expired.', 412)
      if (path === endpoint + '/abort') {
        await discardBatch()
        return json(res, 200, await summary())
      }
      return id ? upload(req, res, id, batch.staged) : commit(req, res, batch.staged)
    })
  }
}

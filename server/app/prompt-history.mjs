import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { json, readJson, reject } from './http.mjs'

const endpoint = '/api/prompt-history'
const actions = ['record', 'remove', 'restore', 'clear', 'settings']
const tools = ['create', 'edit', 'inpaint', 'outpaint', 'upscale']
const textLimit = 16000
const limitRange = { min: 1, max: 500 }
const defaults = { enabled: true, limit: 50 }
const idPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/

const validLimit = (value) => Number.isInteger(value) && value >= limitRange.min && value <= limitRange.max
const validText = (value) => typeof value === 'string' && value.length <= textLimit
const validEntry = (entry) =>
  entry &&
  idPattern.test(entry.id) &&
  validText(entry.prompt) &&
  entry.prompt.trim() !== '' &&
  validText(entry.negative) &&
  tools.includes(entry.tool) &&
  Number.isFinite(Date.parse(entry.at))
const pick = ({ id, prompt, negative, tool, at }) => ({ id, prompt, negative, tool, at })

/** Parses a stored history. Anything unreadable starts over instead of blocking the editor. */
function parse(raw) {
  try {
    const stored = JSON.parse(raw)
    const entries = Array.isArray(stored?.entries) ? stored.entries.filter(validEntry).map(pick) : []
    const limit = validLimit(stored?.limit) ? stored.limit : defaults.limit
    const enabled = typeof stored?.enabled === 'boolean' ? stored.enabled : defaults.enabled
    return { enabled, limit, entries: entries.slice(0, limit) }
  } catch {
    return { ...defaults, entries: [] }
  }
}

export function createPromptHistory(runtime, origin) {
  const file = join(runtime, 'prompt-history.json')
  let state
  let pending = Promise.resolve()

  async function load() {
    if (state) return state
    const raw = await readFile(file, 'utf8').catch((error) => {
      if (error.code !== 'ENOENT') throw error
    })
    return (state = raw === undefined ? { ...defaults, entries: [] } : parse(raw))
  }

  async function store(next) {
    await mkdir(runtime, { recursive: true })
    await writeFile(file + '.next', JSON.stringify({ version: 1, ...next }), { mode: 0o600, flush: true })
    await rename(file + '.next', file)
    state = next
    return next
  }

  // One write at a time, so quick deletions and recordings never overwrite each other.
  function serialize(run) {
    const operation = pending.then(run)
    pending = operation.catch(() => {})
    return operation
  }

  function record(current, input) {
    if (!current.enabled) return current
    if (!validText(input?.prompt) || !validText(input?.negative ?? '') || !tools.includes(input?.tool))
      reject('Invalid prompt history entry.')
    const prompt = input.prompt.trim()
    const negative = (input.negative ?? '').trim()
    if (!prompt) return current
    // The same prompt moves to the top, so repeated runs do not fill the list.
    const others = current.entries.filter((entry) => entry.prompt !== prompt || entry.negative !== negative)
    const entry = { id: randomUUID(), prompt, negative, tool: input.tool, at: new Date().toISOString() }
    return { ...current, entries: [entry, ...others].slice(0, current.limit) }
  }

  function restore(current, input) {
    const entry = input?.entry
    if (!validEntry(entry) || !Number.isInteger(input.index) || input.index < 0) reject('Invalid prompt history entry.')
    if (current.entries.some((item) => item.id === entry.id)) return current
    const entries = [...current.entries]
    entries.splice(Math.min(input.index, entries.length), 0, pick(entry))
    return { ...current, entries: entries.slice(0, current.limit) }
  }

  function settings(current, input) {
    const enabled = input?.enabled ?? current.enabled
    const limit = input?.limit ?? current.limit
    if (typeof enabled !== 'boolean') reject('Invalid prompt history setting.')
    if (!validLimit(limit)) reject(`The prompt history limit must be between ${limitRange.min} and ${limitRange.max}.`)
    return { enabled, limit, entries: current.entries.slice(0, limit) }
  }

  async function change(action, input) {
    const current = await load()
    if (action === 'record') return record(current, input)
    if (action === 'restore') return restore(current, input)
    if (action === 'settings') return settings(current, input)
    if (action === 'clear') return { ...current, entries: [] }
    return { ...current, entries: current.entries.filter((entry) => entry.id !== input?.id) }
  }

  return async function handlePromptHistory(req, res, url) {
    const path = url.pathname
    const action = path.slice(endpoint.length + 1)
    if (path !== endpoint && !(path.startsWith(endpoint + '/') && actions.includes(action)))
      reject('Prompt history address not found.', 404)
    if (req.method === 'GET' && path === endpoint) return json(res, 200, await serialize(load))
    if (req.method !== 'POST' || path === endpoint) reject('Unsupported prompt history request.', 405)
    if (req.headers.origin !== origin) reject('This action requires a same-origin request.', 403)
    const input = await readJson(req, 64 * 1024)
    return json(
      res,
      200,
      await serialize(async () => {
        const current = await load()
        const next = await change(action, input)
        return next === current ? current : store(next)
      })
    )
  }
}

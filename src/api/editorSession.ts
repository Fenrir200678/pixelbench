import { ApiError, api, errorOf } from './client.js'
import { invalidSession, type SessionCodec, type SessionData } from '../editor/session/codec.js'
import { validateSession } from '../editor/session/validate.js'
import type { Workspace } from '../editor/session/workspace.js'

const endpoint = '/api/editor-session'
const match = (revision: string) => ({ 'If-Match': `"${revision}"` })
const assetId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/

export type SessionSummary = {
  revision: string
  savedAt: string | null
  damaged: boolean
  assets: string[]
  bytesUsed: number
  limitMB: number
}
type Snapshot = {
  version: number
  revision: string
  savedAt: string | null
  assets: Record<string, number>
  workspace: SessionData
}

async function request(path: string, options: RequestInit) {
  const response = await fetch(path, options)
  if (!response.ok) throw new ApiError(await errorOf(response), response.status)
  return response
}

export const sessionSummary = () => api<SessionSummary>(endpoint + '?summary')
export const setSessionLimit = (limitMB: number) => api<SessionSummary>(endpoint + '/limit', { limitMB })

export async function deleteSessions(revision: string) {
  const response = await request(endpoint, { method: 'DELETE', headers: match(revision) })
  return (await response.json()) as SessionSummary
}

export async function saveSession(codec: SessionCodec, current: Workspace, previous: SessionSummary) {
  const { assets, data } = codec.encode(current)
  validateSession(data)
  const known = new Set(previous.assets)
  const revision = match(previous.revision)
  const start = await request(endpoint + '/begin', { method: 'POST', headers: revision })
  const { upload } = (await start.json()) as { upload: string }
  const headers = { ...revision, 'X-Session-Upload': upload }
  try {
    for (const [id, asset] of assets) {
      if (!known.has(id)) {
        await request(`${endpoint}/assets/${id}`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/octet-stream' },
          body: asset.body()
        })
      }
    }
    const response = await request(endpoint, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: 1,
        workspace: data,
        assets: Object.fromEntries([...assets].map(([id, { size }]) => [id, size]))
      })
    })
    return (await response.json()) as SessionSummary
  } catch (error) {
    await fetch(endpoint + '/abort', { method: 'POST', headers, signal: AbortSignal.timeout(3000) }).catch(() => {})
    throw error
  }
}

export async function loadSession(codec: SessionCodec) {
  const snapshot = await api<Snapshot>(endpoint)
  if (!snapshot.savedAt) return
  if (snapshot.version !== 1) throw invalidSession()
  validateSession(snapshot.workspace)
  const headers = match(snapshot.revision)
  const workspace = await codec.decode(snapshot.workspace, async (id, expected) => {
    const size = snapshot.assets[id]
    if (!assetId.test(id) || !Number.isSafeInteger(size) || size < 0 || (expected !== undefined && size !== expected))
      throw invalidSession()
    const response = await request(`${endpoint}/assets/${id}`, { headers })
    const data = await response.arrayBuffer()
    if (data.byteLength !== size) throw invalidSession()
    return data
  })
  const summary = await sessionSummary()
  if (summary.revision !== snapshot.revision) throw new ApiError('The saved editor session changed.', 412)
  return { summary, workspace }
}

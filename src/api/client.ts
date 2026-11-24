import { pause } from '../helpers/async.js'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(
    path,
    data === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        }
  )
  if (!response.ok) throw new ApiError(await errorOf(response), response.status)
  return response.json() as Promise<T>
}

export async function errorOf(response: Response) {
  try {
    return (await response.json()).error || response.statusText || 'Die lokale Brücke antwortet nicht.'
  } catch {
    return response.statusText || 'Die lokale Brücke antwortet nicht.'
  }
}

/** Waits until the Pixelbench server answers with an instance other than the given one. False after the timeout. */
export async function waitForRestart(instance: string, timeout: number) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    await pause(500)
    try {
      const response = await fetch('/api/server', { signal: AbortSignal.timeout(2000) })
      if (response.ok && (await response.json()).instance !== instance) return true
    } catch {
      /* The server is restarting. */
    }
  }
  return false
}

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

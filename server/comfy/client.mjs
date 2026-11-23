export async function request(backend, path, { timeout = 5000, signal, headers, ...options } = {}) {
  const response = await fetch(backend.address + path, {
    ...options,
    redirect: 'error',
    headers: { ...headers, ...(backend.token ? { 'X-Pixelbench': backend.token } : {}) },
    signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)].filter(Boolean))
  })
  if (!response.ok) {
    const raw = (await response.text()).slice(0, 2500)
    const error = new Error('ComfyUI (' + response.status + ') ' + raw)
    error.http = response.status
    throw error
  }
  return response
}

export function post(backend, path, data, timeout) {
  return request(backend, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    timeout
  })
}

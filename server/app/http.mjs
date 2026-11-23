export function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

export function reject(message, status = 400) {
  throw Object.assign(new Error(message), { status })
}

export function sendRaw(res, png) {
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': png.data.length,
    'X-Image-Width': png.width,
    'X-Image-Height': png.height
  })
  return res.end(png.data)
}

// Validators throw plain errors. Report them as bad input instead of a server fault.
export async function badInput(validate) {
  try {
    return await validate()
  } catch (error) {
    throw error.status ? error : Object.assign(error, { status: 400 })
  }
}

export async function readBody(req, limit) {
  if (Number(req.headers['content-length']) > limit) reject('Request too large.', 413)
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > limit) reject('Request too large.', 413)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, total)
}

export async function readJson(req, limit = 96 * 1024 * 1024) {
  if (!req.headers['content-type']?.startsWith('application/json')) reject('Expected JSON.', 415)
  const body = await readBody(req, limit)
  try {
    return JSON.parse(body)
  } catch {
    reject('Invalid JSON.')
  }
}

export function notFound(res) {
  return json(res, 404, { error: 'Address not found.' })
}

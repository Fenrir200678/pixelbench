import assert from 'node:assert/strict'
import { setTimeout as pause } from 'node:timers/promises'
import { encode, decode } from '../server/png.mjs'

const origin = process.env.PIXELBENCH_URL ?? 'http://127.0.0.1:3720'
async function api(path, body, post = body !== undefined) {
  const response = await fetch(
    origin + path,
    post
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body ?? {})
        }
      : {}
  )
  if (!response.ok) throw new Error(path + ': ' + (await response.text()))
  return response.json()
}
const scene = (width, height, mask = false) => {
  const bytes = Buffer.alloc(width * height * 4, 255)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const circle = Math.hypot(x - width * 0.48, y - height * 0.46) < height * 0.17
      const col = mask
        ? Array(3).fill(circle ? 255 : 0)
        : circle
          ? [230, 109, 32]
          : y > height * 0.69
            ? [140, 157, 99]
            : x > width * 0.77
              ? [127, 155, 180]
              : [166, 190, 212]
      bytes.set(col, i)
    }
  }
  return encode(width, height, bytes).toString('base64')
}

let status
for (let i = 0; i < 100; i++) {
  status = await api('/api/status')
  if (status.state !== 'starting') break
  await pause(1000)
}
assert.equal(status.state, 'ready', status.message)
console.log(status.version, status.device)
console.log(status.profiles.map((profile) => profile.id + ' ' + profile.available).join('\n'))
const { session } = await api('/api/session', {})
const sessionPath = '/api/session/' + session
try {
  const tests = [
    [
      'qwen21-turbo',
      'edit',
      821395,
      false,
      'Change the orange circle to a bright blue circle, preserve the composition.'
    ],
    [
      'qwen21-turbo',
      'edit',
      821396,
      true,
      'Change the orange circle to a bright blue circle, matching the reference palette.'
    ],
    [
      'qwen21-turbo',
      'edit',
      821395,
      false,
      'Change the orange circle to a bright blue circle, preserve the composition.'
    ],
    [
      'sdxl-inpaint',
      'inpaint',
      918001,
      false,
      'a round green ceramic plate on a simple pale blue and olive background'
    ],
    ['sdxl-inpaint', 'outpaint', 918002, false, 'a simple minimalist light blue sky above rolling green fields']
  ]
  let first
  for (const [profile, tool, seed, hasReference, prompt] of tests) {
    const w = tool === 'outpaint' ? 640 : 512
    const h = 512
    const image = scene(w, h)
    const parameters = tool === 'edit' ? {} : { steps: 20 }
    let mask = tool === 'edit' ? undefined : scene(w, h, true)
    if (tool === 'outpaint') {
      const bytes = Buffer.from(scene(w, h, true), 'base64')
      const decoded = decode(bytes)
      for (let i = 0; i < w * h; i++) {
        const v = i % w >= 512 ? 255 : 0
        decoded.data.fill(v, i * 4, i * 4 + 3)
      }
      mask = encode(w, h, decoded.data).toString('base64')
    }
    let job = await api(sessionPath + '/jobs', {
      profile,
      tool,
      seed,
      size: [w, h],
      prompt,
      image,
      mask,
      reference: hasReference ? scene(288, 288) : undefined,
      parameters
    })
    const path = sessionPath + '/jobs/' + job.id
    console.log('Job', profile, tool, seed, job.id)
    let last = ''
    while (!['complete', 'error', 'cancelled'].includes(job.stage)) {
      await pause(750)
      job = await api(path)
      if (job.message !== last) console.log((last = job.message))
    }
    if (job.stage !== 'complete') throw new Error(job.message)
    const response = await fetch(origin + path + '/image')
    assert.equal(response.status, 200)
    const result = Buffer.from(await response.arrayBuffer())
    const png = decode(result)
    assert.equal(png.width, w)
    assert.equal(png.height, h)
    const original = decode(Buffer.from(image, 'base64'))
    assert.notDeepEqual(png.data, original.data)
    if (!first) first = png.data
    else if (seed === 821395) {
      const changed = png.data.reduce((count, value, i) => count + (value !== first[i] ? 1 : 0), 0)
      console.log('Replay: different RGBA bytes', changed, '/', png.data.length)
    }
    console.log('OK', job.parameters, job.models)
    await api(path + '/release', {})
  }
} finally {
  await api(sessionPath + '/close', {})
}

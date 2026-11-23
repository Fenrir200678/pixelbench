import { Worker } from 'node:worker_threads'
import { PNG } from 'pngjs'

export const maxPixels = 24_000_000
export const maxEdge = 8192
export const validSize = (width, height) =>
  [width, height].every((n) => Number.isInteger(n) && n > 0 && n <= maxEdge) && width * height <= maxPixels

function checkDecode(bytes) {
  if (
    bytes.length < 33 ||
    bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  )
    throw new Error('Invalid PNG.')
  if (bytes[24] > 8) throw new Error('This PNG has 16 bits per channel. Open an 8-bit PNG instead.')
  if (!validSize(bytes.readUInt32BE(16), bytes.readUInt32BE(20)))
    throw new Error('The image exceeds 8192 px per side or 24 MP.')
}

function checkEncode(width, height, bytes) {
  if (!validSize(width, height) || width * height * 4 !== bytes.length)
    throw new Error('Invalid PNG export dimensions.')
}

export function decode(bytes) {
  checkDecode(bytes)
  return PNG.sync.read(bytes)
}

export function encode(width, height, bytes) {
  checkEncode(width, height, bytes)
  return PNG.sync.write({ width, height, data: bytes }, { colorType: 6, inputColorType: 6, deflateLevel: 3 })
}

// One lazily started worker thread. The synchronous functions above stay available for scripts.
let worker
let nextId = 0
const pending = new Map()

function codec() {
  if (worker) return worker
  const thread = (worker = new Worker(new URL('./png-worker.mjs', import.meta.url)))
  thread.on('message', ({ id, error, ...result }) => {
    const call = pending.get(id)
    pending.delete(id)
    if (!call) return
    if (error) call.reject(new Error(error))
    else call.resolve(result)
  })
  const fail = (error) => {
    if (worker === thread) worker = undefined
    for (const call of pending.values()) call.reject(error)
    pending.clear()
  }
  thread.on('error', fail)
  thread.on('exit', () => fail(new Error('PNG processing exited unexpectedly.')))
  // Unref after the listeners are attached, because a message listener refs the thread again.
  thread.unref()
  return thread
}

function run(message) {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    codec().postMessage({ id, ...message })
  })
}

export async function decodeAsync(bytes) {
  checkDecode(bytes)
  const { width, height, data } = await run({ op: 'decode', bytes })
  return { width, height, data: Buffer.from(data.buffer, data.byteOffset, data.byteLength) }
}

export async function encodeAsync(width, height, bytes) {
  checkEncode(width, height, bytes)
  const { data } = await run({ op: 'encode', width, height, bytes })
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
}

import { createReadStream } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { reject } from './http.mjs'

// YOLO detectors for the detailer: ONNX files in .runtime/models/yolo. The browser runs them with ONNX Runtime Web.
// An optional <name>.json next to a model lists its class names as { "labels": [...] }.
const modelName = /^\w[\w.-]{0,79}$/
const folderOf = (runtime) => join(runtime, 'models', 'yolo')

async function labelsOf(folder, name) {
  try {
    const { labels } = JSON.parse(await readFile(join(folder, name + '.json'), 'utf8'))
    const valid =
      Array.isArray(labels) &&
      labels.length <= 1000 &&
      labels.every((label) => typeof label === 'string' && label.length <= 60)
    return valid ? labels : []
  } catch {
    return []
  }
}

/** The YOLO models with their class names, sorted by name. */
export async function yoloModels(runtime) {
  const folder = folderOf(runtime)
  const names = (await readdir(folder).catch(() => []))
    .filter((file) => file.toLowerCase().endsWith('.onnx'))
    .map((file) => file.slice(0, -5))
    .filter((name) => modelName.test(name))
    .sort()
  return Promise.all(names.map(async (name) => ({ name, labels: await labelsOf(folder, name) })))
}

export async function sendYoloModel(res, runtime, name) {
  if (!modelName.test(name)) reject('Invalid model name.')
  const path = join(folderOf(runtime), name + '.onnx')
  const { size } = await stat(path)
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': size })
  await pipeline(createReadStream(path), res)
}

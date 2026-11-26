import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ui } from './ui.mjs'

// Small models that Pixelbench runs itself, outside ComfyUI, such as the detailer's YOLO face detector.
// They live in .runtime/models, each pinned by URL and SHA-256 in the manifest.

async function sha256(path) {
  const hash = createHash('sha256')
  try {
    for await (const chunk of createReadStream(path)) hash.update(chunk)
  } catch {
    return undefined
  }
  return hash.digest('hex')
}

/** True when the model file exists with the pinned checksum. */
export async function modelPresent(runtime, model) {
  return (await sha256(join(runtime, 'models', model.file))) === model.sha256
}

async function download(model, target) {
  const response = await fetch(model.url)
  if (!response.ok) throw new Error('HTTP ' + response.status)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (createHash('sha256').update(bytes).digest('hex') !== model.sha256) throw new Error('checksum mismatch')
  const partial = target + '.download'
  await writeFile(partial, bytes)
  await rename(partial, target)
}

/** Downloads missing or changed models. A failed download only warns: the feature that needs it stays off. */
export async function installModels(runtime, models) {
  for (const model of models) {
    const target = join(runtime, 'models', model.file)
    try {
      await mkdir(dirname(target), { recursive: true })
      if (!(await modelPresent(runtime, model))) {
        ui.info('Downloading ' + model.file + ' (' + Math.round(model.size / 1e6) + ' MB) …')
        await download(model, target)
      }
      // The class names next to the model, as <name>.json.
      if (model.labels)
        await writeFile(target.replace(/\.onnx$/i, '.json'), JSON.stringify({ labels: model.labels }, null, 2))
      ui.ok(model.file)
    } catch (error) {
      await rm(target + '.download', { force: true })
      ui.warn('Could not download ' + model.file + ': ' + error.message + '. ' + model.purpose + ' stays unavailable.')
    }
  }
}

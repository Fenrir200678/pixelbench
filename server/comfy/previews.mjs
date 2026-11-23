import { readFile, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'

export async function collectPreview(worker, output) {
  if (
    !output ||
    output.type !== 'temp' ||
    output.subfolder ||
    !/^ComfyUI_temp_[a-z]+_\d+_\.png$/.test(output.filename)
  ) {
    throw new Error('ComfyUI did not return the expected temporary preview.')
  }
  return readFile(join(worker.dir, 'temp', output.filename))
}

export async function previewNames(worker) {
  const dir = join(worker.dir, 'temp')
  const files = await readdir(dir, { withFileTypes: true })
  return files
    .filter((file) => file.isFile() && /^ComfyUI_temp_[a-z]+_\d+_\.png$/.test(file.name))
    .map((file) => file.name)
}

export async function clearPreviews(worker, existing) {
  const names = await previewNames(worker)
  await Promise.all(names.filter((name) => !existing.has(name)).map((name) => unlink(join(worker.dir, 'temp', name))))
}

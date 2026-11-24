import { createHash } from 'node:crypto'
import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tar } from '../../scripts/setup/nodes.mjs'
import { capture } from '../../scripts/setup/run.mjs'
import { readManifest } from '../../scripts/update/apply.mjs'

const maxSize = 512 * 1024 * 1024
export const stagedFolder = (runtime) => join(runtime, 'update', 'staged', 'pixelbench')

/** Removes what an earlier download or update left behind. The backup stays until the next update. */
export async function clearStaging(runtime) {
  await rm(join(runtime, 'update', 'staged'), { recursive: true, force: true })
  await rm(join(runtime, 'update', 'download'), { recursive: true, force: true })
}

/** Downloads a release zip, checks its SHA-256 and unpacks it to the staging folder. */
export async function stageRelease(runtime, release) {
  await clearStaging(runtime)
  const downloads = join(runtime, 'update', 'download')
  const staged = join(runtime, 'update', 'staged')
  await mkdir(downloads, { recursive: true })
  await mkdir(staged, { recursive: true })
  try {
    const response = await fetch(release.download.url, { signal: AbortSignal.timeout(10 * 60_000) })
    if (!response.ok) throw new Error('Download failed: HTTP ' + response.status)
    if (Number(response.headers.get('content-length')) > maxSize) throw new Error('The download is too large.')
    const data = Buffer.from(await response.arrayBuffer())
    const sha256 = createHash('sha256').update(data).digest('hex')
    if (sha256 !== release.download.sha256) throw new Error('The download is damaged: its checksum does not match.')
    const archive = join(downloads, 'pixelbench.zip')
    await writeFile(archive, data)
    const unpacked = await capture(tar, ['-xf', archive, '-C', staged])
    if (unpacked.code !== 0) throw new Error('Could not unpack the update: ' + unpacked.stderr.trim())
    const manifest = await readManifest(stagedFolder(runtime))
    if (manifest?.version !== release.version)
      throw new Error('The download does not contain version ' + release.version + '.')
    await access(join(stagedFolder(runtime), 'scripts', 'update.mjs'))
  } catch (error) {
    await clearStaging(runtime)
    throw error
  } finally {
    await rm(downloads, { recursive: true, force: true })
  }
}

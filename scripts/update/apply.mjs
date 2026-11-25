import { chmod, copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize } from 'node:path'

// release.json lists every file a release ships. Files outside that list, such as own profiles, stay untouched.
export const manifestName = 'release.json'
// Never replaced or removed, whatever a manifest says.
const protectedRoots = ['.git', '.runtime', '.settings.json', 'node_modules']

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false
  )

/** Checks one manifest entry: a relative path inside the folder that is not one of the protected entries. */
export function safePath(path) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || /^[a-z]:/i.test(path)) return false
  const parts = normalize(path).split(/[\\/]/)
  if (parts.includes('..') || parts.includes('')) return false
  return !protectedRoots.includes(parts[0].toLowerCase()) && parts[0] !== manifestName
}

export async function readManifest(folder) {
  const text = await readFile(join(folder, manifestName), 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })
  if (text === undefined) return undefined
  const manifest = JSON.parse(text)
  if (typeof manifest?.version !== 'string' || !Array.isArray(manifest.files))
    throw new Error('Invalid ' + manifestName + ' in ' + folder)
  const unsafe = manifest.files.find((path) => !safePath(path))
  if (unsafe !== undefined) throw new Error('Unsafe path in ' + manifestName + ': ' + unsafe)
  return manifest
}

async function copy(from, to) {
  await mkdir(dirname(to), { recursive: true })
  await copyFile(from, to)
  // The release zip is built on Windows and carries no Unix modes. Finder only starts executable .command files.
  if (process.platform !== 'win32' && to.endsWith('.command')) await chmod(to, 0o755)
}

/** Puts the folder back as the backup recorded it. */
async function restore(target, backup, journal) {
  for (const path of journal.created) await rm(join(target, path), { force: true })
  for (const path of journal.saved) await copy(join(backup, 'files', path), join(target, path))
}

/**
 * Replaces the files of the release in target with those in source. Every file that is overwritten or
 * removed is saved to backup first. runSetup brings packages and custom nodes in line with the new files.
 * When a step fails, the old files come back, runSetup runs again for them and the error is rethrown.
 */
export async function applyRelease({ source, target, backup, runSetup }) {
  const next = await readManifest(source)
  if (!next) throw new Error('The update has no ' + manifestName + '.')
  // Installs from before the updater have no manifest. Then nothing is removed, only overwritten.
  const previous = await readManifest(target)
  const incoming = new Set(next.files.map(normalize))
  const removed = (previous?.files ?? []).map(normalize).filter((path) => !incoming.has(path))
  const journal = { saved: [], created: [] }

  await rm(backup, { recursive: true, force: true })
  await mkdir(join(backup, 'files'), { recursive: true })
  for (const path of [manifestName, ...incoming, ...removed]) {
    if (await exists(join(target, path))) {
      await copy(join(target, path), join(backup, 'files', path))
      journal.saved.push(path)
    } else if (path === manifestName || incoming.has(path)) journal.created.push(path)
  }
  await writeFile(join(backup, 'journal.json'), JSON.stringify(journal, null, 2))

  try {
    for (const path of incoming) await copy(join(source, path), join(target, path))
    for (const path of removed) await rm(join(target, path), { force: true })
    await copy(join(source, manifestName), join(target, manifestName))
    await runSetup()
  } catch (error) {
    await restore(target, backup, journal)
    await runSetup().catch(() => {})
    throw error
  }
  return { from: previous?.version, to: next.version }
}

import { readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defaults, validateConfig } from '../../server/comfy/config.mjs'
import { extraModelRoots, findInstalls, installAt } from './comfy.mjs'
import { ask, choose, ui } from './ui.mjs'

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false
  )

export async function readSettings(file) {
  const text = await readFile(file, 'utf8').catch(() => undefined)
  if (text === undefined) return undefined
  try {
    return validateConfig(JSON.parse(text))
  } catch (error) {
    ui.warn('Existing settings are invalid: ' + error.message)
    return undefined
  }
}

/** Saves next to the old file first, like the bridge does, so a crash never leaves half a file. */
export async function writeSettings(file, config) {
  await writeFile(file + '.next', JSON.stringify(config, null, 2))
  await rename(file + '.next', file)
}

/** True when the configured source folder and Python still exist. */
export async function usable(config) {
  return (await exists(join(config.source, 'main.py'))) && (await exists(config.python))
}

async function askForFolder() {
  for (;;) {
    const answer = (await ask('Path to your ComfyUI folder (empty to cancel):')).replace(/^"|"$/g, '')
    if (!answer) return undefined
    const install = await installAt(answer)
    if (install?.python) return install
    ui.warn(install ? 'Found ComfyUI, but no Python environment next to it.' : 'No ComfyUI found in ' + answer)
  }
}

/** Finds ComfyUI, or asks for it. A path given with --comfy wins over the search. */
export async function pickInstall(given) {
  if (given) {
    const install = await installAt(given)
    if (!install) throw new Error('No ComfyUI found in ' + given)
    if (!install.python)
      throw new Error('Found ComfyUI in ' + install.source + ', but no Python environment next to it.')
    return install
  }
  ui.info('Searching for ComfyUI …')
  const found = (await findInstalls()).filter((install) => install.python)
  if (found.length === 1) {
    ui.ok('Found ' + found[0].kind + ' · ' + found[0].source)
    return found[0]
  }
  if (found.length === 0) {
    ui.warn('No ComfyUI install found automatically.')
    return askForFolder()
  }
  const picked = await choose('Which ComfyUI should Pixelbench use?', found, (i) => i.kind + ' · ' + i.source)
  return picked ?? askForFolder()
}

/** Builds settings for an install. Other choices from an earlier configuration are kept. */
export async function settingsFor(install, previous) {
  const roots = []
  const found = [...(previous?.roots ?? []), ...install.roots, ...(await extraModelRoots(install.source))]
  for (const root of found) {
    if (await exists(root)) roots.push(root)
  }
  return validateConfig({
    ...defaults,
    ...previous,
    mode: 'managed',
    source: install.source,
    python: install.python,
    roots
  })
}

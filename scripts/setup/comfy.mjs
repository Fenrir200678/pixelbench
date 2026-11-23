import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { capture } from './run.mjs'

const { join, dirname, normalize } = win32
const probeScript = fileURLToPath(new URL('./probe.py', import.meta.url))
const modelFolders = ['diffusion_models', 'unet', 'checkpoints', 'loras', 'Lora', 'vae', 'text_encoders', 'clip']

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false
  )
const readJson = (path) => readFile(path, 'utf8').then(JSON.parse, () => undefined)
const childDirs = (path) =>
  readdir(path, { withFileTypes: true }).then(
    (entries) => entries.filter((entry) => entry.isDirectory()).map((entry) => join(path, entry.name)),
    () => []
  )

/** Python programs that typically belong to a ComfyUI source folder, in order of preference. */
function pythonCandidates(source) {
  const parent = dirname(source)
  return [
    join(source, '.venv', 'Scripts', 'python.exe'),
    join(source, 'venv', 'Scripts', 'python.exe'),
    join(parent, 'python_embeded', 'python.exe'),
    join(parent, '.venv', 'Scripts', 'python.exe'),
    join(parent, 'venv', 'Scripts', 'python.exe')
  ]
}

/** Finds a ComfyUI install in a folder: the source folder itself, or a portable or Desktop root above it. */
export async function installAt(folder, kind = 'Folder', roots = []) {
  folder = normalize(folder)
  if (await exists(join(folder, 'ComfyUI', 'main.py'))) return installAt(join(folder, 'ComfyUI'), kind, roots)
  if (!(await exists(join(folder, 'main.py')))) return undefined
  for (const python of pythonCandidates(folder)) {
    if (await exists(python)) return { kind, source: folder, python, roots }
  }
  return { kind, source: folder, python: undefined, roots }
}

/** Installs registered by the current Comfy Desktop app, with its shared model folders. */
async function comfyDesktop(env) {
  const base = join(env.APPDATA ?? '', 'Comfy Desktop')
  const installs = (await readJson(join(base, 'installations.json'))) ?? []
  const settings = (await readJson(join(base, 'settings.json'))) ?? {}
  const roots = Array.isArray(settings.modelsDirs) ? settings.modelsDirs : []
  const found = []
  for (const entry of Array.isArray(installs) ? installs : []) {
    if (typeof entry?.installPath !== 'string' || entry.status === 'deleted') continue
    const install = await installAt(entry.installPath, 'Comfy Desktop · ' + (entry.name ?? 'ComfyUI'), roots)
    if (install) found.push(install)
  }
  return found
}

/** The first ComfyUI Desktop generation keeps its source in the app and the venv in a base folder. */
async function legacyDesktop(env) {
  const config = await readJson(join(env.APPDATA ?? '', 'ComfyUI', 'config.json'))
  if (typeof config?.basePath !== 'string') return []
  const programs = join(env.LOCALAPPDATA ?? '', 'Programs')
  for (const app of ['@comfyorgcomfyui-electron', 'ComfyUI']) {
    const source = join(programs, app, 'resources', 'ComfyUI')
    const python = join(config.basePath, '.venv', 'Scripts', 'python.exe')
    if ((await exists(join(source, 'main.py'))) && (await exists(python)))
      return [{ kind: 'ComfyUI Desktop', source, python, roots: [join(config.basePath, 'models')] }]
  }
  return []
}

/** Portable and manual installs in the usual places: user folders and drive roots, two levels deep. */
async function commonFolders(env) {
  const home = env.USERPROFILE ?? homedir()
  const drives = []
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (await exists(letter + ':\\')) drives.push(letter + ':\\')
  }
  const places = [home, join(home, 'Desktop'), join(home, 'Downloads'), join(home, 'Documents'), ...drives]
  const found = []
  for (const place of places) {
    const folders = (await childDirs(place)).filter((path) => /comfy/i.test(win32.basename(path)))
    for (const folder of folders) {
      for (const candidate of [folder, ...(await childDirs(folder))]) {
        const install = await installAt(candidate, 'Folder')
        if (install) found.push(install)
      }
    }
  }
  return found
}

/** All ComfyUI installs found on this computer, without duplicates. */
export async function findInstalls(env = process.env) {
  const all = [...(await comfyDesktop(env)), ...(await legacyDesktop(env)), ...(await commonFolders(env))]
  const seen = new Set()
  return all.filter((install) => {
    const key = install.source.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Model root folders that ComfyUI's own extra_model_paths.yaml points to. */
export async function extraModelRoots(source) {
  const text = await readFile(join(source, 'extra_model_paths.yaml'), 'utf8').catch(() => '')
  const roots = []
  for (const match of text.matchAll(/^\s*base_path:\s*['"]?([^'"#\r\n]+?)['"]?\s*(?:#.*)?$/gm)) {
    const base = match[1].trim()
    if (!/^[a-z]:[\\/]/i.test(base)) continue
    for (const root of [base, join(base, 'models')]) {
      const has = await Promise.all(modelFolders.map((name) => exists(join(root, name))))
      if (has.some(Boolean)) {
        roots.push(normalize(root))
        break
      }
    }
  }
  return roots
}

export async function comfyVersion(source) {
  const text = await readFile(join(source, 'comfyui_version.py'), 'utf8').catch(() => '')
  return text.match(/__version__\s*=\s*["']([^"']+)["']/)?.[1]
}

/** Compares dotted version numbers. Returns a negative number when a is older than b. */
export function compareVersions(a, b) {
  const left = a.split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0)
  const right = b.split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0)
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference) return difference
  }
  return 0
}

/** Starts the install's Python once and reports its version, torch, CUDA and missing packages. */
export async function probePython(python, extraPackages, requirements) {
  const result = await capture(python, ['-I', '-B', probeScript, extraPackages, JSON.stringify(requirements)])
  const line = result.stdout.trim().split(/\r?\n/).pop()
  try {
    return JSON.parse(line)
  } catch {
    throw new Error(
      'Python did not start: ' + (result.stderr.trim().split(/\r?\n/).pop() || 'exit code ' + result.code)
    )
  }
}

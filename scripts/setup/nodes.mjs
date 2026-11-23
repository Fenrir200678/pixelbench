import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { capture, show } from './run.mjs'
import { ui } from './ui.mjs'

const marker = '.pixelbench-node.json'
// Windows ships bsdtar, which reads .tar.gz. Git for Windows puts a GNU tar first on PATH that mangles C:\ paths.
const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false
  )

/** Everything that identifies a downloaded node: its commit and those of its submodules. */
export const pin = (node) => [node.commit, ...(node.submodules ?? []).map((sub) => sub.commit)].join('+')

/** Reads the commit a git checkout is on without needing git itself. */
export async function gitHead(folder) {
  const gitDir = join(folder, '.git')
  const head = (await readFile(join(gitDir, 'HEAD'), 'utf8').catch(() => '')).trim()
  if (!head.startsWith('ref: ')) return head || undefined
  const ref = head.slice(5)
  const loose = (await readFile(join(gitDir, ref), 'utf8').catch(() => '')).trim()
  if (loose) return loose
  const packed = await readFile(join(gitDir, 'packed-refs'), 'utf8').catch(() => '')
  return packed
    .split(/\r?\n/)
    .find((line) => line.endsWith(' ' + ref))
    ?.split(' ')[0]
}

/**
 * Works out what to do with one manifest entry: 'ok' when the pinned commit is present,
 * 'git' for a developer checkout on another commit (left alone), 'install' otherwise.
 */
export async function nodeState(customNodes, node) {
  const path = join(customNodes, node.folder)
  if (await exists(path)) {
    const installed = JSON.parse(await readFile(join(path, marker), 'utf8').catch(() => 'null'))
    if (installed?.pin === pin(node)) return { action: 'ok', path }
    const head = await gitHead(path)
    if (head === node.commit) return { action: 'ok', path }
    if (head) return { action: 'git', path, head }
    return { action: 'install', path }
  }
  return { action: 'install', path }
}

/** Downloads one GitHub repository at a commit and unpacks it into a folder. */
async function unpack(repo, commit, archive, into) {
  const response = await fetch('https://codeload.github.com/' + repo + '/tar.gz/' + commit)
  if (!response.ok) throw new Error('Download failed for ' + repo + ': HTTP ' + response.status)
  await writeFile(archive, Buffer.from(await response.arrayBuffer()))
  await mkdir(into, { recursive: true })
  const unpacked = await capture(tar, ['-xzf', archive, '-C', into, '--strip-components=1'])
  if (unpacked.code !== 0) throw new Error('Could not unpack ' + repo + ': ' + unpacked.stderr.trim())
}

/** Downloads the pinned commit and swaps it in place of the old folder only once it is complete. */
async function installNode(runtime, node, target) {
  const work = join(runtime, '.download', randomUUID())
  const staging = join(work, 'node')
  await mkdir(work, { recursive: true })
  try {
    await unpack(node.repo, node.commit, join(work, 'node.tar.gz'), staging)
    // GitHub archives leave git submodules empty, so each one is fetched on its own.
    for (const sub of node.submodules ?? []) {
      await rm(join(staging, sub.path), { recursive: true, force: true })
      await unpack(sub.repo, sub.commit, join(work, 'sub.tar.gz'), join(staging, sub.path))
    }
    await writeFile(join(staging, marker), JSON.stringify({ repo: node.repo, pin: pin(node) }, null, 2))
    const old = join(work, 'old')
    if (await exists(target)) await rename(target, old)
    await rename(staging, target)
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/** Brings every custom node from the manifest to its pinned commit. Returns the requirements they need. */
export async function installNodes(runtime, nodes) {
  const customNodes = join(runtime, 'custom_nodes')
  await mkdir(customNodes, { recursive: true })
  const requirements = []
  for (const node of nodes) {
    const state = await nodeState(customNodes, node)
    if (state.action === 'git') {
      ui.warn(
        node.folder + ' is a git checkout on ' + state.head.slice(0, 7) + ', pinned is ' + node.commit.slice(0, 7)
      )
      ui.info('Left unchanged. Pixelbench is tested with the pinned commit.')
    } else if (state.action === 'ok') {
      ui.ok(node.folder + ' · ' + node.purpose)
    } else {
      ui.info('Downloading ' + node.repo + ' @ ' + node.commit.slice(0, 7) + ' …')
      await installNode(runtime, node, state.path)
      ui.ok(node.folder + ' installed · ' + node.purpose)
    }
    requirements.push(...node.requirements)
  }
  return [...new Set(requirements)]
}

/**
 * Installs Python packages into Pixelbench's own folder. The ComfyUI environment stays untouched,
 * and the bridge appends this folder behind ComfyUI's own packages, so ComfyUI's versions win.
 */
export async function installPackages(python, target, packages) {
  await mkdir(target, { recursive: true })
  await show(python, [
    '-m',
    'pip',
    'install',
    '--disable-pip-version-check',
    '--target',
    target,
    '--upgrade',
    ...packages
  ])
}

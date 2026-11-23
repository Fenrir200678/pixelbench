import { createHash } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gitHead } from './nodes.mjs'
import { show } from './run.mjs'
import { ui } from './ui.mjs'

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false
  )

// One command string with shell: true runs npm.cmd on Windows without Node's warning about shell arguments.
const npm = (command, root) => show('npm ' + command, [], { cwd: root, shell: true })

/**
 * Installs the app's npm packages and builds the editor when needed. A release folder ships a built dist/,
 * so it only needs the runtime packages. A git checkout gets all packages and a fresh build per commit.
 */
export async function prepareApp(root, runtime, { rebuild = false } = {}) {
  const stateFile = join(runtime, 'install.json')
  const state = JSON.parse(await readFile(stateFile, 'utf8').catch(() => '{}'))
  const checkout = await exists(join(root, '.git'))
  const lock = createHash('sha256')
    .update(await readFile(join(root, 'package-lock.json')))
    .digest('hex')
  const packages = checkout ? 'all' : 'runtime'

  if (!(await exists(join(root, 'node_modules'))) || state.lock !== lock || state.packages !== packages) {
    ui.info('Installing npm packages …')
    await npm(checkout ? 'ci --no-audit --no-fund' : 'ci --omit=dev --no-audit --no-fund', root)
    state.lock = lock
    state.packages = packages
    await writeFile(stateFile, JSON.stringify(state, null, 2))
  }
  ui.ok('npm packages')

  const built = await exists(join(root, 'dist', 'index.html'))
  if (!checkout) {
    if (!built) throw new Error('This folder has no built editor in dist/. Download a release or clone the repository.')
    ui.ok('Editor build')
    return
  }
  const commit = await gitHead(root)
  if (!built || rebuild || state.build !== commit) {
    ui.info('Building the editor …')
    await npm('run build', root)
    state.build = commit
    await writeFile(stateFile, JSON.stringify(state, null, 2))
  }
  ui.ok('Editor build')
}

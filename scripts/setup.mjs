// Sets up Pixelbench next to an existing ComfyUI: finds ComfyUI, checks its Python, installs the custom nodes and
// Python packages Pixelbench needs into its own folder, prepares the editor and writes the settings.
// Run again at any time to repair or update. Uses only Node's built-in modules, since npm packages come later.
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { prepareApp } from './setup/app.mjs'
import { comfyVersion, compareVersions, probePython } from './setup/comfy.mjs'
import { installNodes, installPackages, nodeState } from './setup/nodes.mjs'
import { pickInstall, readSettings, settingsFor, usable, writeSettings } from './setup/settings.mjs'
import { setAssumeYes, ui } from './setup/ui.mjs'

const usage = `Usage: node scripts/setup.mjs [options]

  --comfy <folder>  Use this ComfyUI folder instead of searching
  --reconfigure     Search for ComfyUI again even if settings exist
  --check           Only check, change nothing
  --rebuild         Build the editor even if it looks current
  --yes             Accept the first choice for every question
  --help            Show this help`

const root = fileURLToPath(new URL('../', import.meta.url))
const stateDirectory = process.env.PIXELBENCH_STATE
const state = stateDirectory ? resolve(stateDirectory) : root
const runtime = join(state, '.runtime')
const settingsFile = join(state, '.settings.json')
const manifest = JSON.parse(await readFile(new URL('./setup/manifest.json', import.meta.url), 'utf8'))

let options
try {
  options = parseArgs({
    options: {
      comfy: { type: 'string' },
      reconfigure: { type: 'boolean' },
      check: { type: 'boolean' },
      rebuild: { type: 'boolean' },
      yes: { type: 'boolean' },
      help: { type: 'boolean' }
    }
  }).values
} catch (error) {
  console.error(error.message + '\n\n' + usage)
  process.exit(2)
}

function checkNode() {
  ui.step('Node.js')
  const major = Number(process.versions.node.split('.')[0])
  if (major < manifest.node)
    throw new Error('Node.js ' + manifest.node + ' or newer is required, found ' + process.version)
  ui.ok('Node.js ' + process.version)
}

async function chooseComfy() {
  ui.step('ComfyUI')
  const previous = await readSettings(settingsFile)
  if (previous && !options.reconfigure && !options.comfy && (await usable(previous))) {
    ui.ok('Configured · ' + previous.source)
    return { config: previous, changed: false }
  }
  if (previous && !options.reconfigure && !options.comfy) ui.warn('The configured ComfyUI is gone: ' + previous.source)
  const install = await pickInstall(options.comfy)
  if (!install) throw new Error('Pixelbench needs an installed ComfyUI. See the README for the prerequisites.')
  return { config: await settingsFor(install, previous), changed: true }
}

async function checkPython(config, requirements) {
  ui.step('ComfyUI environment')
  const report = await probePython(config.python, join(runtime, 'python'), requirements)
  ui.ok('Python ' + report.python + ' · ' + config.python)
  if (!report.torch)
    throw new Error('PyTorch does not load in this environment: ' + (report.torchError ?? 'not installed'))
  if (report.cuda) ui.ok('PyTorch ' + report.torch + ' · ' + report.device + ' · ' + report.vram + ' GB')
  else ui.warn('PyTorch ' + report.torch + ' runs without CUDA. Generating will be very slow.')
  const version = await comfyVersion(config.source)
  if (!version) ui.warn('Unknown ComfyUI version.')
  else if (compareVersions(version, manifest.comfyui) < 0)
    ui.warn(
      'ComfyUI ' + version + ' is older than ' + manifest.comfyui + '. Some profiles may not load. Update ComfyUI.'
    )
  else ui.ok('ComfyUI ' + version)
  return report
}

async function checkNodes() {
  const customNodes = join(runtime, 'custom_nodes')
  let complete = true
  for (const node of manifest.nodes) {
    const found = await nodeState(customNodes, node)
    if (found.action === 'install') {
      complete = false
      ui.warn(node.folder + ' missing or outdated')
    } else ui.ok(node.folder)
  }
  return complete
}

async function main() {
  if (options.help) return console.log(usage)
  setAssumeYes(options.yes === true)
  console.log('Pixelbench setup' + (options.check ? ' · check only' : ''))
  checkNode()
  const { config, changed } = await chooseComfy()
  const requirements = [...new Set(manifest.nodes.flatMap((node) => node.requirements))]
  const report = await checkPython(config, requirements)

  ui.step('Custom nodes')
  if (options.check) {
    const complete = await checkNodes()
    if (report.missing.length) ui.warn('Missing Python packages: ' + report.missing.join(', '))
    if (!complete || report.missing.length || changed) throw new Error('Setup is incomplete. Run install.cmd.')
    ui.step('Everything is in place.')
    return
  }
  await installNodes(runtime, manifest.nodes)

  ui.step('Python packages')
  if (report.missing.length) {
    if (!report.pip)
      throw new Error(
        'pip is missing in the ComfyUI environment, so ' + report.missing.join(', ') + ' cannot be installed.'
      )
    ui.info('Installing ' + report.missing.join(', ') + ' into ' + join(runtime, 'python'))
    await installPackages(config.python, join(runtime, 'python'), report.missing)
  }
  ui.ok('All packages present')

  ui.step('Editor')
  await prepareApp(root, runtime, { rebuild: options.rebuild })

  if (changed) {
    await writeSettings(settingsFile, config)
    ui.step('Settings saved')
    ui.info('ComfyUI: ' + config.source)
    ui.info('Model folders: ' + (config.roots.join(', ') || 'only the models folder inside ComfyUI'))
    ui.info('Both can be changed later in Pixelbench under Settings.')
  }
  ui.step('Pixelbench is ready. Start it with Pixelbench.cmd.')
}

try {
  await main()
} catch (error) {
  ui.fail(error.message)
  process.exitCode = 1
}

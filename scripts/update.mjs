// Applies a downloaded release to a Pixelbench folder. The server's launcher runs this file from the unpacked
// release, so each release brings its own update steps. Run: node scripts/update.mjs apply --target <folder>
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { applyRelease } from './update/apply.mjs'
import { show } from './setup/run.mjs'
import { ui } from './setup/ui.mjs'

const source = fileURLToPath(new URL('../', import.meta.url))

const { positionals, values } = parseArgs({ allowPositionals: true, options: { target: { type: 'string' } } })
if (positionals[0] !== 'apply' || !values.target) {
  console.error('Usage: node scripts/update.mjs apply --target <folder>')
  process.exit(2)
}
const target = resolve(values.target)
const stateDirectory = process.env.PIXELBENCH_STATE
const updates = join(stateDirectory ? resolve(stateDirectory) : target, '.runtime', 'update')

// Ctrl+C in the shared console must not stop the update halfway. The launcher waits for this process.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(signal, () => {})

const runSetup = () => {
  ui.step('Updating packages and custom nodes')
  return show(process.execPath, [join(target, 'scripts', 'setup.mjs'), '--yes'], { cwd: target }).catch(() => {
    // The setup has already printed what went wrong.
    throw new Error('The setup step failed. The Pixelbench window shows the details.')
  })
}

console.log('\nPixelbench update · do not close this window')
const result = { at: Date.now() }
try {
  Object.assign(result, await applyRelease({ source, target, backup: join(updates, 'backup'), runSetup }), { ok: true })
  ui.step('Pixelbench ' + result.to + ' is installed.')
} catch (error) {
  Object.assign(result, { ok: false, error: error.message })
  ui.fail('The update failed and the previous version was restored: ' + error.message)
}
await mkdir(updates, { recursive: true })
await writeFile(join(updates, 'result.json'), JSON.stringify(result, null, 2))

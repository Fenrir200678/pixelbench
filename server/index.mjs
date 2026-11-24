import { fork, spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const restartExitCode = 75
// app.mjs has downloaded and unpacked an update. It is applied while no Pixelbench process runs.
const updateExitCode = 76
const root = fileURLToPath(new URL('../', import.meta.url))
const stateDirectory = process.env.PIXELBENCH_STATE
const staged = join(stateDirectory ? resolve(stateDirectory) : root, '.runtime', 'update', 'staged', 'pixelbench')
let child
let stopping = false

/** Runs the update script of the unpacked release. Its own output goes to this console. */
function applyUpdate() {
  return new Promise((done) => {
    const updater = spawn(process.execPath, [join(staged, 'scripts', 'update.mjs'), 'apply', '--target', root], {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true
    })
    updater.on('error', (error) => {
      console.error('Could not start the update: ' + error.message)
      done()
    })
    updater.on('close', done)
  })
}

function start() {
  child = fork(new URL('./app.mjs', import.meta.url), process.argv.slice(2), {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    windowsHide: true
  })
  child.on('error', (error) => {
    if (!stopping) console.error(error.message)
  })
  child.once('close', (code, signal) => {
    if (code === restartExitCode && !stopping) start()
    else if (code === updateExitCode && !stopping) void applyUpdate().then(() => (stopping ? undefined : start()))
    else process.exitCode = stopping ? 0 : (code ?? (signal ? 1 : 0))
  })
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
  process.on(signal, () => {
    if (stopping) return
    stopping = true
    if (child?.connected) child.send('shutdown')
  })
}

start()

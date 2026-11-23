import { fork } from 'node:child_process'

const restartExitCode = 75
let child
let stopping = false

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

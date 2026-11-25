// Starts Pixelbench and opens it in the default browser once the server answers.
// If Pixelbench already runs on the port, only the browser opens. --no-browser or PIXELBENCH_NO_BROWSER=1 skips it.
import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const stateDirectory = process.env.PIXELBENCH_STATE
const state = stateDirectory ? resolve(stateDirectory) : root
const port = Number(process.env.PIXELBENCH_PORT ?? 3720)
const url = 'http://127.0.0.1:' + port + '/'
const browser = !process.argv.includes('--no-browser') && !process.env.PIXELBENCH_NO_BROWSER

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false
  )

/** 'pixelbench' when Pixelbench answers on the port, 'other' for another program, 'free' for nothing. */
async function probe() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
    return (await response.text()).includes('<title>Pixelbench') ? 'pixelbench' : 'other'
  } catch {
    return 'free'
  }
}

function openBrowser() {
  if (!browser) return
  const [command, args] =
    process.platform === 'win32'
      ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
      : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]]
  spawn(command, args, { detached: true, stdio: 'ignore' })
    .on('error', () => console.log('Open ' + url + ' in your browser.'))
    .unref()
}

async function openWhenReady(server) {
  for (let attempt = 0; attempt < 120 && server.exitCode === null; attempt++) {
    if ((await probe()) === 'pixelbench') return openBrowser()
    await delay(500)
  }
}

if (!(await exists(join(state, '.settings.json'))) || !(await exists(join(root, 'dist', 'index.html')))) {
  console.error(
    'Pixelbench is not set up yet. Run ' +
      (process.platform === 'win32' ? 'install.cmd' : 'install.command') +
      ' first.'
  )
  process.exit(1)
}
const running = await probe()
if (running === 'pixelbench') {
  console.log('Pixelbench already runs at ' + url)
  openBrowser()
} else if (running === 'other') {
  console.error('Port ' + port + ' is used by another program. Set PIXELBENCH_PORT to a free port and try again.')
  process.exitCode = 1
} else {
  const server = spawn(process.execPath, [join(root, 'server', 'index.mjs')], { cwd: root, stdio: 'inherit' })
  // Ctrl+C reaches the server through the shared console. Stay alive until it has shut down cleanly.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(signal, () => {})
  server.on('close', (code) => (process.exitCode = code ?? 0))
  void openWhenReady(server)
}

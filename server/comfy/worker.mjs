import { spawn } from 'node:child_process'
import { randomUUID, randomBytes } from 'node:crypto'
import { mkdir, writeFile, access, readdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import { basename, join } from 'node:path'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { capture, log } from '../log.mjs'
import { request } from './client.mjs'
import { categories, memoryModes, searchPaths } from './config.mjs'

const workerScript = fileURLToPath(new URL('../worker.py', import.meta.url))
const lanPaintFolder = 'pixelbench_lanpaint'
const ggufFolder = 'pixelbench_gguf'
// Hires fix renders in tiles with Ultimate SD Upscale.
const tiledUpscaleFolder = 'ComfyUI_UltimateSDUpscale'
// Optional seed variance for Krea 2 Turbo: noise on the prompt embedding in the first steps.
const seedVarianceFolder = 'KreaSeedVarianceEnhancer'
// Optional prompt weights for Krea 2: Krea2PromptWeight from KJNodes scales attention per token.
const kjNodesFolder = 'ComfyUI-KJNodes'
// Optional Krea 2 edit: source patch and image-grounded encode for the conradlocke edit LoRAs.
const krea2EditFolder = 'comfyui-krea2edit'

async function freePort() {
  const socket = createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  return port
}

export function createWorker(config, runtime, token = randomBytes(32).toString('hex')) {
  const worker = { state: 'starting', details: '', token, log: '', owned: true, keepModels: config.keepModels === true }
  worker.ready = start().catch((error) => {
    if (worker.stopping) return
    worker.state = 'error'
    worker.details = error.message
    log('Brücke', error.message)
    if (worker.child && worker.child.exitCode === null) worker.child.stdin.end()
  })
  return worker

  async function start(retry = true) {
    const main = join(config.source, 'main.py')
    try {
      await Promise.all([access(main), access(config.python)])
    } catch {
      throw new Error('ComfyUI source folder or Python executable is missing. Check the paths in Settings.')
    }

    const port = config.port || (await freePort())
    worker.address = 'http://127.0.0.1:' + port
    const dir = (worker.dir = join(runtime, 'worker-' + randomUUID()))
    for (const folder of ['input', 'output', 'temp', 'user']) await mkdir(join(dir, folder), { recursive: true })
    const extraFile = join(dir, 'models.yaml')
    // JSON is a YAML subset. The paths point to present weights in their original folders.
    const categoriesMap = Object.fromEntries(
      categories.map((category) => [category, searchPaths(config, category).join('\n')])
    )
    // TAESD decoders for live previews. Only read when the preview setting asks for TAESD.
    categoriesMap.vae_approx = [
      ...config.roots.map((root) => join(root, 'vae_approx')),
      join(config.source, 'models', 'vae_approx')
    ].join('\n')
    const customNodes = join(runtime, 'custom_nodes')
    const installed = await Promise.all(
      [lanPaintFolder, ggufFolder, tiledUpscaleFolder, seedVarianceFolder, kjNodesFolder, krea2EditFolder].map(
        (folder) =>
          access(join(customNodes, folder, '__init__.py')).then(
            () => folder,
            () => null
          )
      )
    )
    const gguf = installed.includes(ggufFolder) ? ggufFolder : undefined
    const lanPaint = installed.includes(lanPaintFolder) ? lanPaintFolder : undefined
    const tiledUpscale = installed.includes(tiledUpscaleFolder) ? tiledUpscaleFolder : undefined
    const seedVariance = installed.includes(seedVarianceFolder) ? seedVarianceFolder : undefined
    const kjNodes = installed.includes(kjNodesFolder) ? kjNodesFolder : undefined
    const krea2Edit = installed.includes(krea2EditFolder) ? krea2EditFolder : undefined
    const enabledNodes = [lanPaint, gguf, tiledUpscale, seedVariance, kjNodes, krea2Edit].filter(Boolean)
    if (enabledNodes.length) {
      await mkdir(join(dir, 'custom_nodes'), { recursive: true })
      categoriesMap.custom_nodes = customNodes
    }
    await writeFile(extraFile, JSON.stringify({ pixelbench: categoriesMap }, null, 2))
    await writeFile(join(dir, '.pixelbench'), 'Pixelbench worker v1', { flag: 'wx' })
    if (worker.stopping) return
    const memory = memoryModes[config.memory]
    log('Brücke', 'Starting private ComfyUI · ' + [memory.name, ...(config.args ?? [])].join(' '))
    const child = (worker.child = spawn(
      config.python,
      [
        '-B',
        '-u',
        workerScript,
        config.source,
        dir,
        '--listen',
        '127.0.0.1',
        '--port',
        String(port),
        '--base-directory',
        dir,
        '--extra-model-paths-config',
        extraFile,
        '--database-url',
        'sqlite:///:memory:',
        '--disable-auto-launch',
        '--disable-assets',
        '--offline',
        '--disable-all-custom-nodes',
        ...(enabledNodes.length ? ['--whitelist-custom-nodes', ...enabledNodes] : []),
        '--disable-metadata',
        '--disable-dynamic-vram',
        ...memory.flags,
        ...(config.args ?? [])
      ],
      {
        cwd: dir,
        windowsHide: true,
        env: {
          ...process.env,
          PIXELBENCH_WORKER_TOKEN: token,
          HF_HUB_OFFLINE: '1',
          TRANSFORMERS_OFFLINE: '1',
          PYTHONIOENCODING: 'utf-8'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      }
    ))
    child.stdin.on('error', () => {})
    child.on('error', (error) => {
      worker.log += '\n' + error.message
      log('Brücke', error.message)
    })
    child.once('close', (code) => {
      const crashed = worker.state === 'ready' && !worker.stopping
      worker.state = 'error'
      worker.details ||= 'The private ComfyUI process exited (' + code + ').'
      log('Brücke', worker.stopping ? 'Private ComfyUI stopped' : worker.details)
      if (!worker.stopping && worker.log) console.error(worker.log)
      // Let the owner restart a worker that died after it was ready.
      if (crashed) worker.onCrash?.()
    })
    const append = (chunk) => {
      worker.log = (worker.log + chunk).slice(-10000)
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    capture(child.stdout, (line) => worker.onOutput?.(line))
    capture(child.stderr, (line) => worker.onOutput?.(line))
    const until = Date.now() + 90000
    while (!worker.stopping && worker.state === 'starting' && Date.now() < until) {
      try {
        const stats = await (await request(worker, '/system_stats', { timeout: 2000 })).json()
        if (worker.stopping) return
        worker.stats = stats
        worker.state = 'ready'
        log('Brücke', 'ComfyUI connected · ' + (worker.stats.devices?.[0]?.name ?? 'Unknown device'))
        return
      } catch {
        await delay(500)
      }
    }
    // Another process may have taken the port between freePort() and the bind. Retry once with a new port.
    if (
      retry &&
      !config.port &&
      !worker.stopping &&
      worker.state === 'error' &&
      /address already in use|10048|10013/i.test(worker.log)
    ) {
      log('Brücke', 'The port was already in use; ComfyUI is starting on a new port.')
      Object.assign(worker, { state: 'starting', details: '', log: '', child: undefined })
      return start(false)
    }
    if (!worker.stopping) throw new Error(worker.details || 'ComfyUI did not respond during startup.')
  }
}

export async function stopWorker(worker) {
  if (!worker) return
  worker.stopping = true
  if (!worker.child) {
    await worker.ready
    return
  }
  if (worker.child.exitCode !== null || worker.child.signalCode !== null) return
  const exited = once(worker.child, 'close').catch(() => {})
  worker.child.stdin.end()
  const kill = setTimeout(() => worker.child.kill(), 2000)
  await exited
  clearTimeout(kill)
}

let sweeping = Promise.resolve()

// Sweeps run one at a time. A sweep that is still iterating must not see a freshly created worker directory.
export function sweepWorkers(config, runtime, current) {
  const run = sweeping.then(() => sweepOnce(config, runtime, current))
  sweeping = run.catch(() => {})
  return run
}

let lastSweepFailure = ''

async function sweepOnce(config, runtime, current) {
  // Skip starting Python when there is nothing to clean up.
  const keep = current ? basename(current) : ''
  const orphans = await readdir(runtime).then(
    (names) => names.filter((name) => name.startsWith('worker-') && name !== keep),
    () => []
  )
  if (!orphans.length) return
  // System Python is a fallback for cleanup when the configured installation moved. macOS only has python3.
  const system = process.platform === 'win32' ? ['python'] : ['python3', 'python']
  for (const python of [config.python, ...system]) {
    try {
      const child = spawn(python, ['-B', workerScript, 'sweep', runtime, current ?? ''], {
        windowsHide: true,
        stdio: 'ignore'
      })
      const [code] = await once(child, 'close')
      if (code === 0) {
        lastSweepFailure = ''
        return
      }
    } catch {
      /* Try the other interpreter. */
    }
  }
  // Report a persistent failure once, not on every interval.
  const failure = 'Could not check temporary ComfyUI folders.'
  if (failure === lastSweepFailure) return
  lastSweepFailure = failure
  console.error(failure)
  log('Brücke', failure)
}

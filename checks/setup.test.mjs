import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compareVersions, extraModelRoots, installAt } from '../scripts/setup/comfy.mjs'
import { gitHead, nodeState, pin } from '../scripts/setup/nodes.mjs'

const manifest = JSON.parse(await readFile(new URL('../scripts/setup/manifest.json', import.meta.url), 'utf8'))

async function files(base, paths) {
  for (const path of paths) {
    await mkdir(join(base, path, '..'), { recursive: true })
    await writeFile(join(base, path), '')
  }
}

async function scratch(run) {
  const dir = await mkdtemp(join(tmpdir(), 'pixelbench-setup-'))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const windows = process.platform === 'win32'
const venvPython = windows ? ['Scripts', 'python.exe'] : ['bin', 'python']

test('a portable root resolves to its ComfyUI folder and embedded Python', { skip: !windows }, () =>
  scratch(async (dir) => {
    await files(dir, ['ComfyUI/main.py', 'python_embeded/python.exe'])
    const install = await installAt(dir)
    assert.equal(install.source, join(dir, 'ComfyUI'))
    assert.equal(install.python, join(dir, 'python_embeded', 'python.exe'))
  })
)

test('a Comfy Desktop root resolves to its ComfyUI folder and the venv inside it', () =>
  scratch(async (dir) => {
    await files(dir, ['ComfyUI/main.py', join('ComfyUI', '.venv', ...venvPython)])
    const install = await installAt(dir)
    assert.equal(install.source, join(dir, 'ComfyUI'))
    assert.equal(install.python, join(dir, 'ComfyUI', '.venv', ...venvPython))
  }))

test('a manual install uses the venv inside the source folder', () =>
  scratch(async (dir) => {
    await files(dir, ['main.py', join('.venv', ...venvPython)])
    assert.equal((await installAt(dir)).python, join(dir, '.venv', ...venvPython))
  }))

test('a source folder without Python is reported without one, other folders not at all', () =>
  scratch(async (dir) => {
    await files(dir, ['src/main.py', 'empty/readme.txt'])
    assert.equal((await installAt(join(dir, 'src'))).python, undefined)
    assert.equal(await installAt(join(dir, 'empty')), undefined)
  }))

test('extra_model_paths.yaml base paths become model roots, with or without a models subfolder', () =>
  scratch(async (dir) => {
    await files(dir, ['shared/loras/a.safetensors', 'a1111/models/checkpoints/b.safetensors', 'comfy/main.py'])
    const yaml = [
      'one:',
      "  base_path: '" + join(dir, 'shared') + "'",
      'two:',
      '  base_path: ' + join(dir, 'a1111') + '  # comment',
      'three:',
      '  base_path: ' + join(dir, 'missing'),
      'relative:',
      '  base_path: models/'
    ].join('\n')
    await writeFile(join(dir, 'comfy', 'extra_model_paths.yaml'), yaml)
    assert.deepEqual(await extraModelRoots(join(dir, 'comfy')), [join(dir, 'shared'), join(dir, 'a1111', 'models')])
  }))

test('versions compare numerically', () => {
  assert.ok(compareVersions('0.45.2', '0.46.0') < 0)
  assert.ok(compareVersions('0.100.0', '0.46.0') > 0)
  assert.equal(compareVersions('0.46', '0.46.0'), 0)
})

test('gitHead reads detached, loose and packed refs', () =>
  scratch(async (dir) => {
    const sha = 'a'.repeat(40)
    await files(dir, ['detached/.git/HEAD', 'loose/.git/HEAD', 'packed/.git/HEAD'])
    await writeFile(join(dir, 'detached/.git/HEAD'), sha + '\n')
    await writeFile(join(dir, 'loose/.git/HEAD'), 'ref: refs/heads/main\n')
    await files(dir, ['loose/.git/refs/heads/main'])
    await writeFile(join(dir, 'loose/.git/refs/heads/main'), sha + '\n')
    await writeFile(join(dir, 'packed/.git/HEAD'), 'ref: refs/heads/main\n')
    await writeFile(join(dir, 'packed/.git/packed-refs'), '# pack-refs\n' + sha + ' refs/heads/main\n')
    for (const name of ['detached', 'loose', 'packed']) assert.equal(await gitHead(join(dir, name)), sha)
  }))

test('node state accepts a git checkout on the pinned commit and keeps one on another commit', () =>
  scratch(async (dir) => {
    const node = manifest.nodes[0]
    assert.equal((await nodeState(dir, node)).action, 'install')
    await files(dir, [node.folder + '/.git/HEAD'])
    await writeFile(join(dir, node.folder, '.git/HEAD'), node.commit)
    assert.deepEqual(await nodeState(dir, node), { action: 'ok', path: join(dir, node.folder) })
    await writeFile(join(dir, node.folder, '.git/HEAD'), 'b'.repeat(40))
    assert.equal((await nodeState(dir, node)).action, 'git')
  }))

test('a downloaded node with an outdated marker is replaced', () =>
  scratch(async (dir) => {
    const node = manifest.nodes[0]
    await files(dir, [node.folder + '/.pixelbench-node.json'])
    const marker = join(dir, node.folder, '.pixelbench-node.json')
    await writeFile(marker, JSON.stringify({ pin: 'old' }))
    assert.equal((await nodeState(dir, node)).action, 'install')
    await writeFile(marker, JSON.stringify({ pin: pin(node) }))
    assert.equal((await nodeState(dir, node)).action, 'ok')
  }))

test('the pin changes with a submodule commit', () => {
  const node = manifest.nodes.find((entry) => entry.submodules?.length)
  const moved = { ...node, submodules: [{ ...node.submodules[0], commit: 'c'.repeat(40) }] }
  assert.notEqual(pin(node), pin(moved))
  assert.ok(pin(node).startsWith(node.commit + '+'))
})

test('the manifest pins every custom node folder the bridge looks for', async () => {
  const worker = await readFile(new URL('../server/comfy/worker.mjs', import.meta.url), 'utf8')
  for (const node of manifest.nodes) {
    assert.match(node.commit, /^[0-9a-f]{40}$/)
    assert.ok(worker.includes("'" + node.folder + "'"), node.folder + ' is unknown to the bridge')
  }
})

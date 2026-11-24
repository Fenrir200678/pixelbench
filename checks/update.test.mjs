import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pickRelease } from '../server/update/check.mjs'
import { applyRelease, safePath } from '../scripts/update/apply.mjs'

const digest = 'sha256:' + 'a'.repeat(64)
const release = (tag, extra = {}) => ({
  tag_name: tag,
  name: 'Pixelbench ' + tag,
  html_url: 'https://example.invalid/' + tag,
  draft: false,
  prerelease: tag.includes('-'),
  assets: [
    { name: 'pixelbench-' + tag + '.zip', browser_download_url: 'https://example.invalid/' + tag + '.zip', digest }
  ],
  ...extra
})

async function scratch(run) {
  const dir = await mkdtemp(join(tmpdir(), 'pixelbench-update-'))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function folder(base, version, files) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(base, path, '..'), { recursive: true })
    await writeFile(join(base, path), content)
  }
  const listed = Object.keys(files).filter((path) => path !== '.settings.json' && !path.startsWith('profiles/my'))
  if (version) await writeFile(join(base, 'release.json'), JSON.stringify({ version, files: listed }))
}

const read = (path) => readFile(path, 'utf8').catch(() => undefined)

test('the newest release above the current version wins, pre-releases only when asked for', () => {
  const list = [release('v0.1.0-beta.1'), release('v0.2.0-beta.1'), release('v0.1.0'), release('v0.1.1')]
  assert.equal(pickRelease(list, '0.1.0-beta.1')?.version, '0.1.1')
  assert.equal(pickRelease(list, '0.1.0-beta.1', { prerelease: true })?.version, '0.2.0-beta.1')
  assert.equal(pickRelease(list, '0.2.0-beta.1', { prerelease: true }), undefined)
  // A stable release is newer than its own pre-releases.
  assert.equal(pickRelease([release('v0.2.0')], '0.2.0-beta.1')?.version, '0.2.0')
})

test('drafts, foreign tags and releases without a checksummed zip are skipped', () => {
  const list = [
    release('v0.3.0', { draft: true }),
    release('nightly'),
    release('v0.2.0', { assets: [] }),
    release('v0.1.5', { assets: [{ name: 'pixelbench-v0.1.5.zip', browser_download_url: 'x' }] }),
    release('v0.1.1')
  ]
  const picked = pickRelease(list, '0.1.0')
  assert.equal(picked?.version, '0.1.1')
  assert.equal(picked.download.sha256, 'a'.repeat(64))
  assert.equal(pickRelease('not a list', '0.1.0'), undefined)
})

test('manifest paths must stay inside the folder and away from user data', () => {
  for (const path of ['dist/index.html', 'server/app.mjs', 'README.md']) assert.ok(safePath(path), path)
  for (const path of [
    '../evil.js',
    'C:/Windows/x',
    '/etc/x',
    '.settings.json',
    '.runtime/x',
    'node_modules/a',
    '.git/HEAD',
    'release.json',
    ''
  ])
    assert.ok(!safePath(path), path)
})

test('an update replaces listed files, removes dropped ones and keeps everything else', () =>
  scratch(async (dir) => {
    const target = join(dir, 'app')
    const source = join(dir, 'new')
    await folder(target, '0.1.0', {
      'server/app.mjs': 'old',
      'server/gone.mjs': 'old',
      'profiles/my-own.json': 'mine',
      '.settings.json': 'settings'
    })
    await folder(source, '0.2.0', { 'server/app.mjs': 'new', 'server/added.mjs': 'new' })
    let setups = 0
    const result = await applyRelease({ source, target, backup: join(dir, 'backup'), runSetup: async () => setups++ })
    assert.deepEqual(result, { from: '0.1.0', to: '0.2.0' })
    assert.equal(setups, 1)
    assert.equal(await read(join(target, 'server/app.mjs')), 'new')
    assert.equal(await read(join(target, 'server/added.mjs')), 'new')
    assert.equal(await read(join(target, 'server/gone.mjs')), undefined)
    assert.equal(await read(join(target, 'profiles/my-own.json')), 'mine')
    assert.equal(await read(join(target, '.settings.json')), 'settings')
    assert.equal(JSON.parse(await read(join(target, 'release.json'))).version, '0.2.0')
  }))

test('a folder from before the updater is only overwritten', () =>
  scratch(async (dir) => {
    const target = join(dir, 'app')
    const source = join(dir, 'new')
    await folder(target, undefined, { 'server/app.mjs': 'old', 'server/stale.mjs': 'old' })
    await folder(source, '0.2.0', { 'server/app.mjs': 'new' })
    const result = await applyRelease({ source, target, backup: join(dir, 'backup'), runSetup: async () => {} })
    assert.equal(result.from, undefined)
    assert.equal(await read(join(target, 'server/app.mjs')), 'new')
    assert.equal(await read(join(target, 'server/stale.mjs')), 'old')
  }))

test('a failing setup restores the previous files and runs setup again for them', () =>
  scratch(async (dir) => {
    const target = join(dir, 'app')
    const source = join(dir, 'new')
    await folder(target, '0.1.0', { 'server/app.mjs': 'old', 'server/gone.mjs': 'old' })
    await folder(source, '0.2.0', { 'server/app.mjs': 'new', 'server/added.mjs': 'new' })
    const seen = []
    const runSetup = async () => {
      seen.push(await read(join(target, 'server/app.mjs')))
      if (seen.length === 1) throw new Error('pip failed')
    }
    await assert.rejects(applyRelease({ source, target, backup: join(dir, 'backup'), runSetup }), /pip failed/)
    assert.deepEqual(seen, ['new', 'old'])
    assert.equal(await read(join(target, 'server/app.mjs')), 'old')
    assert.equal(await read(join(target, 'server/gone.mjs')), 'old')
    assert.equal(await read(join(target, 'server/added.mjs')), undefined)
    assert.equal(JSON.parse(await read(join(target, 'release.json'))).version, '0.1.0')
  }))

test('a manifest with an unsafe path is refused before anything changes', () =>
  scratch(async (dir) => {
    const target = join(dir, 'app')
    const source = join(dir, 'new')
    await folder(target, '0.1.0', { 'server/app.mjs': 'old' })
    await mkdir(source, { recursive: true })
    await writeFile(join(source, 'release.json'), JSON.stringify({ version: '0.2.0', files: ['../outside.txt'] }))
    await assert.rejects(
      applyRelease({ source, target, backup: join(dir, 'backup'), runSetup: async () => {} }),
      /Unsafe path/
    )
    assert.equal(await read(join(target, 'server/app.mjs')), 'old')
  }))

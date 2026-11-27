import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createPromptHistory } from '../server/app/prompt-history.mjs'
import { json } from '../server/app/http.mjs'

const endpoint = '/api/prompt-history'

async function serve(runtime) {
  const server = createServer(async (req, res) => {
    try {
      await handle(req, res, new URL(req.url, origin))
    } catch (error) {
      if (!res.headersSent) json(res, error.status ?? 500, { error: error.message })
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  const handle = createPromptHistory(runtime, origin)
  const post = (action, body = {}, sameOrigin = true) =>
    fetch(origin + endpoint + '/' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(sameOrigin ? { Origin: origin } : {}) },
      body: JSON.stringify(body)
    })
  const call = async (action, body) => {
    const response = await post(action, body)
    assert.equal(response.status, 200, await response.clone().text())
    return response.json()
  }
  return {
    post,
    call,
    get: async () => (await fetch(origin + endpoint)).json(),
    record: (prompt, tool = 'create', negative = '') => call('record', { prompt, negative, tool }),
    close: () => new Promise((resolve) => server.close(resolve))
  }
}

async function setup(t) {
  const runtime = await mkdtemp(join(tmpdir(), 'pixelbench-history-'))
  const server = await serve(runtime)
  t.after(async () => {
    await server.close()
    await rm(runtime, { recursive: true, force: true })
  })
  return { runtime, server }
}

const prompts = (state) => state.entries.map((entry) => entry.prompt)

test('records submitted prompts newest first, moves repeats to the top and trims to the limit', async (t) => {
  const { runtime, server } = await setup(t)
  assert.deepEqual(await server.get(), { enabled: true, limit: 100, entries: [] })
  await server.record('a red fox')
  await server.record('a blue bird', 'edit', 'blurry')
  let state = await server.record('a red fox', 'inpaint')
  assert.deepEqual(prompts(state), ['a red fox', 'a blue bird'])
  assert.equal(state.entries[0].tool, 'inpaint')
  assert.equal(state.entries[1].negative, 'blurry')
  // A different negative prompt is a separate entry.
  state = await server.record('a blue bird', 'edit', '')
  assert.equal(state.entries.length, 3)
  assert.deepEqual(prompts(await server.record('   ')), prompts(state))

  state = await server.call('settings', { limit: 2 })
  assert.deepEqual(prompts(state), ['a blue bird', 'a red fox'])
  state = await server.record('a green frog')
  assert.deepEqual(prompts(state), ['a green frog', 'a blue bird'])

  const restarted = await serve(runtime)
  t.after(() => restarted.close())
  assert.deepEqual(await restarted.get(), state)
})

test('removed entries can be restored at their old position and the history can be cleared', async (t) => {
  const { server } = await setup(t)
  await server.record('one')
  await server.record('two')
  const full = await server.record('three')
  const removed = full.entries[1]
  let state = await server.call('remove', { id: removed.id })
  assert.deepEqual(prompts(state), ['three', 'one'])
  state = await server.call('restore', { entry: removed, index: 1 })
  assert.deepEqual(state, full)
  // Restoring twice does not duplicate the entry.
  assert.deepEqual(await server.call('restore', { entry: removed, index: 0 }), full)
  state = await server.call('clear')
  assert.deepEqual(state.entries, [])
})

test('a disabled history records nothing but keeps its entries', async (t) => {
  const { server } = await setup(t)
  await server.record('kept')
  const state = await server.call('settings', { enabled: false })
  assert.equal(state.enabled, false)
  assert.deepEqual(prompts(await server.record('ignored')), ['kept'])
})

test('rejects invalid input and cross-origin writes', async (t) => {
  const { server } = await setup(t)
  assert.equal((await server.post('record', { prompt: 'x', tool: 'paint' })).status, 400)
  assert.equal((await server.post('record', { prompt: 'x'.repeat(16001), tool: 'create' })).status, 400)
  assert.equal((await server.post('settings', { limit: 0 })).status, 400)
  assert.equal((await server.post('settings', { limit: 501 })).status, 400)
  assert.equal((await server.post('restore', { entry: { id: 'nope' }, index: 0 })).status, 400)
  assert.equal((await server.post('record', { prompt: 'x', tool: 'create' }, false)).status, 403)
  assert.equal((await server.post('unknown')).status, 404)
  assert.deepEqual((await server.get()).entries, [])
})

test('a damaged file starts an empty history and is replaced on the next write', async (t) => {
  const { runtime } = await setup(t)
  await writeFile(join(runtime, 'prompt-history.json'), '{ broken')
  const server = await serve(runtime)
  t.after(() => server.close())
  assert.deepEqual(await server.get(), { enabled: true, limit: 100, entries: [] })
  await server.record('fresh')
  const stored = JSON.parse(await readFile(join(runtime, 'prompt-history.json'), 'utf8'))
  assert.equal(stored.version, 1)
  assert.deepEqual(prompts(stored), ['fresh'])
})

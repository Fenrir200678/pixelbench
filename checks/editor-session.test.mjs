import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createEditorSession } from '../server/app/editor-session.mjs'
import { json } from '../server/app/http.mjs'

const endpoint = '/api/editor-session'

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
  const handle = createEditorSession(runtime, origin)
  const write = (path, { body, revision, upload, method = 'POST', binary, sameOrigin = true } = {}) =>
    fetch(origin + endpoint + path, {
      method,
      headers: {
        ...(sameOrigin ? { Origin: origin } : {}),
        ...(revision ? { 'If-Match': `"${revision}"` } : {}),
        ...(upload ? { 'X-Session-Upload': upload } : {}),
        ...(body !== undefined ? { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' } : {})
      },
      body: binary ? body : JSON.stringify(body)
    })
  return {
    get: (path = '', revision) =>
      fetch(origin + endpoint + path, { headers: revision ? { 'If-Match': `"${revision}"` } : {} }),
    summary: async () => (await fetch(origin + endpoint + '?summary')).json(),
    limit: (limitMB) => write('/limit', { body: { limitMB } }),
    clear: (revision, sameOrigin) => write('', { method: 'DELETE', revision, sameOrigin }),
    async begin(revision) {
      const response = await write('/begin', { revision })
      assert.equal(response.status, 201)
      return (await response.json()).upload
    },
    send: (id, body, revision, upload) => write('/assets/' + id, { body, revision, binary: true, upload }),
    abort: (revision, upload) => write('/abort', { revision, upload }),
    commit: (body, revision, upload, sameOrigin) => write('', { body, revision, upload, sameOrigin }),
    async close() {
      await new Promise((resolve) => server.close(resolve))
    }
  }
}

test('a session commits complete assets, keeps the last good snapshot on failure, and survives restart', async (t) => {
  const runtime = await mkdtemp(join(tmpdir(), 'pixelbench-session-'))
  let server = await serve(runtime)
  t.after(async () => {
    await server.close()
    await rm(runtime, { recursive: true, force: true })
  })
  const directory = join(runtime, 'editor-session')
  const rgba = Uint8Array.of(231, 149, 57, 0, 223, 64, 7, 144)
  const id = randomUUID()
  const first = { version: 1, workspace: { prompt: '  Kite 🪁\nclouds  ' }, assets: { [id]: rgba.length } }

  assert.equal((await server.summary()).revision, 'none')
  assert.equal((await server.commit(first, 'none', undefined, false)).status, 403)
  let upload = await server.begin('none')
  assert.equal((await server.commit(first, 'none', upload)).status, 409)
  assert.equal((await server.send(id, rgba, 'none', upload)).status, 201)
  assert.equal((await server.get('/assets/' + id, 'none')).status, 404)

  const committed = await server.commit(first, 'none', upload)
  assert.equal(committed.status, 200)
  const { revision } = await committed.json()
  assert.equal((await server.commit(first, 'none', upload)).status, 412)
  upload = await server.begin(revision)
  assert.equal((await server.send(id, rgba, revision, upload)).status, 409)
  assert.deepEqual(new Uint8Array(await (await server.get('/assets/' + id, revision)).arrayBuffer()), rgba)

  const orphan = randomUUID()
  const second = { ...first, workspace: { prompt: 'Another session' } }
  assert.equal((await server.send(orphan, rgba, revision, upload)).status, 201)
  assert.equal(
    (await server.commit({ ...second, assets: { [orphan]: rgba.length + 1 } }, revision, upload)).status,
    409
  )
  await server.close()
  server = await serve(runtime)
  const restored = await (await server.get()).json()
  assert.equal(restored.revision, revision)
  assert.deepEqual(restored.workspace, first.workspace)
  assert.deepEqual((await readdir(directory)).sort(), [id + '.gz', 'latest.json'])

  const changed = await server.commit(second, revision, await server.begin(revision))
  assert.equal(changed.status, 200)
  const latest = await changed.json()
  assert.notEqual(latest.revision, revision)
  assert.equal((await server.get('/assets/' + id, revision)).status, 412)
  assert.deepEqual(new Uint8Array(await (await server.get('/assets/' + id, latest.revision)).arrayBuffer()), rgba)

  await server.close()
  await writeFile(join(directory, 'latest.json'), '{')
  server = await serve(runtime)
  const damaged = await server.summary()
  assert.equal(damaged.damaged, true)
  assert.equal((await server.get()).status, 422)
  assert.ok((await readdir(directory)).includes(id + '.gz'))
  const replacement = await server.begin(damaged.revision)
  assert.equal((await server.commit({ ...second, assets: {} }, damaged.revision, replacement)).status, 200)
  assert.deepEqual(await readdir(directory), ['latest.json'])
})

test('storage limits use compressed disk bytes; deleting frees the files and fences off stale writes', async (t) => {
  const runtime = await mkdtemp(join(tmpdir(), 'pixelbench-session-storage-'))
  let server = await serve(runtime)
  t.after(async () => {
    await server.close()
    await rm(runtime, { recursive: true, force: true })
  })
  const directory = join(runtime, 'editor-session')
  const current = await server.summary()
  assert.equal(current.limitMB, 50)
  assert.equal(current.bytesUsed, 0)
  assert.equal((await server.limit(0)).status, 400)
  assert.equal((await server.limit(2)).status, 200)

  let revision = current.revision
  let upload = await server.begin(revision)
  const first = randomUUID()
  const second = randomUUID()
  const data = randomBytes(600_000)
  assert.equal((await server.send(first, data, revision, upload)).status, 201)
  assert.equal((await server.send(second, data, revision, upload)).status, 201)
  const workspace = {
    version: 1,
    workspace: { prompt: 'Original' },
    assets: { [first]: data.length, [second]: data.length }
  }
  const committed = await server.commit(workspace, revision, upload)
  assert.equal(committed.status, 200)
  const saved = await committed.json()
  revision = saved.revision
  const diskBytes = (
    await Promise.all((await readdir(directory)).map(async (file) => (await stat(join(directory, file))).size))
  ).reduce((sum, bytes) => sum + bytes, 0)
  assert.equal(saved.bytesUsed, diskBytes)
  assert.ok(saved.bytesUsed > 1_000_000)

  const lower = await (await server.limit(1)).json()
  assert.equal(lower.limitMB, 1)
  assert.equal(lower.bytesUsed, saved.bytesUsed)
  assert.equal((await server.get()).status, 200)

  upload = await server.begin(revision)
  const third = randomUUID()
  assert.equal((await server.send(third, randomBytes(1_100_000), revision, upload)).status, 413)
  assert.equal((await server.summary()).bytesUsed, saved.bytesUsed)
  assert.equal((await server.send(third, data, revision, upload)).status, 201)
  assert.equal(
    (await server.commit({ ...workspace, assets: { [first]: data.length, [third]: data.length } }, revision, upload))
      .status,
    413
  )
  assert.equal((await server.summary()).revision, revision)
  assert.equal((await server.abort(revision, upload)).status, 200)
  assert.equal((await server.summary()).bytesUsed, saved.bytesUsed)

  upload = await server.begin(revision)
  const compressible = Buffer.alloc(1_400_000, 17)
  assert.equal((await server.send(third, compressible, revision, upload)).status, 201)
  const smaller = { ...workspace, assets: { [third]: compressible.length } }
  const replacement = await server.commit(smaller, revision, upload)
  assert.equal(replacement.status, 200)
  const next = await replacement.json()
  assert.ok(next.bytesUsed < 1_000_000)
  assert.equal((await server.clear(revision)).status, 412)
  assert.equal((await server.clear(next.revision, false)).status, 403)

  const abandoned = await server.begin(next.revision)
  assert.equal((await server.send(first, data, next.revision, abandoned)).status, 201)
  upload = await server.begin(next.revision)
  assert.equal((await server.commit(workspace, next.revision, abandoned)).status, 412)
  assert.equal((await server.summary()).bytesUsed, next.bytesUsed)
  assert.equal((await server.send(first, data, next.revision, upload)).status, 201)
  const cleared = await (await server.clear(next.revision)).json()
  assert.equal(cleared.bytesUsed, 0)
  assert.equal(cleared.limitMB, 1)
  assert.equal(cleared.savedAt, null)
  assert.deepEqual(await readdir(directory), [])
  assert.equal((await server.commit(workspace, next.revision, upload)).status, 412)

  await server.close()
  server = await serve(runtime)
  assert.deepEqual(await server.summary(), cleared)
})

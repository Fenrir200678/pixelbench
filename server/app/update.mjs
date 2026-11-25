import { readFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { checkForUpdate, readCheck } from '../update/check.mjs'
import { stageRelease } from '../update/download.mjs'
import { json, readJson, reject } from './http.mjs'

/**
 * The in-app update: GET /api/update reports the state, POST /api/update/check asks GitHub for a newer release
 * and POST /api/update/install downloads it. install(res) then stops the server so its launcher applies it.
 */
export function createUpdates({ root, runtime }) {
  const current = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
  // A git checkout updates with git pull. It only learns about new releases.
  const git = stat(join(root, '.git')).then(
    () => true,
    () => false
  )
  let installing = false

  async function status() {
    const check = await readCheck(runtime)
    const fresh = check?.current === current
    const result = JSON.parse(await readFile(join(runtime, 'update', 'result.json'), 'utf8').catch(() => 'null'))
    return {
      version: current,
      mode: (await git) ? 'git' : 'release',
      checkedAt: fresh ? check.at : undefined,
      release: fresh ? check.release : undefined,
      installing,
      lastResult: result ?? undefined
    }
  }

  async function check(data) {
    try {
      await checkForUpdate({ runtime, current, prerelease: data?.prerelease === true, force: data?.force === true })
    } catch (error) {
      reject('Could not check for updates · ' + error.message, 502)
    }
  }

  async function download(data) {
    if (await git) reject('A git checkout updates with git pull and the installer.', 409)
    if (installing) reject('An update is already being installed.', 409)
    const release = (await status()).release
    if (!release || release.version !== data?.version) reject('This update is no longer offered. Check again.', 409)
    installing = true
    try {
      await stageRelease(runtime, release)
    } catch (error) {
      installing = false
      reject('Could not download the update · ' + error.message, 502)
    }
  }

  return async function handleUpdate(req, res, path, { busy, sameOrigin, install }) {
    if (req.method === 'GET' && path === '/api/update') return json(res, 200, await status())
    if (req.method === 'POST' && path === '/api/update/check') {
      await check(await readJson(req, 1024))
      return json(res, 200, await status())
    }
    if (req.method === 'POST' && path === '/api/update/install') {
      if (!sameOrigin) reject('This action requires a same-origin request.', 403)
      if (busy()) reject('Wait for the current job or backend change to finish.', 409)
      await download(await readJson(req, 1024))
      if (busy()) {
        installing = false
        reject('Wait for the current job or backend change to finish.', 409)
      }
      install(res)
      return json(res, 202, await status())
    }
    reject('Address not found.', 404)
  }
}

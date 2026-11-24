import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import semver from 'semver'

// PIXELBENCH_UPDATE_FEED points the check at another release list, for tests against a local server.
export const feed =
  process.env.PIXELBENCH_UPDATE_FEED ?? 'https://api.github.com/repos/Fenrir200678/pixelbench/releases?per_page=20'
const maxAge = 24 * 60 * 60_000

/** The release zip of one GitHub release with the SHA-256 that GitHub lists for it, or undefined. */
function packageOf(release) {
  const name = 'pixelbench-' + release.tag_name + '.zip'
  const asset = release.assets?.find((entry) => entry.name === name)
  const sha256 = /^sha256:([0-9a-f]{64})$/i.exec(asset?.digest ?? '')?.[1]
  if (!asset?.browser_download_url || !sha256) return undefined
  return { url: asset.browser_download_url, size: asset.size, sha256: sha256.toLowerCase() }
}

/** Picks the newest release above current from a GitHub release list. Pre-releases only when asked for. */
export function pickRelease(releases, current, { prerelease = false } = {}) {
  let best
  for (const release of Array.isArray(releases) ? releases : []) {
    const version = semver.valid(String(release?.tag_name ?? '').replace(/^v/, ''))
    if (!version || release.draft || (release.prerelease && !prerelease)) continue
    if (!semver.gt(version, current) || (best && !semver.gt(version, best.version))) continue
    const download = packageOf(release)
    if (!download) continue
    best = {
      version,
      name: release.name || release.tag_name,
      url: release.html_url,
      prerelease: Boolean(release.prerelease),
      publishedAt: release.published_at,
      download
    }
  }
  return best
}

const cacheFile = (runtime) => join(runtime, 'update', 'check.json')

export async function readCheck(runtime) {
  return JSON.parse(await readFile(cacheFile(runtime), 'utf8').catch(() => 'null'))
}

/** Asks GitHub for a newer release. A check from the last 24 hours with the same options is reused. */
export async function checkForUpdate({ runtime, current, prerelease, force = false }) {
  const cached = await readCheck(runtime)
  if (
    !force &&
    cached?.current === current &&
    cached.prerelease === prerelease &&
    Date.now() - cached.at < maxAge &&
    Date.now() >= cached.at
  )
    return cached
  const response = await fetch(feed, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Pixelbench/' + current },
    signal: AbortSignal.timeout(15_000)
  })
  if (!response.ok) throw new Error('GitHub answered with HTTP ' + response.status)
  const check = {
    at: Date.now(),
    current,
    prerelease,
    release: pickRelease(await response.json(), current, { prerelease })
  }
  await mkdir(join(runtime, 'update'), { recursive: true })
  await writeFile(cacheFile(runtime), JSON.stringify(check, null, 2))
  return check
}

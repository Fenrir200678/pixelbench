/* global document */
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { defaults } from '../server/comfy.mjs'
import { encode } from '../server/png.mjs'
import { profiles } from '../server/profiles.mjs'
import { chromePath } from './chrome.mjs'

// The editor and its disk API are real. ComfyUI status and the finished generation are fixtures.
const temp = await mkdtemp(join(tmpdir(), 'pixelbench-editor-session-'))
const listener = createServer().listen(0, '127.0.0.1')
await once(listener, 'listening')
const { port } = listener.address()
await new Promise((resolve) => listener.close(resolve))
const origin = `http://127.0.0.1:${port}`
const endpoint = origin + '/api/editor-session'
const readSaved = async () => (await fetch(endpoint)).json()
const catalog = ['qwen21-t2i', 'qwen21', 'sdxl-inpaint'].map((id) => {
  const definition = profiles.find((item) => item.definition.id === id).definition
  const catalog = Object.fromEntries(definition.models.map((slot) => [`${slot.node}.${slot.input}`, [slot.files[0]]]))
  return {
    ...definition,
    ready: true,
    available: true,
    blockers: [],
    modelMissing: {},
    catalog,
    candidates: catalog,
    selected: Object.fromEntries(Object.entries(catalog).map(([key, [file]]) => [key, file])),
    choices: Object.fromEntries(
      Object.entries(definition.parameters)
        .filter(([, field]) => typeof field.default === 'string')
        .map(([key, field]) => [key, [field.default]])
    )
  }
})
const rgba = Buffer.alloc(256 * 256 * 4, 188)
const png = encode(256, 256, rgba)
const file = (name) => ({ name, buffer: png, mimeType: 'image/png' })
const rendered = (page) => page.locator('.variant-card:not(.variant-source, .variant-pending)')
const waitForSave = (page) =>
  page.waitForResponse(
    (response) => response.url() === endpoint && response.request().method() === 'POST' && response.ok()
  )

let server, browser
async function startServer() {
  server = fork(new URL('../server/app.mjs', import.meta.url), [], {
    env: { ...process.env, PIXELBENCH_STATE: temp, PIXELBENCH_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'inherit', 'ipc']
  })
  const line = await Promise.race([
    once(server.stdout, 'data').then(([line]) => String(line)),
    once(server, 'exit').then(([code]) => {
      throw new Error(`Server exited before startup (${code}).`)
    })
  ])
  assert.match(line, new RegExp(`:${port}`))
}

async function stopServer() {
  if (!server?.connected) return
  const closing = once(server, 'close')
  server.send('shutdown')
  assert.equal((await closing)[0], 0)
}

const errors = []
async function openEditor(context, useClock = false) {
  const page = await context.newPage()
  if (useClock) await page.clock.install()
  page.setDefaultTimeout(8000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/status**', (route) =>
    route.fulfill({ json: { state: 'ready', mode: 'managed', profiles: catalog } })
  )
  await page.route(/\/api\/session(?:\/|$)/, (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/image'))
      return route.fulfill({ headers: { 'X-Image-Width': '256', 'X-Image-Height': '256' }, body: rgba })
    if (path.endsWith('/jobs'))
      return route.fulfill({
        json: { id: 'rendered', stage: 'complete', parameters: route.request().postDataJSON().parameters }
      })
    return route.fulfill({ json: { session: 'generated-test' } })
  })
  await page.goto(origin)
  await page.locator('#prompt').waitFor()
  return page
}

async function checkAutosaveSettings(page, screenshots) {
  await page.setViewportSize({ width: 1360, height: 900 })
  const settings = page.locator('#settings')
  const close = page.locator('#config-close')
  const toggle = page.getByRole('switch', { name: 'Save session automatically' })
  const delay = page.getByRole('spinbutton', { name: 'Delay in seconds' })
  const prompt = page.locator('#prompt')
  await settings.click()
  assert.equal(await toggle.getAttribute('aria-checked'), 'true')
  assert.equal(await delay.inputValue(), '5')
  const limit = page.getByRole('spinbutton', { name: 'Backup size limit' })
  const used = page.locator('#config-session-storage-used')
  assert.equal(await limit.inputValue(), '50')
  assert.match(await used.textContent(), /[1-9].* of 50 MB/)
  if (screenshots)
    await page
      .locator('.setting-group')
      .filter({ has: toggle })
      .screenshot({
        path: join(screenshots, 'pixelbench-session-settings.png')
      })
  await limit.fill('65')
  const changed = page.waitForResponse((response) => response.url() === endpoint + '/limit' && response.ok())
  await limit.press('Enter')
  await changed
  await page.getByText(/ of 65 MB$/).waitFor()
  await delay.fill('301')
  await delay.press('Enter')
  assert.equal(await delay.inputValue(), '300')
  await delay.fill('3')
  await delay.press('Enter')
  await close.click()
  await page.clock.pauseAt(new Date(Date.now() + 1000))

  const before = await readSaved()
  const delayed = waitForSave(page)
  await prompt.fill('Save after three seconds')
  await page.clock.runFor(2500)
  assert.equal((await readSaved()).revision, before.revision)
  await page.clock.runFor(600)
  await delayed
  const saved = await readSaved()
  assert.equal(saved.workspace.workflow.prompts.edit.prompt, 'Save after three seconds')

  await prompt.fill('Save manually with autosave off')
  await settings.click()
  await toggle.click()
  assert.equal(await delay.isDisabled(), true)
  assert.equal(await delay.inputValue(), '3')
  await close.click()
  await page.clock.runFor(6000)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    Reflect.deleteProperty(document, 'visibilityState')
  })
  assert.equal((await readSaved()).revision, saved.revision)
  const manual = waitForSave(page)
  await page.getByRole('button', { name: 'Save session now', exact: true }).click()
  await manual
  assert.equal((await readSaved()).workspace.workflow.prompts.edit.prompt, 'Save manually with autosave off')
}

async function checkStorageDeletion(page) {
  await page.locator('#settings').click()
  const limit = page.getByRole('spinbutton', { name: 'Backup size limit' })
  assert.equal(await limit.inputValue(), '65')
  const button = page.getByRole('button', { name: 'Delete all sessions' })
  const before = await readSaved()
  for (const confirmed of [false, true]) {
    const response = page.waitForEvent('dialog').then(async (dialog) => {
      assert.match(dialog.message(), /Delete all saved sessions/)
      if (confirmed) await dialog.accept()
      else await dialog.dismiss()
    })
    await button.click()
    await response
    if (!confirmed) assert.equal((await readSaved()).revision, before.revision)
  }
  await page.getByText('Saved sessions deleted.', { exact: true }).waitFor()
  assert.equal(await button.isDisabled(), true)
  assert.equal(await page.locator('#config-session-storage-used').textContent(), '0 MB of 65 MB')
  await page.locator('#config-close').click()
  assert.equal(await page.locator('#prompt').inputValue(), 'A draft in a second tab')
  assert.equal(await page.getByRole('button', { name: 'Restore session', exact: true }).isDisabled(), true)
  await page.clock.fastForward(6000)
  assert.equal((await readSaved()).savedAt, null)
}

try {
  await writeFile(join(temp, '.settings.json'), JSON.stringify({ ...defaults, mode: 'external', address: origin }))
  await startServer()
  browser = await chromium.launch({ executablePath: chromePath, headless: true })
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } })
  const page = await openEditor(context)
  const prompt = page.locator('#prompt')
  const createPrompt = '  Create a bright kite.\nPreserve spacing.  '
  const firstSave = waitForSave(page)
  await prompt.fill(createPrompt)
  await firstSave
  assert.equal((await readSaved()).workspace.workflow.prompts.create.prompt, createPrompt)

  await page.locator('[data-tool=edit]').click()
  await page.locator('#file').setInputFiles(file('Original.png'))
  await page.locator('.reference-card').waitFor()
  await page.locator('#ref-file').setInputFiles(file('Reference.png'))
  await page.getByText('Reference.png', { exact: true }).first().waitFor()
  await prompt.fill('Change <image2>')
  await page.locator('#generate').click()
  await rendered(page).first().waitFor()

  await page.locator('[data-tool=inpaint]').click()
  await prompt.fill('Mask prompt')
  await page.locator('#negative').fill('Unwanted area')
  const box = await page.locator('#stage-canvas').boundingBox()
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
  for (const tool of ['#paint-brush', '#brush']) {
    await page.locator(tool).click()
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 8, y + 8, { steps: 4 })
    await page.mouse.up()
  }
  assert.equal(await page.locator('#canvas-clear-mask').isEnabled(), true)
  await page.locator('#adjust').click()
  const brightness = (editor) => editor.locator('#adjust-panel .adjust-row input').first()
  await brightness(page).press('ArrowRight')
  await brightness(page).press('ArrowRight')
  await page.getByRole('button', { name: 'Save session now', exact: true }).click()
  await page.locator('#notice').getByText('Session saved.').waitFor()
  const saved = await readSaved()
  assert.equal(saved.workspace.document.work.strokes.length, 1)
  assert.equal(saved.workspace.document.work.drawing.length, 1)
  assert.equal(saved.workspace.variants.items.length, 1)
  assert.equal(saved.workspace.references.length, 1)
  assert.equal(saved.workspace.adjustments.values.brightness, 2)

  await page.close({ runBeforeUnload: false })
  await stopServer()
  await startServer()
  const restored = await openEditor(context, true)
  const dialogs = []
  restored.on('dialog', async (dialog) => {
    dialogs.push(dialog.message())
    await dialog.dismiss()
  })
  await restored.getByRole('button', { name: 'Restore session', exact: true }).click()
  await restored.locator('#notice').getByText('Session restored.').waitFor()
  assert.deepEqual(dialogs, [])
  assert.equal(await restored.locator('#prompt').inputValue(), 'Mask prompt')
  assert.equal(await restored.locator('#negative').inputValue(), 'Unwanted area')
  assert.equal(await restored.locator('#canvas-clear-mask').isEnabled(), true)
  assert.equal(await restored.locator('#delete-drawing').isEnabled(), true)
  assert.equal(await brightness(restored).inputValue(), '2')
  assert.equal(await rendered(restored).count(), 1)
  assert.equal(await restored.locator('#undo').isEnabled(), false)

  const assetPosts = []
  restored.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/editor-session/assets/')) assetPosts.push(request.url())
  })
  await restored.locator('[data-tool=edit]').click()
  await restored.getByText('Reference.png', { exact: true }).first().waitFor()
  assert.equal(await restored.locator('#prompt').inputValue(), 'Change <image2>')
  const autosave = waitForSave(restored)
  await restored.locator('#prompt').fill('After the restart')
  await autosave
  assert.deepEqual(assetPosts, [])
  assert.equal((await readSaved()).workspace.workflow.prompts.edit.prompt, 'After the restart')

  const screenshots = process.env.PIXELBENCH_SCREENSHOTS
  for (const width of [1360, 1200, 960, 700, 600, 440, 390, 320]) {
    await restored.setViewportSize({ width, height: 900 })
    const groups = await restored.locator('.topbar').evaluate((bar) =>
      [...bar.children].map((group) => {
        const { left, top, bottom } = group.getBoundingClientRect()
        const right = Math.max(...[...group.children].map((child) => child.getBoundingClientRect().right))
        return { left, top, bottom, right }
      })
    )
    for (const [i, a] of groups.entries()) {
      assert.ok(a.right <= width, `Toolbar group overflows at ${width}px: ${JSON.stringify(groups)}`)
      for (const b of groups.slice(i + 1)) {
        assert.ok(
          a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left,
          `Toolbar groups overlap at ${width}px: ${JSON.stringify(groups)}`
        )
      }
    }
    if (screenshots && (width === 1360 || width === 390))
      await restored
        .locator('.topbar')
        .screenshot({ path: join(screenshots, `pixelbench-session-toolbar-${width}.png`) })
  }

  await checkAutosaveSettings(restored, screenshots)

  const other = await openEditor(context, true)
  await other.locator('#settings').click()
  const toggle = other.getByRole('switch', { name: 'Save session automatically' })
  const delay = other.getByRole('spinbutton', { name: 'Delay in seconds' })
  assert.equal(await toggle.getAttribute('aria-checked'), 'false')
  assert.equal(await delay.inputValue(), '3')
  await toggle.click()
  assert.equal(await delay.isEnabled(), true)
  assert.equal(await delay.inputValue(), '3')
  await other.locator('#config-close').click()
  await other.getByRole('button', { name: 'Restore session', exact: true }).waitFor()
  await other.locator('#prompt').fill('A draft in a second tab')
  const confirm = other.waitForEvent('dialog').then(async (dialog) => {
    assert.match(dialog.message(), /Replace the saved session/)
    await dialog.dismiss()
  })
  await other.getByRole('button', { name: 'Save session now', exact: true }).click()
  await confirm
  assert.equal((await readSaved()).workspace.workflow.prompts.edit.prompt, 'Save manually with autosave off')
  await checkStorageDeletion(other)

  assert.deepEqual(errors, [])
  console.log(
    'OK: autosave and its settings, restore after server restart, mask, adjustments, references, variants and responsive toolbar'
  )
} finally {
  await browser?.close()
  await stopServer()
  await rm(temp, { recursive: true, force: true })
}

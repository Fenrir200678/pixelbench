/* global document, DataTransfer, DragEvent */
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { profiles } from '../server/profiles.mjs'

// Focused UI check against Vite with mocked backend; no model generation.
const profile = structuredClone(profiles.find((p) => p.definition.id === 'qwen21').definition)
Object.assign(profile, {
  ready: true,
  available: true,
  blockers: [],
  modelMissing: {},
  catalog: {},
  candidates: {},
  selected: {},
  choices: {}
})
for (const slot of profile.models) {
  const key = slot.node + '.' + slot.input
  profile.catalog[key] = profile.candidates[key] = [slot.files[0]]
  profile.selected[key] = slot.files[0]
}
for (const [key, field] of Object.entries(profile.parameters)) {
  if (typeof field.default === 'string') profile.choices[key] = [field.default]
}
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true
})
const screenshots = process.env.PIXELBENCH_SCREENSHOTS
try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } })
  const errors = []
  let request
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/api\//, (route) => {
    const path = new URL(route.request().url()).pathname
    let data = {}
    if (path === '/api/status') data = { state: 'ready', mode: 'managed', profiles: [profile] }
    else if (path === '/api/logs') data = { cursor: 0, stream: 'test', entries: [] }
    else if (path === '/api/session') data = { session: 'test' }
    else if (path.endsWith('/jobs')) {
      request = route.request().postDataJSON()
      data = { id: 'test', stage: 'error', message: 'Test: request captured' }
    }
    return route.fulfill({ json: data })
  })
  await page.goto(process.env.PIXELBENCH_URL ?? 'http://127.0.0.1:5173')
  const jpeg = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 512
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#8bdfc6'
    ctx.fillRect(0, 0, 512, 512)
    return c.toDataURL('image/jpeg').split(',')[1]
  })
  const file = (name) => ({ name, buffer: Buffer.from(jpeg, 'base64'), mimeType: 'image/jpeg' })
  await page.locator('#file').setInputFiles(file('Start.jpg'))
  await page.locator('.reference-card').waitFor()
  await page.locator('#ref-file').setInputFiles([file('Hat.jpg'), file('Style.jpg')])
  await page.waitForFunction(() => document.querySelectorAll('.reference-card').length === 3)
  await page.locator('.reference-area').evaluate((element, base64) => {
    const transfer = new DataTransfer()
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    transfer.items.add(new File([bytes], 'Drop.jpg', { type: 'image/jpeg' }))
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  }, jpeg)
  await page.waitForFunction(() => document.querySelectorAll('.reference-card').length === 4)
  const prompt = page.locator('#prompt')
  await prompt.fill('Before  after')
  await prompt.evaluate((element) => {
    element.focus()
    element.setSelectionRange(7, 7)
  })
  await prompt.press('<')
  assert.equal(await page.locator('#image-suggestions').getByRole('option').count(), 4)
  await prompt.press('ArrowDown')
  await prompt.press('Enter')
  assert.equal(await prompt.inputValue(), 'Before <image2> after')
  assert.equal(await prompt.evaluate((element) => element.selectionStart), 15)
  await prompt.press('<')
  await prompt.press('ArrowUp')
  await prompt.press('Enter')
  assert.equal(await prompt.inputValue(), 'Before <image2><image4> after')
  await prompt.fill('<imag')
  await prompt.press('Escape')
  assert.equal(await page.getByRole('listbox').count(), 0)
  await prompt.fill('Use <image1> <image2> <image3> <image4>')
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/jobs')),
    page.locator('#generate').click()
  ])
  assert.equal(request.references.length, 3)
  assert.ok(request.references.every((payload) => payload.length > 0))
  await page.getByRole('button', { name: 'Referenzbild entfernen <image2>', exact: true }).click()
  assert.equal(await prompt.inputValue(), 'Use <image1>  <image2> <image3>')
  assert.match(await page.locator('.reference-card').nth(1).textContent(), /Style.jpg/)
  assert.equal(await page.locator('.reference-card canvas').count(), 3)
  await prompt.fill('<image3')
  assert.equal(await page.locator('#image-suggestions').getByRole('option').count(), 1)
  await page.locator('#image-suggestions').getByRole('option').click()
  assert.equal(await prompt.inputValue(), '<image3>')
  await prompt.press('Tab')
  if (screenshots) await page.screenshot({ path: screenshots + '/references.png' })
  await page.locator('#file').setInputFiles(file('New.jpg'))
  await page.waitForFunction(() => document.querySelectorAll('.reference-card').length === 1)
  assert.equal(await prompt.inputValue(), '')
  assert.deepEqual(errors, [])
  console.log(
    'OK reference thumbnails, multiple files, drop, autocomplete, cursor, keyboard, mouse, request, removal and document reset'
  )
} finally {
  await browser.close()
}

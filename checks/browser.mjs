import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { encode, decode } from '../server/png.mjs'
import { chromePath } from './chrome.mjs'

const origin = process.env.PIXELBENCH_URL ?? 'http://127.0.0.1:3720'
const screenshots = process.env.PIXELBENCH_SCREENSHOTS
const testRoot = await mkdtemp(join(tmpdir(), 'pixelbench-browser-'))
const browser = await chromium.launch({ executablePath: chromePath, headless: true })
const context = await browser.newContext({
  viewport: { width: 1360, height: 880 },
  acceptDownloads: true,
  deviceScaleFactor: 1
})
const page = await context.newPage()
const errors = []
const requests = []
let downloads = 0
page.on('pageerror', (error) => errors.push(error.message))
page.on('request', (request) => {
  if (request.method() === 'POST' && /\/jobs$/.test(request.url())) requests.push(request.postDataJSON())
})
page.on('download', () => downloads++)
const locator = (id) => page.locator('#' + id)
const inputFile = (name, buffer) => locator('file').setInputFiles({ name, buffer, mimeType: 'image/png' })
const pick = async (field, value) => {
  await field.click()
  await field
    .locator('xpath=..')
    .locator('[role=option]')
    .and(page.locator(`[data-value="${value.replaceAll('\\', '\\\\')}"]`))
    .click()
}
const fill = async (id, value) => {
  await locator(id).fill(String(value))
  await locator(id).press('Tab')
}
const currentLabel = (id, pattern) =>
  page.waitForFunction(
    ([id, source]) => new RegExp(source).test(document.getElementById(id).textContent),
    [id, pattern.source],
    { timeout: 110000 }
  )
const bg = 'a simple sky-blue geometric illustration with an orange disk and a sage-green ground'
const editPrompt = 'Change the orange disk to a bright blue disk. Preserve the other composition.'

function imageData(w, h) {
  const data = Buffer.alloc(w * h * 4, 255)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const color =
        Math.hypot(x - w / 2, y - h / 2) < 59 ? [224, 112, 32] : y > h * 0.68 ? [138, 161, 111] : [168, 197, 216]
      data.set(color, (y * w + x) * 4)
    }
  data.set([231, 149, 57, 0], 8)
  data.set([223, 64, 7, 144], 12)
  return data
}
const w = 384,
  h = 320
const original = imageData(w, h)
const inputPng = encode(w, h, original)

async function generate(count, button = 'generate') {
  await locator(button).click()
  await page.waitForFunction(
    (expected) =>
      document.querySelectorAll('.variant-card').length === expected ||
      (!document.getElementById('notice').hidden && !document.getElementById('notice').classList.contains('good')),
    count,
    { timeout: 240000 }
  )
  assert.equal(await page.locator('.variant-card').count(), count, await locator('notice').textContent())
}

async function exportOne(expected) {
  const event = page.waitForEvent('download')
  await locator('export').click()
  const download = await event
  const path = join(testRoot, download.suggestedFilename())
  assert.equal(dirname(path), testRoot)
  await download.saveAs(path)
  assert.equal((await readdir(testRoot)).filter((f) => f === download.suggestedFilename()).length, 1)
  const png = decode(await readFile(path))
  assert.deepEqual([png.width, png.height], expected)
  return png.data
}

async function workspacePixel(x, y) {
  await page.mouse.move(12, 64)
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  return locator('stage-canvas').evaluate(
    (canvas, [x, y]) => {
      const box = canvas.getBoundingClientRect()
      return [...canvas.getContext('2d').getImageData(Math.floor(x - box.left), Math.floor(y - box.top), 1, 1).data]
    },
    [x, y]
  )
}

async function waitNoJobFiles() {
  const runtime = resolve(process.env.PIXELBENCH_STATE ?? '.', '.runtime')
  for (const dir of await readdir(runtime)) {
    if (!/^worker-[0-9a-f-]{36}$/.test(dir)) continue
    for (const sub of ['input', 'temp', 'output']) {
      const path = join(runtime, dir, sub)
      try {
        await access(path)
      } catch {
        continue
      }
      const children = await readdir(path, { recursive: true, withFileTypes: true })
      assert.deepEqual(
        children.filter((file) => file.isFile()).map((file) => file.name),
        [],
        path
      )
    }
  }
}

try {
  await page.goto(origin)
  await locator('open').locator('svg').waitFor()
  await currentLabel('backend-label', /ComfyUI lokal/)
  assert.equal(await locator('profile').getAttribute('data-value'), 'qwen21-turbo')
  if (screenshots) await page.screenshot({ path: join(screenshots, 'pixelbench-empty.png') })
  await inputFile('Retusche.png', inputPng)
  await currentLabel('image-meta', /384 × 320/)
  await page.locator('[data-tool=inpaint]').click()
  await locator('zoom-in').click()
  const box = await locator('stage-canvas').boundingBox()
  let x = box.x + box.width / 2,
    y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(x + 27, y - 13, { steps: 4 })
  await page.mouse.up({ button: 'middle' })
  x += 27
  y -= 13
  const prior = await workspacePixel(x, y)
  assert.deepEqual(prior, [224, 112, 32, 255])
  await locator('brush').click()
  await locator('context').focus()
  await page.mouse.click(x, y)
  assert.equal(await page.evaluate(() => document.activeElement.id), 'stage-canvas')
  await page.keyboard.press('c')
  assert.equal(await locator('generation-frame-tool').getAttribute('aria-pressed'), 'true')
  await page.keyboard.press('c')
  assert.equal(await locator('generation-frame-tool').getAttribute('aria-pressed'), 'false')
  const painted = await workspacePixel(x, y)
  assert.notDeepEqual(painted, prior)
  await page.mouse.click(x, y, { button: 'right' })
  assert.deepEqual(await workspacePixel(x, y), prior)
  assert.equal(await locator('brush').getAttribute('aria-pressed'), 'true')
  await locator('undo').click()
  assert.deepEqual(await workspacePixel(x, y), painted)
  assert.equal(await locator('actual').textContent(), '125 %')
  console.log('OK Import, Maske bei 125 %, Verschieben, Radierer, Undo')

  await page.locator('[data-tool=edit]').click()
  await pick(locator('profile'), 'qwen21')
  assert.match(await locator('profile-note').textContent(), /Qwen-Image 2.1 Diffusionsmodell fehlt.*Suchpfad/)
  assert.equal(await locator('generate').isDisabled(), true)
  await pick(locator('profile'), 'qwen21-turbo')
  const diffusion = page.locator('[data-model="unet.unet_name"]')
  await diffusion.click()
  const installed = await diffusion
    .locator('xpath=..')
    .locator('[role=option]')
    .evaluateAll((options) => options.map((option) => option.dataset.value))
  await diffusion.press('Escape')
  await diffusion.blur()
  const int8 = installed.find((file) => file.includes('turbo_int8_convrot'))
  const bf16 = installed.find((file) => file.includes('turbo_bf16'))
  assert.ok(int8 && bf16)
  await pick(diffusion, bf16)
  assert.match(await diffusion.inputValue(), /turbo_bf16/)
  await pick(diffusion, int8)
  assert.equal(await locator('slider-gen-w').isDisabled(), true)
  await locator('auto-size').uncheck()
  if ((await locator('size-lock').getAttribute('aria-pressed')) === 'true') await locator('size-lock').click()
  await locator('slider-gen-w').press('Home')
  await locator('slider-gen-w').press('ArrowRight')
  assert.equal(await locator('gen-w').inputValue(), '288')
  await fill('gen-w', 519)
  await fill('gen-h', 509)
  assert.equal(await locator('slider-gen-w').inputValue(), '512')
  assert.match(await locator('effective-size').textContent(), /512 × 512 px ↺/)
  await locator('slider-parameter-cfg').press('Home')
  await locator('slider-parameter-cfg').press('ArrowRight')
  assert.equal(await locator('parameter-cfg').inputValue(), '1.1')
  await fill('parameter-cfg', 1)
  if ((await locator('seed-lock').getAttribute('aria-pressed')) === 'false') await locator('seed-lock').click()
  await fill('seed', 330001)
  await fill('prompt', editPrompt)
  await locator('ref-file').setInputFiles({ name: 'Referenz.png', buffer: inputPng, mimeType: 'image/png' })
  await page.getByTitle('Referenz.png', { exact: true }).waitFor()
  await generate(1)
  assert.equal(requests[0].models['unet.unet_name'], int8)
  await page.getByRole('button', { name: 'Referenzbild entfernen <image2>', exact: true }).click()
  await fill('seed', 330002)
  await generate(2)
  assert.equal(await locator('document-status').textContent(), 'Retusche.png')
  await page.keyboard.press('ArrowLeft')
  assert.match(await locator('stage-mode').textContent(), /330001/)
  assert.equal(await locator('actual').textContent(), '125 %')
  const shown = () => page.locator('#compare-state [aria-pressed=true]').textContent()
  assert.equal(await shown(), 'Nachher')
  await page.keyboard.press('v')
  assert.equal(await shown(), 'Vorher')
  await page.locator('#compare-state button', { hasText: 'Nachher' }).click()
  assert.equal(await shown(), 'Nachher')
  await page.keyboard.press('v')
  assert.equal(await locator('variant-counter').textContent(), '1/2')
  assert.equal(await locator('actual').textContent(), '125 %')
  await locator('console-toggle').click()
  await locator('console-panel').waitFor({ state: 'visible' })
  await currentLabel('console-log', /ComfyUI verbunden/)
  const config = await (await page.request.get(origin + '/api/config')).json()
  if (config.memory !== 'low') await currentLabel('console-log', /Cache verwendet ·[^\n]*CLIPLoader/)
  await locator('console-toggle').click()
  await locator('console-panel').waitFor({ state: 'hidden' })
  if (screenshots) await page.screenshot({ path: join(screenshots, 'pixelbench-compare.png') })
  await locator('apply').click()
  assert.match(await locator('document-status').textContent(), /•/)
  await locator('variant-baseline').click()
  assert.equal(await page.locator('.variant-card').first().getAttribute('data-baseline'), 'true')
  await locator('undo').click()
  assert.equal(await page.locator('.variant-card').first().getAttribute('data-baseline'), 'false')
  await locator('undo').click()
  assert.equal(await locator('document-status').textContent(), 'Retusche.png')
  await fill('prompt', 'Dieser Prompt darf beim Replay nicht verwendet werden.')
  await fill('seed', 773420)
  await page.locator('#model-settings summary').click()
  await pick(diffusion, bf16)
  await page.locator('#model-settings summary').click()
  await page.locator('.variant-card').first().click()
  await generate(3, 'replay')
  assert.deepEqual(requests[2].size, [512, 512])
  assert.equal(requests[0].references.length, 1)
  assert.ok(Object.values(requests[2].models).some((model) => model.includes('qwen_image_2.1_turbo')))
  for (const field of ['seed', 'prompt', 'image', 'references', 'mask', 'parameters', 'profile', 'size', 'models']) {
    assert.deepEqual(requests[2][field], requests[0][field], field)
  }
  await page.locator('#model-settings summary').click()
  await pick(diffusion, int8)
  await page.locator('#model-settings summary').click()
  console.log('OK Modellauswahl und Originalgewichte beim Replay, Slider und Zahlenfeld, Canvas-Rechtsklick und Undo')

  await page.locator('[data-tool=inpaint]').click()
  assert.equal(await locator('profile').getAttribute('data-value'), 'sdxl-inpaint')
  await fill('prompt', 'a flat emerald green circular ceramic disk, on a blue sky and sage background')
  await fill('context', 76)
  await fill('feather', 7)
  await fill('parameter-steps', 18)
  await generate(4)
  await locator('apply').click()
  const dialogPromise = page.waitForEvent('dialog', { timeout: 5000 })
  const navigation = page.reload({ timeout: 7000 }).catch(() => {})
  const closeWarning = await dialogPromise
  assert.equal(closeWarning.type(), 'beforeunload')
  await closeWarning.dismiss()
  await navigation
  const retouch = await exportOne([w, h])
  let edits = 0
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) {
      const i = (yy * w + xx) * 4
      const matches = original.subarray(i, i + 4).equals(retouch.subarray(i, i + 4))
      if (Math.hypot(xx - w / 2 + 0.5, yy - h / 2 + 0.5) > 25)
        assert.equal(matches, true, 'Pixel outside mask ' + xx + ',' + yy)
      if (!matches) edits++
    }
  assert.ok(edits > 100, 'The local inpaint actually changed the source.')
  assert.equal(downloads, 1)
  assert.deepEqual(await readdir(testRoot), ['Retusche-bearbeitet.png'])
  await waitNoJobFiles()
  assert.equal(await locator('document-status').textContent(), 'Retusche.png')
  console.log(
    'OK SDXL-Retusche, native Tab-Warnung, PNG mit',
    edits,
    'geänderten Pixeln innerhalb der Maske, ein Export'
  )

  // A new document closes the previous session. Drop simulates the browser's File drag payload.
  const closed = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/close'))
  await page.locator('#stage').evaluate(
    (element, bytes) => {
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(new File([Uint8Array.from(bytes)], 'Erweiterung.png', { type: 'image/png' }))
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
    },
    [...inputPng]
  )
  await closed
  await currentLabel('document-status', /Erweiterung\.png/)
  assert.equal(await page.locator('.variant-card').count(), 0)
  await page.locator('[data-tool=outpaint]').click()
  const placed = await locator('stage-canvas').boundingBox()
  const centerX = placed.x + placed.width / 2,
    centerY = placed.y + placed.height / 2
  const currentW = Number(await locator('frame-width').inputValue())
  const rightHandle = centerX + w / 2 + currentW - w
  await page.mouse.move(rightHandle, centerY)
  await page.mouse.down()
  await page.mouse.move(rightHandle + 28, centerY, { steps: 5 })
  await page.mouse.up()
  assert.equal(Number(await locator('frame-width').inputValue()), currentW + 28)
  const leftHandle = centerX - w / 2
  await page.mouse.move(leftHandle, centerY)
  await page.mouse.down()
  await page.mouse.move(leftHandle - 74, centerY, { steps: 5 })
  await page.mouse.up()
  const topHandleX = centerX + (currentW + 28 - w - 74) / 2
  const topHandleY = centerY - h / 2
  await page.mouse.move(topHandleX, topHandleY)
  await page.mouse.down()
  await page.mouse.move(topHandleX, topHandleY - 51, { steps: 5 })
  await page.mouse.up()
  await fill('frame-width', 512)
  await fill('frame-height', 448)
  await fill('transition', 0)
  await fill('prompt', bg)
  await generate(1)
  const variant = page.locator('.variant-card').first()
  await locator('variant-baseline').click()
  assert.equal(await variant.getAttribute('data-baseline'), 'true')
  await locator('undo').click()
  assert.equal(await variant.getAttribute('data-baseline'), 'false')
  await locator('redo').click()
  assert.equal(await variant.getAttribute('data-baseline'), 'true')
  const outpaint = await exportOne([512, 448])
  for (let yy = 0; yy < h; yy++) {
    const start = ((yy + 51) * 512 + 74) * 4
    assert.deepEqual(outpaint.subarray(start, start + w * 4), original.subarray(yy * w * 4, (yy + 1) * w * 4))
  }
  assert.equal(outpaint[3], 255)
  await waitNoJobFiles()
  console.log('OK SDXL-Outpaint, Variante per Canvas-Button als Startbild, Undo/Redo und pixelgenauer Export')

  await page.locator('[data-tool=edit]').click()
  await fill('prompt', editPrompt)
  await locator('generate').click()
  await locator('cancel').waitFor({ state: 'visible' })
  await page.waitForFunction(() => document.getElementById('job-state').textContent.startsWith('Sampling'), null, {
    timeout: 60000
  })
  await locator('cancel').click()
  await currentLabel('notice', /abgebrochen/)
  assert.equal(await page.locator('.variant-card').count(), 1)
  await waitNoJobFiles()
  assert.deepEqual(errors, [])
  await page.close({ runBeforeUnload: true })
  console.log('OK Abbruch und temporäre Job-Ordner bereinigt')
} finally {
  await browser.close()
  const target = relative(tmpdir(), testRoot)
  if (target.startsWith('pixelbench-browser-') && !isAbsolute(target) && !target.includes('..')) {
    await rm(testRoot, { recursive: true, force: true })
  }
}

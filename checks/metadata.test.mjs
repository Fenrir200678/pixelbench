import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { parseForge } from '../src/metadata/forge.ts'
import { parseComfy } from '../src/metadata/comfyui.ts'
import { pngText } from '../src/metadata/png-text.ts'
import { exifComment } from '../src/metadata/exif.ts'

const forgeText = [
  'A close-up of an alien necromancer, inspired by <lora:giger:0.8>',
  'second line of the prompt',
  'Negative prompt: blurry, lowres',
  'Steps: 20, Sampler: Euler, Schedule type: Simple, CFG scale: 1, Distilled CFG Scale: 3.5, Seed: 1747809289, ' +
    'Size: 1152x896, Model hash: c161224931, Model: flux1-dev-bnb-nf4, Lora hashes: "giger: a1b2, x: c3", ' +
    'Version: f2.0.1v1.10.1-previous-298-g243952f3'
].join('\n')

test('Forge parameters split into prompt, negative prompt and settings, with quoted values', () => {
  const info = parseForge(forgeText)
  assert.equal(info.source, 'forge')
  assert.equal(
    info.prompt,
    'A close-up of an alien necromancer, inspired by <lora:giger:0.8>\nsecond line of the prompt'
  )
  assert.equal(info.negative, 'blurry, lowres')
  const value = (key) => info.fields.find((field) => field.key === key)?.value
  assert.equal(value('Steps'), '20')
  assert.equal(value('Schedule type'), 'Simple')
  assert.equal(value('Distilled CFG Scale'), '3.5')
  assert.equal(value('Size'), '1152x896')
  assert.equal(value('Lora hashes'), 'giger: a1b2, x: c3')
  assert.equal(value('Version'), 'f2.0.1v1.10.1-previous-298-g243952f3')
  // A prompt without settings keeps its last line.
  assert.deepEqual(parseForge('just a prompt\nwith two lines').prompt, 'just a prompt\nwith two lines')
})

test('ComfyUI settings follow the sampler links to prompts, loaders and the latent', () => {
  const graph = {
    4: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'SDXL\\model.safetensors' } },
    5: { class_type: 'EmptyLatentImage', inputs: { width: 1216, height: 832, batch_size: 1 } },
    6: { class_type: 'CLIPTextEncode', inputs: { text: ['10', 0], clip: ['4', 1] } },
    7: { class_type: 'CLIPTextEncode', inputs: { text: 'bad hands', clip: ['4', 1] } },
    8: { class_type: 'LoraLoader', inputs: { lora_name: 'style\\ink.safetensors', strength_model: 0.7 } },
    10: { class_type: 'PrimitiveString', inputs: { value: 'a fox in snow' } },
    3: {
      class_type: 'KSampler',
      inputs: {
        model: ['8', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
        seed: 42,
        steps: 25,
        cfg: 6,
        sampler_name: 'dpmpp_2m',
        scheduler: 'karras',
        denoise: 1
      }
    }
  }
  const info = parseComfy(JSON.stringify(graph), '{"nodes":[]}')
  assert.equal(info.prompt, 'a fox in snow')
  assert.equal(info.negative, 'bad hands')
  const value = (key) => info.fields.find((field) => field.key === key)?.value
  assert.equal(value('Seed'), '42')
  assert.equal(value('Sampler'), 'dpmpp_2m')
  assert.equal(value('Size'), '1216x832')
  assert.equal(value('LoRAs'), 'ink.safetensors 0.7')
  assert.deepEqual(
    info.raw.map(({ key }) => key),
    ['prompt', 'workflow']
  )
  assert.equal(parseComfy('not json'), undefined)
})

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  data.copy(out, 8)
  return out
}

test('PNG text chunks are read from tEXt, zTXt and iTXt', async () => {
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', Buffer.alloc(13)),
    chunk('tEXt', Buffer.from('parameters\0a red fox', 'latin1')),
    chunk('zTXt', Buffer.concat([Buffer.from('prompt\0\0', 'latin1'), deflateSync('{"1":{}}')])),
    chunk('iTXt', Buffer.concat([Buffer.from('workflow\0\0\0en\0\0', 'latin1'), Buffer.from('{"ü":1}')])),
    chunk('IEND', Buffer.alloc(0))
  ])
  assert.deepEqual(await pngText(new Uint8Array(png)), {
    parameters: 'a red fox',
    prompt: '{"1":{}}',
    workflow: '{"ü":1}'
  })
})

// A big-endian TIFF block with an EXIF IFD that holds a UNICODE UserComment, as Forge writes it.
function tiffWithComment(text) {
  const comment = Buffer.concat([Buffer.from('UNICODE\0', 'latin1'), Buffer.from(text, 'utf16le').swap16()])
  const tiff = Buffer.alloc(8 + 18 + 18 + comment.length)
  tiff.write('MM', 0, 'latin1')
  tiff.writeUInt16BE(42, 2)
  tiff.writeUInt32BE(8, 4)
  tiff.writeUInt16BE(1, 8)
  tiff.writeUInt16BE(0x8769, 10)
  tiff.writeUInt16BE(4, 12)
  tiff.writeUInt32BE(1, 14)
  tiff.writeUInt32BE(26, 18)
  tiff.writeUInt16BE(1, 26)
  tiff.writeUInt16BE(0x9286, 28)
  tiff.writeUInt16BE(7, 30)
  tiff.writeUInt32BE(comment.length, 32)
  tiff.writeUInt32BE(44, 36)
  comment.copy(tiff, 44)
  return tiff
}

test('the EXIF UserComment of a JPEG and a WebP is read as UTF-16', () => {
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiffWithComment('a fox, Steps: 20')])
  const app1 = Buffer.alloc(4)
  app1.writeUInt16BE(0xffe1, 0)
  app1.writeUInt16BE(exif.length + 2, 2)
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), app1, exif, Buffer.from([0xff, 0xda])])
  assert.equal(exifComment(new Uint8Array(jpeg)), 'a fox, Steps: 20')

  const body = tiffWithComment('webp fox')
  const header = Buffer.alloc(8)
  header.write('EXIF', 0, 'latin1')
  header.writeUInt32LE(body.length, 4)
  const webp = Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBP', 'latin1'), header, body])
  assert.equal(exifComment(new Uint8Array(webp)), 'webp fox')
  assert.equal(exifComment(new Uint8Array([1, 2, 3])), undefined)
})

test('Forge settings map sampler, scheduler, LoRA tags and size for Pixelbench', async () => {
  const { settingsOf, forgeSampler } = await import('../src/metadata/settings.ts')
  assert.deepEqual(forgeSampler('DPM++ 2M Karras'), { sampler: 'dpmpp_2m', scheduler: 'karras' })
  assert.deepEqual(forgeSampler('DPM++ 2M SDE'), { sampler: 'dpmpp_2m_sde', scheduler: undefined })
  assert.deepEqual(forgeSampler('Euler a'), { sampler: 'euler_ancestral', scheduler: undefined })
  const settings = settingsOf(parseForge(forgeText))
  assert.equal(settings.prompt, 'A close-up of an alien necromancer, inspired by\nsecond line of the prompt')
  assert.deepEqual(settings.loras, [{ name: 'giger', strength: 0.8 }])
  assert.deepEqual(settings.parameters, { steps: 20, cfg: 1, guidance: 3.5, sampler: 'euler', scheduler: 'simple' })
  assert.equal(settings.seed, 1747809289)
  assert.deepEqual(settings.size, [1152, 896])
})

test('Pixelbench writes Forge text and its own record, and reads its record back', async () => {
  const { generationText, parsePixelbench } = await import('../src/metadata/pixelbench.ts')
  const { withPngText, crc32 } = await import('../src/metadata/png-write.ts')
  const record = {
    tool: 'create',
    profile: 'sdxl-t2i',
    prompt: 'a fox, in snow',
    negative: 'blurry',
    seed: 7,
    size: [1216, 832],
    parameters: { steps: 25, sampler: 'euler', scheduler: 'karras', cfg: 5 },
    models: { 'checkpoint.ckpt_name': 'SDXL/model.safetensors' },
    loras: [{ name: 'style/ink.safetensors', strength: 0.7 }]
  }
  const entries = generationText(record)
  const forge = parseForge(entries[0].value)
  assert.equal(forge.prompt, 'a fox, in snow <lora:ink:0.7>')
  assert.equal(forge.negative, 'blurry')
  assert.equal(forge.fields.find(({ key }) => key === 'Model').value, 'model.safetensors')
  const info = parsePixelbench(entries[1].value, entries)
  assert.equal(info.source, 'pixelbench')
  assert.equal(info.prompt, 'a fox, in snow')
  assert.equal(info.fields.find(({ key }) => key === 'LoRAs').value, 'ink.safetensors 0.7')

  // The written chunks come back through the reader, with valid CRCs.
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', Buffer.alloc(13)),
    chunk('IEND', Buffer.alloc(0))
  ])
  const written = withPngText(new Uint8Array(png), entries)
  assert.deepEqual(Object.keys(await pngText(written)), ['parameters', 'pixelbench'])
  const length = new DataView(written.buffer).getUint32(33)
  const stored = new DataView(written.buffer).getUint32(33 + 8 + length)
  assert.equal(stored, crc32(written.subarray(37, 41 + length)))
})

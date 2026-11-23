import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  blend,
  cropForMask,
  editTransitionMask,
  expandedRect,
  featherInward,
  fitSize,
  growMask,
  maskIntersects,
  outpaintMask,
  placeOriginal,
  replaceRegion
} from '../src/image/pixels.ts'
import { decode, encode } from '../server/png.mjs'

test('generation size snaps to grid without writing back into the document', () => {
  const r = { grid: 64, min: 256, max: 1536, area: 2359296, target: 1024 }
  assert.deepEqual(fitSize(519, 509, r), [512, 512])
  assert.deepEqual(fitSize(9999, 87, r), [1536, 256])
  assert.deepEqual(cropForMask({ x: 1, y: 14, w: 12, h: 9 }, { x: 0, y: 0, w: 31, h: 40 }, 5), {
    x: 0,
    y: 9,
    w: 18,
    h: 19
  })
})

test('growing a mask adds a ring of the given radius and keeps an empty mask empty', () => {
  const w = 9,
    h = 9
  const dot = new Uint8ClampedArray(w * h)
  dot[4 * w + 4] = 255
  const grown = growMask(dot, w, h, 2)
  const at = (x, y) => grown[y * w + x]
  assert.equal(at(4, 4), 255)
  assert.equal(at(6, 4), 255)
  assert.equal(at(7, 4), 0)
  assert.equal(at(5, 5), 255)
  assert.equal(at(6, 6), 0)
  assert.equal(growMask(dot, w, h, 0), dot)
  assert.ok(growMask(new Uint8ClampedArray(w * h), w, h, 3).every((value) => value === 0))
})

test('inpainting preserves all RGBA bytes beyond the mask, including hidden RGB', () => {
  const original = Uint8ClampedArray.from({ length: 80 }, (_, i) => (i * 17) % 256)
  original[3] = 0
  const mask = new Uint8ClampedArray([0, 0, 0, 255, 255, 0])
  const effective = featherInward(mask, 3, 2, 1)
  const region = { x: 1, y: 1, w: 3, h: 2 }
  const result = blend(new Uint8ClampedArray(original), new Uint8ClampedArray(24).fill(220), 5, region, effective)
  const png = decode(encode(5, 4, Buffer.from(result)))
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 5; x++) {
      const p = (y * 5 + x) * 4
      if (y === 2 && (x === 1 || x === 2))
        assert.notDeepEqual(png.data.subarray(p, p + 4), Buffer.from(original.slice(p, p + 4)))
      else assert.deepEqual(png.data.subarray(p, p + 4), Buffer.from(original.slice(p, p + 4)))
    }
})

test('inpaint feather starts near zero at the boundary and reaches full opacity inward', () => {
  const w = 64
  const mask = new Uint8ClampedArray(w * w).fill(255)
  for (let y = 0; y < w; y++) mask.fill(0, y * w, y * w + 8)
  mask[32 * w + 45] = 0
  const effective = featherInward(mask, w, w, 10)
  const at = (x, y = 32) => effective[y * w + x]
  assert.equal(at(7), 0)
  assert.ok(at(8) > 0 && at(8) <= 3)
  assert.equal(at(8), at(63))
  for (let x = 8; x < 18; x++) assert.ok(at(x + 1) > at(x))
  assert.equal(at(18), 255)
  assert.equal(at(45), 0)
  assert.equal(at(44), at(8))
  assert.equal(at(46), at(8))
  assert.ok(at(44, 31) > at(44))
  assert.deepEqual(featherInward(mask, w, w, 0), mask)
})

test('a generation frame between disjoint mask marks does not enable inpainting', () => {
  const alpha = new Uint8ClampedArray([0, 255, 0, 0, 7, 0])
  const box = { x: 1, y: 0, w: 4, h: 1 }
  assert.equal(maskIntersects(alpha, 6, box, { x: 2, y: 0, w: 2, h: 1 }), false)
  assert.equal(maskIntersects(alpha, 6, box, { x: 3, y: 0, w: 2, h: 1 }), true)
  assert.equal(maskIntersects(alpha, 6, box, { x: 5, y: 0, w: 1, h: 1 }), false)
})

test('an unmasked edit replaces only the pixels within its generation frame', () => {
  const original = Uint8ClampedArray.from({ length: 4 * 3 * 4 }, (_, i) => i)
  const patch = new Uint8ClampedArray(2 * 2 * 4).fill(200)
  const result = replaceRegion(original.slice(), patch, 4, { x: 1, y: 1, w: 2, h: 2 })
  assert.deepEqual(result.slice(0, 20), original.slice(0, 20))
  assert.deepEqual(result.slice(20, 28), patch.slice(0, 8))
  assert.deepEqual(result.slice(28, 36), original.slice(28, 36))
  assert.deepEqual(result.slice(36, 44), patch.slice(8))
  assert.deepEqual(result.slice(44), original.slice(44))
})

test('a cropped edit blends internal edges and preserves the full edit at the center and flush edges', () => {
  const image = { x: -5, y: 15, w: 24, h: 22 }
  const crop = { x: 0, y: 3, w: 16, h: 12 }
  const original = new Uint8ClampedArray(image.w * image.h * 4).fill(40)
  const patch = new Uint8ClampedArray(crop.w * crop.h * 4).fill(240)
  const mask = editTransitionMask(image, crop, 64)
  const result = blend(original.slice(), patch, image.w, crop, mask)
  const pixel = (x, y) => result.slice((y * image.w + x) * 4, (y * image.w + x + 1) * 4)
  assert.deepEqual(pixel(18, 9), new Uint8ClampedArray([40, 40, 40, 40]))
  assert.deepEqual(pixel(8, 3), pixel(18, 9))
  assert.deepEqual(pixel(15, 9), pixel(18, 9))
  assert.deepEqual(pixel(8, 9), new Uint8ClampedArray([240, 240, 240, 240]))
  assert.deepEqual(pixel(0, 9), pixel(8, 9))
  assert.ok(pixel(13, 9)[3] > 40 && pixel(13, 9)[3] < 240)
  assert.equal(mask[6 * crop.w + 13], 128)
  assert.ok(mask[1 * crop.w + 13] < mask[6 * crop.w + 13])
})

test('outpainting respects asymmetric margins and changes only selected transition edges', () => {
  const frame = { x: 8, y: -3, w: 6, h: 5, pixels: new Uint8ClampedArray(6 * 5 * 4).fill(91) }
  const target = expandedRect(frame, { top: 2, left: 3, right: 0, bottom: 0 })
  const mask = outpaintMask(frame, target, 2)
  const region = { x: 0, y: 0, w: target.w, h: target.h }
  const patch = new Uint8ClampedArray(target.w * target.h * 4).fill(245)
  let output = blend(placeOriginal(frame, target), patch, target.w, region, mask)
  const get = (x, y) => output[(y * target.w + x) * 4 + 3]
  assert.deepEqual(target, { x: 5, y: -5, w: 9, h: 7 })
  assert.equal(get(3, 5), 245)
  assert.equal(get(4, 5), 168)
  assert.equal(get(8, 4), 91)
  assert.equal(get(1, 0), 245)
  output = blend(placeOriginal(frame, target), patch, target.w, region, outpaintMask(frame, target, 0))
  assert.equal(get(3, 2), 91)
  assert.equal(get(2, 2), 245)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  adjust,
  adjustFrame,
  autoLevels,
  brightnessValue,
  contrastValue,
  histogram,
  levelValue,
  neutralAdjustments,
  neutralLevels
} from '../src/image/adjust.ts'

const w = 4,
  h = 4
const pixels = new Uint8ClampedArray(w * h * 4)
for (let i = 0; i < w * h; i++) pixels.set([(i * 37) % 256, (i * 91) % 256, (i * 13 + 40) % 256, 200], i * 4)
const mean = (data, channel) => {
  let sum = 0
  for (let i = channel; i < data.length; i += 4) sum += data[i]
  return sum / (data.length / 4)
}
const settings = (values) => ({ ...neutralAdjustments, ...values })

test('neutral adjustments return an equal copy', () => {
  const result = adjust(pixels, w, h, neutralAdjustments)
  assert.notEqual(result, pixels)
  assert.deepEqual(result, pixels)
})

test('brightness raises every color channel and keeps alpha', () => {
  const result = adjust(pixels, w, h, settings({ brightness: 20 }))
  for (const c of [0, 1, 2]) assert.ok(mean(result, c) > mean(pixels, c))
  assert.equal(mean(result, 3), 200)
})

test('brightness moves midtones and keeps black and white', () => {
  for (const amount of [-100, -30, 30, 100]) {
    assert.equal(brightnessValue(amount, 0), 0)
    assert.equal(brightnessValue(amount, 1), 1)
    assert.equal(brightnessValue(amount, 0.5) > 0.5, amount > 0)
  }
  assert.ok(brightnessValue(30, 0.85) < 1)
})

test('contrast spreads midtones gently and keeps black and white', () => {
  for (const amount of [9, 50, 100]) {
    assert.equal(contrastValue(amount, 0), 0)
    assert.ok(Math.abs(contrastValue(amount, 1) - 1) < 1e-9)
    assert.ok(Math.abs(contrastValue(amount, 0.5) - 0.5) < 1e-9)
    assert.ok(contrastValue(amount, 0.25) < 0.25)
    assert.ok(contrastValue(amount, 0.75) > 0.75)
  }
  // A small step stays a small change.
  assert.ok(Math.abs(contrastValue(9, 0.25) - 0.25) * 255 < 2)
  assert.ok(contrastValue(100, 0.05) > 0)
})

test('negative contrast flattens toward mid gray', () => {
  assert.equal(contrastValue(-100, 0), 0.5)
  assert.equal(contrastValue(-100, 1), 0.5)
  assert.ok(contrastValue(-50, 0.2) > 0.2)
})

test('saturation -100 gives gray pixels', () => {
  const result = adjust(pixels, w, h, settings({ saturation: -100 }))
  for (let i = 0; i < result.length; i += 4) {
    assert.ok(Math.abs(result[i] - result[i + 1]) <= 1)
    assert.ok(Math.abs(result[i + 1] - result[i + 2]) <= 1)
  }
})

test('a full hue turn changes nothing', () => {
  const result = adjust(pixels, w, h, settings({ hue: 360 }))
  for (let i = 0; i < result.length; i++) assert.ok(Math.abs(result[i] - pixels[i]) <= 1)
})

test('warm temperature raises red and lowers blue', () => {
  const result = adjust(pixels, w, h, settings({ temperature: 50 }))
  assert.ok(mean(result, 0) > mean(pixels, 0))
  assert.ok(mean(result, 2) < mean(pixels, 2))
})

test('sharpening leaves a flat area unchanged', () => {
  const flat = new Uint8ClampedArray(w * h * 4).fill(120)
  assert.deepEqual(adjust(flat, w, h, settings({ sharpness: 100 })), flat)
})

test('a mask limits the change to the masked pixels', () => {
  const frame = { x: 0, y: 0, w, h, pixels }
  const mask = new Uint8ClampedArray(w * h)
  mask[5] = 255
  const result = adjustFrame(frame, settings({ brightness: 50 }), mask)
  assert.notEqual(result.pixels, frame.pixels)
  for (let i = 0; i < w * h; i++) {
    const changed = [0, 1, 2].some((c) => result.pixels[i * 4 + c] !== pixels[i * 4 + c])
    assert.equal(changed, i === 5, 'pixel ' + i)
  }
})

test('levels map the input range onto the output range', () => {
  const l = { ...neutralLevels, inBlack: 50, inWhite: 200 }
  assert.equal(levelValue(l, 50), 0)
  assert.equal(levelValue(l, 20), 0)
  assert.equal(levelValue(l, 200), 255)
  assert.equal(levelValue(l, 125), 127.5)
  assert.ok(levelValue({ ...neutralLevels, gamma: 2 }, 64) > 64)
  assert.equal(levelValue({ ...neutralLevels, outBlack: 20, outWhite: 220 }, 0), 20)
})

test('channel levels only change their channel', () => {
  const levels = { ...neutralAdjustments.levels, r: { ...neutralLevels, outWhite: 128 } }
  const result = adjust(pixels, w, h, settings({ levels }))
  assert.ok(mean(result, 0) < mean(pixels, 0))
  assert.equal(mean(result, 1), mean(pixels, 1))
  assert.equal(mean(result, 2), mean(pixels, 2))
})

test('histogram counts opaque pixels and auto levels stretch to their range', () => {
  const data = new Uint8ClampedArray([40, 40, 40, 255, 180, 180, 180, 255, 0, 0, 0, 0])
  const counts = histogram(data)
  assert.equal(counts.r[40], 1)
  assert.equal(counts.rgb[180], 1)
  assert.equal(counts.r[0], 0)
  assert.deepEqual(autoLevels(counts), { ...neutralLevels, inBlack: 40, inWhite: 180 })
})

test('blur leaves a flat area unchanged', () => {
  const flat = new Uint8ClampedArray(w * h * 4).fill(120)
  for (const blur of [0.5, 5]) assert.deepEqual(adjust(flat, w, h, settings({ blur })), flat)
})

test('blur softens edges with both the exact kernel and the box passes', () => {
  const size = 16
  const stripes = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < size * size; i++)
    stripes.set(
      Array(3)
        .fill(i % 2 ? 255 : 0)
        .concat(255),
      i * 4
    )
  const spread = (data) => {
    let low = 255,
      high = 0
    for (let i = 0; i < data.length; i += 4) ((low = Math.min(low, data[i])), (high = Math.max(high, data[i])))
    return high - low
  }
  const soft = adjust(stripes, size, size, settings({ blur: 1 }))
  const softer = adjust(stripes, size, size, settings({ blur: 4 }))
  assert.ok(spread(soft) < 255)
  assert.ok(spread(softer) < spread(soft))
  assert.equal(mean(softer, 3), 255)
})

test('blur scales its radius with the preview scale', () => {
  const values = settings({ blur: 2 })
  assert.deepEqual(adjust(pixels, w, h, values, 0.5), adjust(pixels, w, h, settings({ blur: 1 })))
})

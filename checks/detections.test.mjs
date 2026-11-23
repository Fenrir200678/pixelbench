import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placeTag } from '../src/image/detections.ts'

test('detection tags of neighboring boxes do not overlap', () => {
  const left = { x: 100, y: 100, w: 60, h: 80 }
  const right = { x: 150, y: 100, w: 60, h: 80 }
  const first = placeTag(left, 70, [])
  assert.deepEqual(first, { x: 100, y: 84, w: 70, h: 16 })
  // Both spots above collide with the first tag, so the second one moves into the top of its box.
  assert.deepEqual(placeTag(right, 70, [first]), { x: 150, y: 100, w: 70, h: 16 })
  // A wider gap leaves room above, right-aligned.
  assert.deepEqual(placeTag({ ...right, x: 160, w: 90 }, 70, [first]), { x: 180, y: 84, w: 70, h: 16 })
  // A box at the top edge puts the tag inside the box.
  assert.deepEqual(placeTag({ x: 0, y: 4, w: 50, h: 50 }, 40, []), { x: 0, y: 4, w: 40, h: 16 })
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bestPerClass, boxMask, decodeYolo, letterbox } from '../src/image/yolo.ts'
import { yoloModels } from '../server/app/yolo.mjs'

// A raw [1, 4 + classes, anchors] output, channel-major like Ultralytics' YOLOv8 and YOLO11 exports.
function raw(anchors, classes) {
  const data = new Float32Array((4 + classes) * anchors.length)
  anchors.forEach(({ box, scores }, index) => {
    box.forEach((value, channel) => (data[channel * anchors.length + index] = value))
    scores.forEach((value, label) => (data[(4 + label) * anchors.length + index] = value))
  })
  return { data, dims: [1, 4 + classes, anchors.length] }
}

test('a wide image is letterboxed into the middle of the square input', () => {
  assert.deepEqual(letterbox(1280, 640, 640), { size: 640, scale: 0.5, x: 0, y: 160 })
})

test('raw YOLO output is mapped back to image pixels and overlapping boxes are suppressed', () => {
  const fit = letterbox(1280, 640, 640)
  const { data, dims } = raw(
    [
      // Center 100, 260 and 40 × 40 in the input: corner 160, 160 and 80 × 80 in the image.
      { box: [100, 260, 40, 40], scores: [0.9] },
      // Nearly the same box with a lower score: suppressed.
      { box: [102, 260, 40, 40], scores: [0.6] },
      // Below the threshold.
      { box: [400, 300, 40, 40], scores: [0.2] },
      // A separate face.
      { box: [500, 300, 20, 20], scores: [0.7] }
    ],
    1
  )
  const boxes = decodeYolo(data, dims, fit, { w: 1280, h: 640 }, 0.3)
  assert.deepEqual(boxes, [
    { x: 160, y: 160, w: 80, h: 80, score: data[4 * 4], label: 0 },
    { x: 980, y: 260, w: 40, h: 40, score: data[4 * 4 + 3], label: 0 }
  ])
})

test('NMS-free output keeps its boxes and classes, clipped to the image', () => {
  const fit = letterbox(640, 640, 640)
  const data = new Float32Array([600, 600, 700, 700, 0.8, 1, 10, 10, 50, 50, 0.9, 0, 0, 0, 10, 10, 0.1, 0])
  const boxes = decodeYolo(data, [1, 3, 6], fit, { w: 640, h: 640 }, 0.25)
  assert.equal(boxes.length, 2)
  assert.deepEqual(boxes[0], { x: 10, y: 10, w: 40, h: 40, score: data[10], label: 0 })
  assert.deepEqual(boxes[1], { x: 600, y: 600, w: 40, h: 40, score: data[4], label: 1 })
  assert.throws(() => decodeYolo(data, [3, 6], fit, { w: 640, h: 640 }, 0.25), /Ausgabeformat/)
})

test('the limit applies per class and box masks fill whole pixels', () => {
  const box = (score, label) => ({ x: 0, y: 0, w: 1, h: 1, score, label })
  const kept = bestPerClass([box(0.9, 0), box(0.8, 1), box(0.7, 0), box(0.6, 0)], 2)
  assert.deepEqual(
    kept.map(({ score }) => score),
    [0.9, 0.8, 0.7]
  )
  const mask = boxMask({ x: 0.5, y: 1.2, w: 1, h: 1 }, 4, 4)
  assert.deepEqual([...mask], [0, 0, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 0, 0, 0, 0])
})

test('YOLO models are listed with their labels and odd files are skipped', async () => {
  const runtime = await mkdtemp(join(tmpdir(), 'pixelbench-yolo-'))
  try {
    const folder = join(runtime, 'models', 'yolo')
    await mkdir(folder, { recursive: true })
    await writeFile(join(folder, 'face.onnx'), '')
    await writeFile(join(folder, 'face.json'), JSON.stringify({ labels: ['face'] }))
    await writeFile(join(folder, 'coco.onnx'), '')
    await writeFile(join(folder, 'coco.json'), '{ broken')
    await writeFile(join(folder, '.hidden.onnx'), '')
    await writeFile(join(folder, 'notes.txt'), '')
    assert.deepEqual(await yoloModels(runtime), [
      { name: 'coco', labels: [] },
      { name: 'face', labels: ['face'] }
    ])
    assert.deepEqual(await yoloModels(join(runtime, 'missing')), [])
  } finally {
    await rm(runtime, { recursive: true, force: true })
  }
})

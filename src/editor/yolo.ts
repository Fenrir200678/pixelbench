import type { InferenceSession } from 'onnxruntime-web'
import { canvas, context2d, surface } from '../image/canvas.js'
import { decodeYolo, letterbox } from '../image/yolo.js'
import type { Frame } from '../types/image.js'

// YOLO detection for the detailer, in the browser with ONNX Runtime Web on the CPU. It needs no ComfyUI job and no
// VRAM, so the render models stay loaded. The runtime and each model load on first use.
const inputSize = 640
const runtime = () => import('onnxruntime-web/wasm')
const sessions = new Map<string, Promise<InferenceSession>>()

function session(model: string) {
  let pending = sessions.get(model)
  if (!pending) {
    pending = (async () => {
      const ort = await runtime()
      // The page is not cross-origin isolated, so WebAssembly threads are unavailable.
      ort.env.wasm.numThreads = 1
      const response = await fetch('/api/yolo/' + encodeURIComponent(model))
      if (!response.ok) throw new Error('Das YOLO-Modell konnte nicht geladen werden.')
      const bytes = new Uint8Array(await response.arrayBuffer())
      return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] })
    })()
    sessions.set(model, pending)
    pending.catch(() => sessions.delete(model))
  }
  return pending
}

// The letterboxed image as a planar RGB tensor in 0 to 1, on Ultralytics' gray.
function input(frame: Frame) {
  const fit = letterbox(frame.w, frame.h, inputSize)
  const board = canvas(inputSize, inputSize)
  const ctx = context2d(board)
  ctx.fillStyle = 'rgb(114, 114, 114)'
  ctx.fillRect(0, 0, inputSize, inputSize)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(surface(frame), fit.x, fit.y, frame.w * fit.scale, frame.h * fit.scale)
  const { data } = ctx.getImageData(0, 0, inputSize, inputSize)
  const plane = inputSize * inputSize
  const tensor = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    tensor[i] = data[i * 4] / 255
    tensor[plane + i] = data[i * 4 + 1] / 255
    tensor[2 * plane + i] = data[i * 4 + 2] / 255
  }
  return { fit, tensor }
}

/** Boxes in frame pixels, best first. */
export async function detectYolo(frame: Frame, model: string, threshold: number) {
  const [ort, current] = await Promise.all([runtime(), session(model)])
  const { fit, tensor } = input(frame)
  const feeds = { [current.inputNames[0]]: new ort.Tensor('float32', tensor, [1, 3, inputSize, inputSize]) }
  const output = (await current.run(feeds))[current.outputNames[0]]
  return decodeYolo(output.data as Float32Array, output.dims, fit, frame, threshold)
}

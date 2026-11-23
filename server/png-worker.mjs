import { parentPort } from 'node:worker_threads'
import { PNG } from 'pngjs'

// Runs PNG codec calls off the main thread so large images do not block the bridge event loop.
parentPort.on('message', ({ id, op, bytes, width, height }) => {
  try {
    if (op === 'decode') {
      const png = PNG.sync.read(Buffer.from(bytes))
      const data = new Uint8Array(png.data)
      parentPort.postMessage({ id, width: png.width, height: png.height, data }, [data.buffer])
    } else {
      const png = PNG.sync.write(
        { width, height, data: Buffer.from(bytes) },
        { colorType: 6, inputColorType: 6, deflateLevel: 3 }
      )
      const data = new Uint8Array(png)
      parentPort.postMessage({ id, data }, [data.buffer])
    }
  } catch (error) {
    parentPort.postMessage({ id, error: error.message })
  }
})

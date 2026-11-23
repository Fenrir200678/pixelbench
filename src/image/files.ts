import { errorOf } from '../api/client.js'
import type { Frame } from '../types/image.js'
import { canvas, context2d, surface } from './canvas.js'
import { validSize } from './pixels.js'

export type ExportFormat = 'png' | 'jpg'

// Reads the raw RGBA response of the bridge's PNG decoder.
export async function frameFromRawResponse(response: Response): Promise<Frame> {
  if (!response.ok) throw new Error(await errorOf(response))
  const w = Number(response.headers.get('X-Image-Width'))
  const h = Number(response.headers.get('X-Image-Height'))
  return { w, h, x: 0, y: 0, pixels: new Uint8ClampedArray(await response.arrayBuffer()) }
}

export async function importImage(file: Blob): Promise<Frame> {
  const png = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  if (png.join(',') === '137,80,78,71,13,10,26,10') {
    return frameFromRawResponse(await fetch('/api/png/decode', { method: 'POST', body: file }))
  }
  if (!['image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('Bitte eine PNG-, JPEG- oder WebP-Datei öffnen.')
  const image = await createImageBitmap(file)
  try {
    const { width: w, height: h } = image
    if (!validSize(w, h)) throw new Error('Das Bild überschreitet 8192 px pro Seite oder 24 MP.')
    const context = context2d(canvas(w, h))
    context.drawImage(image, 0, 0)
    return { w, h, x: 0, y: 0, pixels: context.getImageData(0, 0, w, h).data }
  } finally {
    image.close()
  }
}

export async function exportImage(frame: Frame, format: ExportFormat, quality = 0.95) {
  if (format === 'jpg') {
    const output = canvas(frame.w, frame.h)
    const context = context2d(output)
    context.fillStyle = '#fff'
    context.fillRect(0, 0, frame.w, frame.h)
    context.drawImage(surface(frame), 0, 0)
    return new Promise<Blob>((resolve, reject) => {
      output.toBlob(
        (blob) => {
          if (blob?.type === 'image/jpeg') resolve(blob)
          else reject(new Error('JPG konnte nicht erzeugt werden.'))
        },
        'image/jpeg',
        quality
      )
    })
  }
  const response = await fetch('/api/png/encode?w=' + frame.w + '&h=' + frame.h, {
    method: 'POST',
    body: new Blob([new Uint8ClampedArray(frame.pixels)], { type: 'application/octet-stream' })
  })
  if (!response.ok) throw new Error(await errorOf(response))
  return response.blob()
}

export function asBase64(c: HTMLCanvasElement) {
  return new Promise<string>((resolve, reject) =>
    c.toBlob((blob) => {
      if (!blob) return reject(new Error('PNG konnte nicht erzeugt werden.'))
      const reader = new FileReader()
      reader.onerror = () => reject(reader.error)
      reader.onload = () => resolve(String(reader.result).split(',')[1])
      reader.readAsDataURL(blob)
    }, 'image/png')
  )
}

import type { MetadataField } from './types.js'

// Writes generation data as iTXt chunks (UTF-8, uncompressed) right after the PNG header.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

export function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function textChunk({ key, value }: MetadataField) {
  const encoder = new TextEncoder()
  // Keyword, null, compression flag and method, empty language tag and translated keyword, then the text.
  const data = new Uint8Array([...encoder.encode(key), 0, 0, 0, 0, 0, ...encoder.encode(value)])
  const chunk = new Uint8Array(12 + data.length)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  chunk.set(encoder.encode('iTXt'), 4)
  chunk.set(data, 8)
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)))
  return chunk
}

export function withPngText(png: Uint8Array, entries: MetadataField[]) {
  if (!entries.length) return png
  // The signature and the IHDR chunk always take the first 33 bytes.
  const chunks = entries.map(textChunk)
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const result = new Uint8Array(png.length + size)
  result.set(png.subarray(0, 33))
  let offset = 33
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  result.set(png.subarray(33), offset)
  return result
}

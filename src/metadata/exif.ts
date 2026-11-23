// The EXIF UserComment of a JPEG or WebP, where Forge and A1111 store their generation data in those formats.
const userComment = 0x9286
const exifPointer = 0x8769
const ascii = new TextDecoder('latin1')

// The TIFF block inside the APP1 segment of a JPEG or the EXIF chunk of a WebP.
function tiffBlock(bytes: Uint8Array): Uint8Array | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1]
      const length = view.getUint16(offset + 2)
      if (marker === 0xda) break
      const body = bytes.subarray(offset + 4, offset + 2 + length)
      if (marker === 0xe1 && ascii.decode(body.subarray(0, 6)) === 'Exif\0\0') return body.subarray(6)
      offset += 2 + length
    }
    return undefined
  }
  if (ascii.decode(bytes.subarray(0, 4)) === 'RIFF' && ascii.decode(bytes.subarray(8, 12)) === 'WEBP') {
    let offset = 12
    while (offset + 8 <= bytes.length) {
      const type = ascii.decode(bytes.subarray(offset, offset + 4))
      const length = view.getUint32(offset + 4, true)
      const body = bytes.subarray(offset + 8, offset + 8 + length)
      if (type === 'EXIF') return ascii.decode(body.subarray(0, 6)) === 'Exif\0\0' ? body.subarray(6) : body
      offset += 8 + length + (length % 2)
    }
  }
  return undefined
}

// UserComment starts with an 8-byte character code. Forge writes UNICODE as UTF-16.
function decodeComment(data: Uint8Array, little: boolean) {
  const code = ascii.decode(data.subarray(0, 8)).replace(/\0+$/, '')
  const text = data.subarray(8)
  if (code === 'UNICODE') {
    // The text keeps the byte order of the TIFF header, unless a byte order mark says otherwise.
    const le = text[0] === 0xff && text[1] === 0xfe ? true : text[0] === 0xfe && text[1] === 0xff ? false : little
    const decoded = new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(text)
    return decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded
  }
  return new TextDecoder().decode(text)
}

export function exifComment(bytes: Uint8Array) {
  const tiff = tiffBlock(bytes)
  if (!tiff || tiff.length < 8) return undefined
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength)
  const little = tiff[0] === 0x49
  const entries = (ifd: number) => {
    if (ifd + 2 > tiff.length) return []
    const count = view.getUint16(ifd, little)
    return Array.from({ length: count }, (_, index) => ifd + 2 + index * 12).filter((at) => at + 12 <= tiff.length)
  }
  const pointer = entries(view.getUint32(4, little)).find((at) => view.getUint16(at, little) === exifPointer)
  if (pointer === undefined) return undefined
  const comment = entries(view.getUint32(pointer + 8, little)).find((at) => view.getUint16(at, little) === userComment)
  if (comment === undefined) return undefined
  const length = view.getUint32(comment + 4, little)
  const offset = length > 4 ? view.getUint32(comment + 8, little) : comment + 8
  if (offset + length > tiff.length) return undefined
  return (
    decodeComment(tiff.subarray(offset, offset + length), little)
      .replace(/\0+$/, '')
      .trim() || undefined
  )
}

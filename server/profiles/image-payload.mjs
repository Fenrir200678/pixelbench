export const pngDimensions = (payload) => {
  const head = Buffer.from(String(payload ?? '').slice(0, 64), 'base64')
  return head.length >= 24 ? [head.readUInt32BE(16), head.readUInt32BE(20)] : [0, 0]
}

export function pngPayload(payload, size) {
  if (typeof payload !== 'string' || payload.length > 32 * 1024 * 1024) throw new Error('The PNG is missing or too large.')
  const buffer = Buffer.from(payload, 'base64')
  if (
    buffer.length < 33 ||
    buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    buffer.toString('ascii', 12, 16) !== 'IHDR'
  )
    throw new Error('Invalid PNG.')
  const dimensions = [buffer.readUInt32BE(16), buffer.readUInt32BE(20)]
  if (dimensions.some((n) => !n || n > 8192) || (size && dimensions.some((n, i) => n !== size[i]))) {
    throw new Error('The PNG dimensions do not match the generation size.')
  }
  return buffer
}

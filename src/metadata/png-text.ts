// Text chunks of a PNG (tEXt, zTXt, iTXt), where Forge, A1111 and ComfyUI store their generation data.
const latin1 = new TextDecoder('latin1')
const utf8 = new TextDecoder()
const maxText = 4 * 1024 * 1024

async function inflate(data: Uint8Array) {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function readChunk(type: string, data: Uint8Array): Promise<[string, string] | undefined> {
  const keyEnd = data.indexOf(0)
  if (keyEnd < 1) return undefined
  const key = latin1.decode(data.subarray(0, keyEnd))
  if (type === 'tEXt') return [key, latin1.decode(data.subarray(keyEnd + 1))]
  if (type === 'zTXt') return [key, latin1.decode(await inflate(data.subarray(keyEnd + 2)))]
  // iTXt: key, compression flag and method, language tag, translated key, then UTF-8 text.
  const compressed = data[keyEnd + 1] === 1
  const language = data.indexOf(0, keyEnd + 3)
  const translated = language < 0 ? -1 : data.indexOf(0, language + 1)
  if (translated < 0) return undefined
  const text = data.subarray(translated + 1)
  return [key, utf8.decode(compressed ? await inflate(text) : text)]
}

export async function pngText(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const entries: Record<string, string> = {}
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset)
    const type = latin1.decode(bytes.subarray(offset + 4, offset + 8))
    const start = offset + 8
    if (type === 'IEND' || start + length > bytes.length) break
    if ((type === 'tEXt' || type === 'zTXt' || type === 'iTXt') && length <= maxText) {
      const entry = await readChunk(type, bytes.subarray(start, start + length)).catch(() => undefined)
      if (entry) entries[entry[0]] = entry[1]
    }
    offset = start + length + 4
  }
  return entries
}

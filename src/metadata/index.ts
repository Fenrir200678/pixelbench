import { parseComfy } from './comfyui.js'
import { exifComment } from './exif.js'
import { parseForge } from './forge.js'
import { pngText } from './png-text.js'
import { parsePixelbench } from './pixelbench.js'
import type { GenerationInfo } from './types.js'

export type { GenerationInfo, MetadataField, MetadataSource } from './types.js'

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10]

// Generation data of PNG text chunks, or of the EXIF UserComment of a JPEG or WebP.
export function metadataFrom(bytes: Uint8Array, text: Record<string, string>): GenerationInfo | undefined {
  // Pixelbench writes both chunks. Its own record is exact, the Forge text is for other tools.
  if (text.pixelbench) {
    const raw = ['parameters', 'pixelbench'].filter((key) => text[key]).map((key) => ({ key, value: text[key] }))
    const info = parsePixelbench(text.pixelbench, raw)
    if (info) return info
  }
  if (text.parameters?.trim()) return parseForge(text.parameters)
  if (text.prompt?.trim().startsWith('{')) return parseComfy(text.prompt, text.workflow)
  const comment = Object.keys(text).length ? undefined : exifComment(bytes)
  if (comment) return parseForge(comment)
  const raw = Object.entries(text).map(([key, value]) => ({ key, value }))
  return raw.length ? { source: 'other', fields: [], raw } : undefined
}

export async function readMetadata(file: Blob): Promise<GenerationInfo | undefined> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const png = pngSignature.every((value, index) => bytes[index] === value)
  return metadataFrom(bytes, png ? await pngText(bytes) : {})
}

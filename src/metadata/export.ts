import { generationOf } from '../editor/frameInfo.js'
import type { Frame } from '../types/image.js'
import { generationText } from './pixelbench.js'
import { withPngText } from './png-write.js'
import type { GenerationInfo, MetadataField } from './types.js'

// The text to store with an exported frame: its own render inputs, or the data of the opened file while the
// image is still unchanged. Edited images without a render record get none.
export function exportText(frame: Frame, original?: Frame, info?: GenerationInfo): MetadataField[] {
  const record = generationOf(frame)
  if (record) return generationText(record)
  return frame === original ? (info?.raw ?? []) : []
}

export async function withMetadata(png: Blob, entries: MetadataField[]) {
  if (!entries.length) return png
  const bytes = withPngText(new Uint8Array(await png.arrayBuffer()), entries)
  return new Blob([bytes as BlobPart], { type: 'image/png' })
}

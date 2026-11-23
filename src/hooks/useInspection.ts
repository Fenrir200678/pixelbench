import { useEffect, useRef, useState } from 'react'
import { readMetadata, type GenerationInfo } from '../metadata/index.js'

// PNG Info in Extras: a file dropped on the generation data is only read. The open image and the variants stay.
// The object URL shows the file as a thumbnail next to its data.
export type Inspection = { file: File; info?: GenerationInfo; url: string }

export function useInspection() {
  const [inspected, setInspected] = useState<Inspection>()
  const version = useRef(0)
  useEffect(() => () => void (inspected && URL.revokeObjectURL(inspected.url)), [inspected])
  return {
    inspected,
    async inspect(file: File) {
      const current = ++version.current
      const info = await readMetadata(file).catch(() => undefined)
      if (current === version.current) setInspected({ file, info, url: URL.createObjectURL(file) })
    },
    clear() {
      version.current++
      setInspected(undefined)
    }
  }
}

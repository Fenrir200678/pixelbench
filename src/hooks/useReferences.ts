import { useRef, useState, type MutableRefObject } from 'react'
import { messageOf } from '../helpers/async.js'
import { importImage } from '../image/files.js'
import type { Profile } from '../types/api.js'
import type { Notice, Work } from '../types/editor.js'
import type { ReferenceImage } from '../types/image.js'

type Inputs = {
  work: Work | undefined
  profile: Profile | undefined
  importVersion: MutableRefObject<number>
  notice: Notice
}

/** Reference images for the active profile. Imports are queued and dropped when the document changes. */
export function useReferences({ work, profile, importVersion, notice }: Inputs) {
  const [items, setItems] = useState<ReferenceImage[]>([])
  const queue = useRef(Promise.resolve())
  const version = useRef(0)

  function reset() {
    version.current++
    setItems([])
  }

  function add(files: File[]) {
    if (!work || !profile?.reference) return
    const current = version.current
    const document = importVersion.current
    const stale = () => current !== version.current || document !== importVersion.current
    const limit = profile.referenceLimit ?? 1
    if (files.length > limit - items.length) notice('Maximal {{count}} Referenzbilder.', false, { count: limit })
    queue.current = queue.current.then(async () => {
      for (const file of files.slice(0, limit)) {
        if (stale()) return
        try {
          const frame = await importImage(file)
          if (stale()) return
          setItems((list) => [...list, { id: crypto.randomUUID(), frame, name: file.name }].slice(0, limit))
        } catch (error) {
          if (!stale()) notice(messageOf(error))
        }
      }
    })
  }

  /** The prompt is left untouched, so a replacement image keeps its <imageN> tags. */
  function remove(id: string) {
    setItems((list) => list.filter((item) => item.id !== id))
  }

  /** Moves the reference `from` to the position of the reference `to`. */
  function move(from: string, to: string) {
    setItems((list) => {
      const source = list.findIndex((item) => item.id === from)
      const target = list.findIndex((item) => item.id === to)
      if (source < 0 || target < 0 || source === target) return list
      const next = [...list]
      next.splice(target, 0, ...next.splice(source, 1))
      return next
    })
  }

  /** Swaps the image of one reference for a dropped file. */
  function replace(id: string, file: File) {
    const current = version.current
    const document = importVersion.current
    queue.current = queue.current.then(async () => {
      try {
        const frame = await importImage(file)
        if (current !== version.current || document !== importVersion.current) return
        setItems((list) => list.map((item) => (item.id === id ? { ...item, frame, name: file.name } : item)))
      } catch (error) {
        notice(messageOf(error))
      }
    })
  }

  return { items, add, remove, move, replace, reset }
}

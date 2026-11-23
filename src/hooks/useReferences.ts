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
  prompt: string
  setPrompt: (prompt: string) => void
  notice: Notice
}

/** Reference images for the active profile. Imports are queued and dropped when the document changes. */
export function useReferences({ work, profile, importVersion, prompt, setPrompt, notice }: Inputs) {
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

  function remove(id: string) {
    const index = items.findIndex((item) => item.id === id)
    if (index < 0) return
    setItems((list) => list.filter((item) => item.id !== id))
    // Keep <imageN> tags in the prompt aligned with the remaining references (image 1 is the source).
    setPrompt(
      prompt.replace(/<image(\d+)>/g, (tag, number) => {
        const n = Number(number)
        return n === index + 2 ? '' : n > index + 2 ? `<image${n - 1}>` : tag
      })
    )
    notice('Referenz entfernt. Bildnummern im Prompt wurden angepasst.', true)
  }

  return { items, add, remove, reset }
}

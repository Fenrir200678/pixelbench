import { useRef, useState } from 'react'
import { api } from '../api/client.js'
import { messageOf } from '../helpers/async.js'
import type { Config } from '../types/api.js'
import type { Notice } from '../types/editor.js'

/** Loads the server config on demand for the settings dialog. */
export function useConfig(notice: Notice, blocked: boolean) {
  const [config, setConfig] = useState<Config>()
  const pending = useRef(false)

  async function open() {
    if (pending.current || config || blocked) return
    pending.current = true
    try {
      setConfig(await api<Config>('/api/config'))
    } catch (error) {
      notice(messageOf(error))
    } finally {
      pending.current = false
    }
  }

  return { config, open, close: () => setConfig(undefined) }
}

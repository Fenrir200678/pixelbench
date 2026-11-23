import { useState } from 'react'
import { api } from '../../api/client.js'
import { messageOf } from '../../helpers/async.js'
import type { Bridge } from '../../hooks/useBridge.js'
import type { Config } from '../../types/api.js'

export const categories = [
  'diffusion_models',
  'text_encoders',
  'vae',
  'checkpoints',
  'loras',
  'controlnet',
  'model_patches',
  'upscale_models'
]

const withDefaults = (config: Config): Config => ({
  ...config,
  keepModels: config.keepModels === true,
  previews: config.previews ?? 'fast',
  port: config.port ?? 0,
  args: config.args ?? [],
  extra: Object.fromEntries(categories.map((key) => [key, config.extra[key] ?? []]))
})
// Empty rows are only placeholders in the form.
const cleaned = (config: Config): Config => ({
  ...config,
  roots: config.roots.map((path) => path.trim()).filter(Boolean),
  extra: Object.fromEntries(
    Object.entries(config.extra).map(([key, paths]) => [key, paths.map((path) => path.trim()).filter(Boolean)])
  )
})
const same = (a: Config, b: Config) => JSON.stringify(cleaned(a)) === JSON.stringify(cleaned(b))

/** Unsaved edits of the server config. Saving restarts the private process unless only previews changed. */
export function useConfigDraft(config: Config, bridge: Bridge, onSaved: () => void) {
  const [saved] = useState(() => withDefaults(config))
  const [draft, setDraft] = useState(saved)
  const [tested, setTested] = useState<{ message: string; version: string }>()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState<'test' | 'save'>()
  const dirty = !same(draft, saved)
  const restarts = !same({ ...draft, previews: saved.previews }, saved)

  function update(patch: Partial<Config>) {
    setDraft((current) => ({ ...current, ...patch }))
    if ('mode' in patch || 'address' in patch) setTested(undefined)
  }

  async function test() {
    setPending('test')
    setError(undefined)
    try {
      if (draft.mode === 'external') {
        setTested(await api<{ message: string; version: string }>('/api/probe', { address: draft.address }))
      } else {
        const next = await bridge.refresh()
        if (next?.state === 'error' && next.mode === 'managed') {
          await api('/api/restart', {})
          await bridge.refresh()
        }
      }
    } catch (error) {
      setError(messageOf(error))
    } finally {
      setPending(undefined)
    }
  }

  async function save() {
    setPending('save')
    setError(undefined)
    try {
      await api('/api/config', cleaned(draft))
      onSaved()
      await bridge.refresh()
    } catch (error) {
      setError(messageOf(error))
    } finally {
      setPending(undefined)
    }
  }

  return {
    draft,
    update,
    dirty,
    restarts,
    reset: () => {
      setDraft(saved)
      setError(undefined)
    },
    test,
    tested,
    save,
    pending,
    error,
    setError
  }
}

export type ConfigDraft = ReturnType<typeof useConfigDraft>

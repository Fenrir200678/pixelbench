import { useEffect, useState } from 'react'
import { api, waitForRestart } from '../api/client.js'
import { messageOf } from '../helpers/async.js'
import { getPreferences, usePreferences } from '../settings/preferences.js'
import type { UpdateStatus } from '../types/api.js'
import type { Notice } from '../types/editor.js'
import type { Bridge } from './useBridge.js'

// The version before an update, kept across the reload that loads the new editor.
const updatedFrom = 'pixelbench-updated-from'
// Downloading, applying and setting up packages can take a while on a slow connection.
const installTimeout = 20 * 60_000

/** The in-app update: checks for a newer release on start and installs it on request. */
export function useUpdates(notice: Notice, bridge: Bridge) {
  const { updateCheck, updatePrerelease } = usePreferences()
  const [status, setStatus] = useState<UpdateStatus>()
  const [pending, setPending] = useState<'check' | 'install'>()
  const [error, setError] = useState<string>()

  // The automatic check on start stays quiet. A failed check shows up when the user checks by hand.
  useEffect(() => {
    const request = updateCheck
      ? api<UpdateStatus>('/api/update/check', { prerelease: updatePrerelease, force: false })
      : api<UpdateStatus>('/api/update')
    void request.then(setStatus, () => {})
  }, [updateCheck, updatePrerelease])

  async function check(force: boolean) {
    setPending('check')
    setError(undefined)
    try {
      const prerelease = getPreferences().updatePrerelease
      setStatus(await api<UpdateStatus>('/api/update/check', { prerelease, force }))
    } catch (error) {
      setError(messageOf(error))
    } finally {
      setPending(undefined)
    }
  }

  useEffect(() => {
    const from = sessionStorage.getItem(updatedFrom)
    if (from === null) return
    sessionStorage.removeItem(updatedFrom)
    if (from !== __APP_VERSION__)
      notice('Pixelbench wurde auf Version {{version}} aktualisiert.', true, { version: __APP_VERSION__ })
  }, [notice])

  async function install() {
    const release = status?.release
    if (!status || !release || pending) return
    setPending('install')
    setError(undefined)
    try {
      const { instance } = await api<{ instance: string }>('/api/server')
      await api<UpdateStatus>('/api/update/install', { version: release.version })
      bridge.closeSession()
      notice('Das Update wird installiert. Den Fortschritt zeigt das Pixelbench-Fenster.', true)
      if (!(await waitForRestart(instance, installTimeout)))
        throw new Error('Der Server ist nach dem Update noch nicht erreichbar.')
      const next = await api<UpdateStatus>('/api/update')
      if (next.version !== status.version) {
        sessionStorage.setItem(updatedFrom, __APP_VERSION__)
        window.location.reload()
        return
      }
      setStatus(next)
      throw new Error(next.lastResult?.error ?? 'Das Update ist fehlgeschlagen.')
    } catch (error) {
      setError(messageOf(error))
      notice()
    } finally {
      setPending(undefined)
    }
  }

  const available = Boolean(status?.release)
  return { status, pending, error, available, check, install }
}

export type Updates = ReturnType<typeof useUpdates>

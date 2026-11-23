import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api } from '../api/client.js'
import { pause } from '../helpers/async.js'
import type { Status } from '../types/api.js'
import type { Notice } from '../types/editor.js'

type ServerAction = 'restart' | 'shutdown'

export function useBridge(notice: Notice) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<Status>()
  const [overrideLabel, setOverrideLabel] = useState<string>()
  const [reloading, setReloading] = useState(false)
  const [serverAction, setServerAction] = useState<ServerAction>()
  const action = useRef<ServerAction>(undefined)
  const session = useRef<string>(undefined)
  const pending = useRef<Promise<Status | undefined>>(undefined)
  const version = useRef(0)

  const markUnavailable = useCallback((state: 'starting' | 'error', message: string, label?: string) => {
    setOverrideLabel(label)
    setStatus((previous) => ({
      state,
      message,
      mode: previous?.mode ?? 'managed',
      profiles: previous?.profiles.map((profile) => ({ ...profile, available: false, ready: false })) ?? []
    }))
  }, [])

  const load = useCallback(
    (fresh: boolean): Promise<Status | undefined> => {
      if (action.current) return Promise.resolve(undefined)
      if (pending.current) return pending.current
      const requested = version.current
      const query = [session.current && 'session=' + session.current, fresh && 'refresh=1'].filter(Boolean).join('&')
      const request = api<Status>('/api/status' + (query ? '?' + query : ''))
        .then((next) => {
          if (version.current !== requested) return undefined
          setOverrideLabel(undefined)
          setStatus(next)
          return next
        })
        .catch(() => {
          if (version.current === requested) markUnavailable('error', 'Die lokale Brücke ist nicht erreichbar.')
          return undefined
        })
        .finally(() => {
          pending.current = undefined
        })
      pending.current = request
      return request
    },
    [markUnavailable]
  )

  const refresh = useCallback(() => load(false), [load])

  /** Re-reads the ComfyUI model lists, bypassing the server's inspection cache. */
  const reload = useCallback(async () => {
    setReloading(true)
    try {
      await pending.current
      await load(true)
    } finally {
      setReloading(false)
    }
  }, [load])

  const closeSession = useCallback(() => {
    if (!session.current) return
    navigator.sendBeacon('/api/session/' + session.current + '/close')
    session.current = undefined
  }, [])

  useEffect(() => {
    void refresh()
    // Hidden tabs skip the poll and refresh once when they become visible again.
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void refresh()
    }, 5000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const onPageHide = (event: PageTransitionEvent) => {
      if (!event.persisted) closeSession()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [refresh, closeSession])

  async function controlServer(next: ServerAction, onSuccess: () => void) {
    if (action.current) return
    action.current = next
    setServerAction(next)
    version.current++
    const restart = next === 'restart'
    try {
      let instance: string
      try {
        ;({ instance } = await api<{ instance: string }>('/api/server', { action: next }))
      } catch (error) {
        throw error instanceof ApiError ? error : new Error('Der Pixelbench-Server ist nicht erreichbar.')
      }
      session.current = undefined
      onSuccess()
      const message = restart
        ? 'Pixelbench-Server startet neu …'
        : 'Server wird beendet. Mit npm start kannst du Pixelbench wieder starten.'
      markUnavailable(restart ? 'starting' : 'error', message, restart ? 'Server startet neu …' : 'Server offline')
      notice(message, true)
      if (!restart) return
      const deadline = Date.now() + 30_000
      while (Date.now() < deadline) {
        await pause(500)
        try {
          const response = await fetch('/api/server', { signal: AbortSignal.timeout(2000) })
          if (response.ok && (await response.json()).instance !== instance) {
            notice('Pixelbench-Server ist wieder erreichbar.', true)
            return
          }
        } catch {
          /* The server is restarting. */
        }
      }
      notice('Der Server ist nach dem Neustart noch nicht erreichbar.')
    } finally {
      action.current = undefined
      setServerAction(undefined)
      if (restart) {
        await pending.current
        void refresh()
      }
    }
  }

  const label = overrideLabel
    ? t(overrideLabel)
    : status?.state === 'ready'
      ? status.mode === 'managed'
        ? t('ComfyUI lokal')
        : t('ComfyUI extern')
      : status?.state === 'starting'
        ? t('ComfyUI startet …')
        : status?.state === 'error'
          ? t('Backend offline')
          : t('Verbinde …')

  return { status, label, serverAction, session, closeSession, refresh, reload, reloading, controlServer }
}

export type Bridge = ReturnType<typeof useBridge>

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client.js'
import {
  deleteSessions,
  loadSession,
  saveSession,
  sessionSummary,
  setSessionLimit,
  type SessionSummary
} from '../api/editorSession.js'
import { createSessionCodec } from '../editor/session/codec.js'
import type { Workspace } from '../editor/session/workspace.js'
import i18n from '../i18n/index.js'
import { confirmDiscard, getPreferences, usePreferences } from '../settings/preferences.js'
import type { Notice } from '../types/editor.js'

type Slot = { summary: SessionSummary; owned: boolean }
type Activity = 'saving' | 'restoring' | 'clearing' | 'setting-limit'
type Failure = { message: string; changes: object; retry?: boolean; tooLarge?: boolean }
type Inputs = {
  workspace: Workspace
  changes: object
  prepareRestore: (next: Workspace) => () => void
  canRestore: boolean
  notice: Notice
}

const hasBackup = (summary: SessionSummary) => Boolean(summary.savedAt || summary.damaged)

export function useEditorSession(inputs: Inputs) {
  const { changes, canRestore, notice } = inputs
  const { autosaveSession, sessionSaveDelay } = usePreferences()
  const [codec] = useState(createSessionCodec)
  const [baseline, setBaseline] = useState(changes)
  const [slot, setSlot] = useState<Slot>()
  const [activity, setActivity] = useState<Activity>()
  const [failure, setFailure] = useState<Failure>()
  const [storageNotice, setStorageNotice] = useState<{ message: string; good?: boolean }>()
  const latest = useRef({ ...inputs, baseline, slot, failure })
  const busy = useRef(false)
  const epoch = useRef(0)
  const adopting = useRef(false)

  useLayoutEffect(() => {
    latest.current = { ...inputs, baseline, slot, failure }
    if (adopting.current) {
      // Capture the restored state after the editor hooks have rendered it together.
      adopting.current = false
      latest.current.baseline = changes
      queueMicrotask(() => setBaseline(changes))
    }
  }, [inputs, baseline, slot, failure, changes])

  const syncSummary = useCallback((summary: SessionSummary) => {
    setSlot((previous) => {
      if (previous?.summary.revision === summary.revision) {
        return previous.summary.bytesUsed === summary.bytesUsed && previous.summary.limitMB === summary.limitMB
          ? previous
          : { ...previous, summary }
      }
      return { summary, owned: !previous && !hasBackup(summary) }
    })
  }, [])

  const refresh = useCallback(async () => {
    if (busy.current) return
    const started = epoch.current
    try {
      const summary = await sessionSummary()
      if (started !== epoch.current) return
      syncSummary(summary)
    } catch {
      // Keep the last known revision. A save will retry when the server is reachable again.
    }
  }, [syncSummary])

  const save = useCallback(
    async (manual: boolean) => {
      const previous = latest.current
      if (
        busy.current ||
        (!manual &&
          (!getPreferences().autosaveSession || !previous.slot?.owned || previous.changes === previous.baseline))
      )
        return
      busy.current = true
      epoch.current++
      setActivity('saving')
      let captured = previous.changes
      try {
        const summary = manual ? await sessionSummary() : previous.slot!.summary
        const replacing =
          hasBackup(summary) && (!previous.slot?.owned || previous.slot.summary.revision !== summary.revision)
        if (replacing && !window.confirm(i18n.t('Die gespeicherte Session durch den aktuellen Stand ersetzen?'))) {
          setSlot({ summary, owned: false })
          return
        }
        captured = latest.current.changes
        const next = await saveSession(codec, latest.current.workspace, summary)
        const confirmed = { summary: next, owned: true }
        latest.current.baseline = captured
        latest.current.slot = confirmed
        setBaseline(captured)
        setSlot(confirmed)
        setFailure(undefined)
        if (manual) previous.notice('Session gespeichert.', true)
      } catch (error) {
        const conflict = error instanceof ApiError && error.status === 412
        const tooLarge = error instanceof ApiError && error.status === 413
        if (conflict) {
          const summary = await sessionSummary().catch(() => previous.slot?.summary)
          setSlot(summary && { summary, owned: false })
        }
        const message = conflict
          ? 'Die Session wurde in einem anderen Tab geändert.'
          : tooLarge
            ? 'Die Session passt nicht ins Speicherlimit. Entferne Varianten oder erhöhe das Limit unter Einstellungen → Session.'
            : 'Session konnte nicht gespeichert werden. Klicke auf „Jetzt speichern“, um es erneut zu versuchen.'
        setFailure({ message, changes: captured, retry: !conflict && !tooLarge, tooLarge })
        if (manual) previous.notice(message)
      } finally {
        busy.current = false
        setActivity(undefined)
      }
    },
    [codec]
  )

  async function restore() {
    if (busy.current || !canRestore) return
    const before = changes
    busy.current = true
    epoch.current++
    setActivity('restoring')
    try {
      if (slot?.owned && changes === baseline && !failure) {
        const current = await sessionSummary()
        if (current.revision === slot.summary.revision && latest.current.changes === before) {
          notice('Die zuletzt gespeicherte Session ist bereits geöffnet.', true)
          return
        }
      }
      if (
        (changes !== baseline || slot?.owned) &&
        !confirmDiscard(i18n.t('Den aktuellen Arbeitsstand durch die gespeicherte Session ersetzen?'))
      )
        return
      const next = await loadSession(codec)
      if (!next) {
        notice('Keine Session zum Wiederherstellen vorhanden.')
        return
      }
      if (latest.current.changes !== before || !latest.current.canRestore) {
        notice('Der Arbeitsstand hat sich beim Laden geändert. Stelle die Session erneut wieder her.')
        return
      }
      const apply = latest.current.prepareRestore(next.workspace)
      adopting.current = true
      apply()
      setSlot({ summary: next.summary, owned: true })
      setFailure(undefined)
      notice('Session wiederhergestellt.', true)
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 412
          ? 'Die Session wurde in einem anderen Tab geändert.'
          : 'Session konnte nicht wiederhergestellt werden. Der aktuelle Arbeitsstand bleibt erhalten.'
      setFailure({ message, changes })
      notice(message)
    } finally {
      busy.current = false
      setActivity(undefined)
    }
  }

  async function manageStorage(limit?: number) {
    const previous = latest.current
    if (busy.current || !previous.slot) return
    const { summary } = previous.slot
    if (limit === summary.limitMB) return
    const clearing = limit === undefined
    if (
      clearing &&
      !window.confirm(i18n.t('Alle gespeicherten Sessions löschen? Der offene Arbeitsstand bleibt im Editor.'))
    )
      return
    busy.current = true
    epoch.current++
    setActivity(clearing ? 'clearing' : 'setting-limit')
    setStorageNotice(undefined)
    try {
      if (clearing) {
        const next = await deleteSessions(summary.revision)
        const clean = { summary: next, owned: true }
        const changesAtDeletion = latest.current.changes
        latest.current.slot = clean
        latest.current.baseline = changesAtDeletion
        setSlot(clean)
        setBaseline(changesAtDeletion)
        setFailure(undefined)
        setStorageNotice({ message: 'Gespeicherte Sessions gelöscht.', good: true })
      } else {
        syncSummary(await setSessionLimit(limit))
        if (limit > summary.limitMB && previous.failure?.tooLarge) setFailure(undefined)
      }
    } catch (error) {
      const current = await sessionSummary().catch(() => undefined)
      if (current) syncSummary(current)
      const message =
        error instanceof ApiError && error.status === 412
          ? 'Die Session wurde in einem anderen Tab geändert.'
          : clearing
            ? 'Die gespeicherten Sessions konnten nicht vollständig gelöscht werden.'
            : 'Das Speicherlimit konnte nicht gespeichert werden.'
      setStorageNotice({ message })
    } finally {
      busy.current = false
      setActivity(undefined)
    }
  }

  const unsaved = changes !== baseline
  useEffect(() => {
    if (slot) return
    const first = window.setTimeout(() => void refresh(), 0)
    const retry = window.setInterval(() => void refresh(), 5000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(retry)
    }
  }, [slot, refresh])

  useEffect(() => {
    if (!autosaveSession || activity || !slot?.owned || !unsaved) return
    const failed = failure?.changes === changes
    if (failed && !failure.retry) return
    const timer = window.setTimeout(() => void save(false), failed ? 10000 : sessionSaveDelay * 1000)
    return () => window.clearTimeout(timer)
  }, [activity, slot, unsaved, changes, failure, save, autosaveSession, sessionSaveDelay])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void save(false)
      else void refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [refresh, save])

  return {
    activity,
    autosaveSession,
    problem: failure?.message,
    savedAt: slot?.summary.savedAt,
    locked: Boolean(slot && !slot.owned),
    damaged: Boolean(slot?.summary.damaged),
    unsaved,
    canSave: !activity,
    canRestore: canRestore && !activity && Boolean(slot?.summary.savedAt),
    save: () => void save(true),
    restore: () => void restore(),
    storage: slot?.summary,
    storageNotice,
    refreshStorage: refresh,
    changeStorageLimit: (limit: number) => void manageStorage(limit),
    clearStorage: () => void manageStorage()
  }
}

export type EditorSession = ReturnType<typeof useEditorSession>

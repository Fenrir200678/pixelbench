import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { EditorSession } from '../hooks/useEditorSession.js'
import { Button } from '../ui/Button.js'

export function SessionControls({ session }: { session: EditorSession }) {
  const { t, i18n } = useTranslation()
  const descriptionId = useId()
  const save = t('Jetzt speichern')
  const restore = t('Session wiederherstellen')
  const savedAt =
    session.savedAt &&
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(new Date(session.savedAt))
  const saved = savedAt ? t('Zuletzt gespeichert: {{time}}', { time: savedAt }) : ''
  const status =
    session.activity === 'saving'
      ? t('Session wird gespeichert …')
      : session.activity === 'restoring'
        ? t('Session wird wiederhergestellt …')
        : session.problem
          ? t(session.problem)
          : session.damaged
            ? t('Die gespeicherte Session kann nicht gelesen werden.')
            : session.locked
              ? session.savedAt
                ? t('Stelle die letzte Session wieder her oder speichere den aktuellen Stand.')
                : t('Klicke auf „Jetzt speichern“, um eine neue Sicherung anzulegen.')
              : session.unsaved
                ? session.autosaveSession
                  ? t('Änderungen noch nicht gespeichert.')
                  : t('Autosave ist aus. Klicke auf „Jetzt speichern“, um Änderungen zu sichern.')
                : saved || t('Noch keine Session gespeichert.')
  const attention =
    session.problem || session.damaged
      ? 'error'
      : session.activity
        ? 'busy'
        : session.locked || session.unsaved
          ? 'pending'
          : undefined

  return (
    <div className="session-controls" role="group" aria-label={t('Editor-Session')}>
      <Button
        className="quiet icon session-save"
        icon="save-session"
        title={`${save} — ${status}`}
        aria-label={save}
        aria-describedby={descriptionId}
        aria-busy={session.activity === 'saving'}
        data-attention={attention}
        disabled={!session.canSave}
        onClick={session.save}
      />
      <Button
        className="quiet session-restore"
        icon="restore-session"
        title={saved ? `${restore} — ${saved}` : restore}
        aria-label={restore}
        aria-busy={session.activity === 'restoring'}
        disabled={!session.canRestore}
        onClick={session.restore}
      >
        <span>{restore}</span>
      </Button>
      <span id={descriptionId} className="sr-only">
        {status}
      </span>
    </div>
  )
}

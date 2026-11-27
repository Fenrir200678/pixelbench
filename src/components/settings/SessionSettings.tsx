import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { EditorSession } from '../../hooks/useEditorSession.js'
import { sessionSaveDelayRange, setPreference, usePreferences } from '../../settings/preferences.js'
import { Button } from '../../ui/Button.js'
import { NumberField } from '../../ui/NumberField.js'
import { SettingGroup, SettingRow } from '../../ui/SettingRow.js'
import { Toggle } from '../../ui/Toggle.js'

const megabyte = 1_000_000

function storageSize(bytes: number, language: string) {
  const unit = bytes === 0 || bytes >= megabyte ? 'megabyte' : bytes >= 1000 ? 'kilobyte' : 'byte'
  const divisor = unit === 'megabyte' ? megabyte : unit === 'kilobyte' ? 1000 : 1
  return new Intl.NumberFormat(language, { style: 'unit', unit, maximumFractionDigits: 2 }).format(bytes / divisor)
}

export function SessionSettings({ session }: { session: EditorSession }) {
  const { t, i18n } = useTranslation()
  const preferences = usePreferences()
  const { refreshStorage, activity, storageNotice } = session
  const storage = Number.isFinite(session.storage?.limitMB) ? session.storage : undefined
  const limitBytes = (storage?.limitMB ?? 0) * megabyte
  const overLimit = storage && storage.bytesUsed > limitBytes

  useEffect(() => {
    void refreshStorage()
  }, [refreshStorage])

  return (
    <SettingGroup title={t('Session')}>
      <SettingRow
        id="config-autosave-session"
        label={t('Session automatisch speichern')}
        note={t('Speichert den Arbeitsstand im Hintergrund. Du kannst jederzeit auch manuell speichern.')}
      >
        <Toggle
          id="config-autosave-session"
          aria-describedby="config-autosave-session-note"
          checked={preferences.autosaveSession}
          onChange={(value) => setPreference('autosaveSession', value)}
        />
      </SettingRow>
      <SettingRow
        id="config-session-save-delay"
        label={t('Wartezeit in Sekunden')}
        note={
          preferences.autosaveSession
            ? t('Zeit seit der letzten Änderung. Beim Tabwechsel kann Pixelbench früher speichern.')
            : t('Schalte Autosave ein, um die Wartezeit zu ändern.')
        }
      >
        <NumberField
          id="config-session-save-delay"
          label={t('Wartezeit in Sekunden')}
          externalLabel
          describedBy="config-session-save-delay-note"
          value={preferences.sessionSaveDelay}
          {...sessionSaveDelayRange}
          suffix="s"
          disabled={!preferences.autosaveSession}
          onChange={(value) => setPreference('sessionSaveDelay', value)}
          commitOnBlur
        />
      </SettingRow>
      <SettingRow
        id="config-session-storage-limit"
        label={t('Maximale Sicherungsgröße')}
        note={t('Das Limit gilt für neue Sicherungen. Bestehende Sicherungen bleiben erhalten.')}
      >
        <NumberField
          id="config-session-storage-limit"
          label={t('Maximale Sicherungsgröße')}
          externalLabel
          describedBy="config-session-storage-limit-note"
          value={storage?.limitMB}
          min={1}
          max={1000}
          suffix="MB"
          disabled={!storage || Boolean(activity)}
          onChange={session.changeStorageLimit}
          commitOnBlur
        />
      </SettingRow>
      <SettingRow
        id="config-session-storage-used"
        label={t('Belegter Speicher')}
        labelFor={false}
        note={
          !storage
            ? t('Die Speicherbelegung ist noch nicht verfügbar.')
            : overLimit
              ? t('Die gespeicherten Dateien liegen über dem eingestellten Limit.')
              : t('Größe der komprimierten Session-Dateien auf der Platte.')
        }
      >
        <output
          id="config-session-storage-used"
          className="session-storage-value"
          data-over-limit={overLimit || undefined}
          aria-labelledby="config-session-storage-used-label"
          aria-describedby="config-session-storage-used-note"
        >
          {storage
            ? t('{{used}} von {{limit}}', {
                used: storageSize(storage.bytesUsed, i18n.language),
                limit: storageSize(limitBytes, i18n.language)
              })
            : '—'}
        </output>
      </SettingRow>
      <SettingRow
        id="config-clear-sessions"
        label={t('Gespeicherte Sessions')}
        labelFor={false}
        note={t('Löscht die Sicherung auf der Platte. Der offene Arbeitsstand bleibt im Editor.')}
      >
        <Button
          id="config-clear-sessions"
          className="secondary danger"
          icon="trash"
          aria-describedby="config-clear-sessions-note"
          disabled={!storage || (!storage.bytesUsed && !storage.savedAt && !storage.damaged) || Boolean(activity)}
          onClick={session.clearStorage}
        >
          {t('Alle Sessions löschen')}
        </Button>
      </SettingRow>
      {storageNotice && (
        <p className={'setting-note ' + (storageNotice.good ? 'good' : 'danger')} role="status">
          {t(storageNotice.message)}
        </p>
      )}
    </SettingGroup>
  )
}

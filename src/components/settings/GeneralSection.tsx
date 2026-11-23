import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { notificationsSupported, playChime, requestNotifications } from '../../settings/notify.js'
import { resetAllPreferences, resetLayout, setPreference, usePreferences } from '../../settings/preferences.js'
import { Button } from '../../ui/Button.js'
import { Segmented } from '../../ui/Segmented.js'
import { SettingGroup, SettingRow } from '../../ui/SettingRow.js'
import { Toggle } from '../../ui/Toggle.js'

export function GeneralSection() {
  const { t, i18n } = useTranslation()
  const preferences = usePreferences()
  const [blocked, setBlocked] = useState(() => notificationsSupported() && Notification.permission === 'denied')

  async function changeNotify(value: boolean) {
    if (value && !(await requestNotifications())) {
      setBlocked(true)
      return
    }
    setBlocked(false)
    setPreference('notifyDone', value)
  }

  return (
    <>
      <SettingGroup>
        <SettingRow id="config-language" label={t('Sprache')} labelFor={false}>
          <Segmented
            id="config-language"
            labelledBy="config-language-label"
            value={i18n.language === 'de' ? 'de' : 'en'}
            options={[
              { value: 'de', label: 'Deutsch' },
              { value: 'en', label: 'English' }
            ]}
            onChange={(language) => void i18n.changeLanguage(language)}
          />
        </SettingRow>
      </SettingGroup>
      <SettingGroup title={t('Arbeitsablauf')}>
        <SettingRow
          id="config-continue-in-edit"
          label={t('Nach dem Übernehmen zu Ändern wechseln')}
          note={t('Ein übernommenes Bild aus Erstellen öffnet direkt im Modus Ändern.')}
        >
          <Toggle
            id="config-continue-in-edit"
            aria-describedby="config-continue-in-edit-note"
            checked={preferences.continueInEdit}
            onChange={(value) => setPreference('continueInEdit', value)}
          />
        </SettingRow>
        <SettingRow
          id="config-keep-prompts"
          label={t('Prompts beim Öffnen eines Bildes behalten')}
          note={t('Jeder Modus behält Prompt und Negativ-Prompt, etwa für eine Bildserie mit derselben Änderung.')}
        >
          <Toggle
            id="config-keep-prompts"
            aria-describedby="config-keep-prompts-note"
            checked={preferences.keepPrompts}
            onChange={(value) => setPreference('keepPrompts', value)}
          />
        </SettingRow>
        <SettingRow
          id="config-confirm-discard"
          label={t('Vor dem Verwerfen nachfragen')}
          note={t('Fragt nach, bevor ungespeicherte Änderungen oder Varianten verloren gehen.')}
        >
          <Toggle
            id="config-confirm-discard"
            aria-describedby="config-confirm-discard-note"
            checked={preferences.confirmDiscard}
            onChange={(value) => setPreference('confirmDiscard', value)}
          />
        </SettingRow>
        <SettingRow
          id="config-console-on-error"
          label={t('Konsole bei Fehlern öffnen')}
          note={t('Zeigt das ComfyUI-Protokoll, wenn eine Generierung fehlschlägt.')}
        >
          <Toggle
            id="config-console-on-error"
            aria-describedby="config-console-on-error-note"
            checked={preferences.consoleOnError}
            onChange={(value) => setPreference('consoleOnError', value)}
          />
        </SettingRow>
      </SettingGroup>
      <SettingGroup title={t('Wenn eine Generierung endet')}>
        <SettingRow
          id="config-notify-done"
          label={t('Systembenachrichtigung')}
          note={
            blocked
              ? t('Der Browser blockiert Benachrichtigungen für diese Seite. Erlaube sie in den Website-Einstellungen.')
              : t('Nur wenn Pixelbench gerade im Hintergrund ist.')
          }
        >
          <Toggle
            id="config-notify-done"
            aria-describedby="config-notify-done-note"
            checked={preferences.notifyDone && !blocked}
            disabled={!notificationsSupported()}
            onChange={(value) => void changeNotify(value)}
          />
        </SettingRow>
        <SettingRow
          id="config-sound-done"
          label={t('Ton abspielen')}
          note={t('Ein kurzer Klang bei Erfolg oder Fehler.')}
        >
          <div className="setting-inline">
            <Button className="quiet compact" onClick={() => playChime('complete')}>
              {t('Anhören')}
            </Button>
            <Toggle
              id="config-sound-done"
              aria-describedby="config-sound-done-note"
              checked={preferences.soundDone}
              onChange={(value) => setPreference('soundDone', value)}
            />
          </div>
        </SettingRow>
      </SettingGroup>
      <SettingGroup title={t('Zurücksetzen')}>
        <SettingRow
          id="config-reset-layout"
          label={t('Fensteraufteilung')}
          note={t('Stellt Panelbreiten und aufgeklappte Bereiche wieder her. Die Seite lädt neu.')}
        >
          <Button id="config-reset-layout" className="secondary" icon="repeat" onClick={resetLayout}>
            {t('Zurücksetzen')}
          </Button>
        </SettingRow>
        <SettingRow
          id="config-reset-all"
          label={t('Alle Einstellungen in diesem Browser')}
          note={t('Löscht Vorgaben, Modellauswahl, LoRAs und Layout. Sprache und ComfyUI-Einrichtung bleiben.')}
        >
          <Button
            id="config-reset-all"
            className="secondary danger"
            icon="trash"
            onClick={() => {
              if (
                window.confirm(
                  t('Alle Einstellungen in diesem Browser zurücksetzen? Das lässt sich nicht rückgängig machen.')
                )
              )
                resetAllPreferences()
            }}
          >
            {t('Zurücksetzen')}
          </Button>
        </SettingRow>
      </SettingGroup>
    </>
  )
}

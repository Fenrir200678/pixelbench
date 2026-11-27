import { useTranslation } from 'react-i18next'
import { useFormatTime } from '../../helpers/time.js'
import type { Updates } from '../../hooks/useUpdates.js'
import { appMessage } from '../../i18n/appMessages.js'
import { setPreference, usePreferences } from '../../settings/preferences.js'
import { Button } from '../../ui/Button.js'
import { SettingGroup, SettingRow } from '../../ui/SettingRow.js'
import { Toggle } from '../../ui/Toggle.js'

/** Update state, the check and install buttons and the update preferences, shown on the About page. */
export function UpdateSection({ updates, busy }: { updates: Updates; busy: boolean }) {
  const { t } = useTranslation()
  const formatTime = useFormatTime()
  const preferences = usePreferences()
  const { status, pending, error } = updates
  const release = status?.release
  const git = status?.mode === 'git'
  // A failed update matters while its release is still offered. Retrying it replaces the message.
  const failed = release && status?.lastResult?.ok === false ? status.lastResult.error : undefined

  const label =
    pending === 'install'
      ? t('Update wird installiert …')
      : release
        ? t('Version {{version}} ist verfügbar', { version: release.version })
        : status?.checkedAt
          ? t('Pixelbench ist aktuell')
          : t('Noch nicht nach Updates gesucht')
  const note =
    pending === 'install' ? (
      t(
        'Pixelbench lädt die neue Version, startet neu und lädt danach die Seite neu. Den Fortschritt zeigt das Pixelbench-Fenster.'
      )
    ) : release ? (
      <a href={release.url} target="_blank" rel="noreferrer">
        {t('Release-Notes ansehen')}
      </a>
    ) : status?.checkedAt ? (
      t('Zuletzt geprüft: {{time}}', { time: formatTime(status.checkedAt, { date: true }) })
    ) : undefined

  function install() {
    if (!release) return
    const question = t('Pixelbench auf Version {{version}} aktualisieren? Der Server startet dabei neu.', {
      version: release.version
    })
    if (window.confirm(question)) void updates.install()
  }

  return (
    <SettingGroup title={t('Updates')}>
      <SettingRow id="update-state" label={label} note={note} labelFor={false}>
        <div className="setting-inline">
          <Button
            id="update-check"
            className="secondary"
            icon="reload"
            disabled={Boolean(pending)}
            onClick={() => void updates.check(true)}
          >
            {pending === 'check' ? t('Prüft …') : t('Nach Updates suchen')}
          </Button>
          {release && !git && (
            <Button
              id="update-install"
              className="primary"
              icon="export"
              disabled={Boolean(pending) || busy}
              title={busy ? t('Warte, bis Generierung, Import oder Export abgeschlossen sind.') : undefined}
              onClick={install}
            >
              {t('Jetzt aktualisieren')}
            </Button>
          )}
        </div>
      </SettingRow>
      {git && (
        <p className="setting-intro">
          {t(
            'Dieser Ordner ist ein Git-Checkout. Aktualisiere ihn mit git pull und starte danach install.cmd oder install.command.'
          )}
        </p>
      )}
      <SettingRow
        id="config-update-check"
        label={t('Beim Start nach Updates suchen')}
        note={t(
          'Fragt höchstens einmal am Tag bei GitHub nach einer neuen Version. Bilder und Prompts werden dabei nicht übertragen.'
        )}
      >
        <Toggle
          id="config-update-check"
          aria-describedby="config-update-check-note"
          checked={preferences.updateCheck}
          onChange={(value) => setPreference('updateCheck', value)}
        />
      </SettingRow>
      <SettingRow
        id="config-update-prerelease"
        label={t('Beta-Versionen anbieten')}
        note={t('Bietet auch Vorabversionen an. Sie sind neuer, aber weniger getestet.')}
      >
        <Toggle
          id="config-update-prerelease"
          aria-describedby="config-update-prerelease-note"
          checked={preferences.updatePrerelease}
          onChange={(value) => setPreference('updatePrerelease', value)}
        />
      </SettingRow>
      <p id="update-error" className="notice" role="alert" hidden={!error && !failed}>
        {error ? appMessage(error) : failed && t('Das letzte Update ist fehlgeschlagen: {{error}}', { error: failed })}
      </p>
    </SettingGroup>
  )
}

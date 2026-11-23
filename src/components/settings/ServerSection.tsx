import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { messageOf } from '../../helpers/async.js'
import type { Bridge } from '../../hooks/useBridge.js'
import { appMessage } from '../../i18n/appMessages.js'
import { Button } from '../../ui/Button.js'
import { SettingGroup, SettingRow } from '../../ui/SettingRow.js'

export function ServerSection({
  bridge,
  busy,
  disabled,
  onClose
}: {
  bridge: Bridge
  busy: boolean
  disabled: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [error, setError] = useState<string>()
  const status = bridge.status

  async function control(action: 'restart' | 'shutdown') {
    setError(undefined)
    if (busy) {
      setError('Warte, bis Generierung, Import oder Export abgeschlossen sind.')
      return
    }
    if (
      action === 'shutdown' &&
      !window.confirm(t('Pixelbench-Server beenden? Du kannst ihn später im Terminal wieder starten.'))
    )
      return
    try {
      await bridge.controlServer(action, onClose)
    } catch (error) {
      setError(messageOf(error))
    }
  }

  return (
    <>
      <SettingGroup title={t('Verbindung')}>
        <dl className="server-facts">
          <dt>{t('Status')}</dt>
          <dd>{status?.message ? appMessage(status.message) : '–'}</dd>
          <dt>{t('Gerät')}</dt>
          <dd>{status?.device ?? '–'}</dd>
          <dt>ComfyUI</dt>
          <dd>{status?.version ?? '–'}</dd>
          <dt>{t('Pixelbench')}</dt>
          <dd>{window.location.origin}</dd>
        </dl>
      </SettingGroup>
      <SettingGroup title={t('Pixelbench-Server')}>
        <SettingRow
          id="server-restart"
          label={t('Server neu starten')}
          note={t('Beendet ComfyUI und startet beides neu. Die Seite verbindet sich danach von selbst.')}
        >
          <Button
            id="server-restart"
            className="secondary"
            icon="repeat"
            disabled={disabled}
            onClick={() => control('restart')}
          >
            {t('Neu starten')}
          </Button>
        </SettingRow>
        <SettingRow
          id="server-shutdown"
          label={t('Server beenden')}
          note={t('Beendet Pixelbench und ComfyUI. Neu starten geht dann nur im Terminal.')}
        >
          <Button
            id="server-shutdown"
            className="secondary danger"
            icon="power"
            disabled={disabled}
            onClick={() => control('shutdown')}
          >
            {t('Beenden')}
          </Button>
        </SettingRow>
        <p id="server-error" className="notice" role="alert" hidden={!error}>
          {error && appMessage(error)}
        </p>
      </SettingGroup>
    </>
  )
}
